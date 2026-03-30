"""Step 06: LLM vote scoring via Claude API.

Uses batched prompts — sends all of a politician's relevant votes in one API call
to minimize cost and time. ~513 calls instead of ~97K."""

import json
import time
from pathlib import Path

from tqdm import tqdm

from .utils import (
    INDUSTRY_LOBBYING_POSITIONS,
    read_json,
    read_progress,
    require_files,
    write_json,
    write_progress,
)

DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
PROGRESS_PATH = Path(__file__).resolve().parent.parent / ".progress.json"
OUTPUT = DATA_ROOT / "processed" / "vote_scores.json"

MAX_REQUESTS_PER_MINUTE = 50
REQUEST_INTERVAL = 60.0 / MAX_REQUESTS_PER_MINUTE
MAX_VOTES_PER_BATCH = 20  # Keep prompt size manageable


def build_batch_prompt(name, top_industry, votes):
    """Build a batched prompt that scores multiple votes at once."""
    positions_text = "\n".join(
        f"- {ind}: {pos}" for ind, pos in INDUSTRY_LOBBYING_POSITIONS.items()
    )

    votes_text = ""
    for i, v in enumerate(votes, 1):
        votes_text += f"\n{i}. Industry: {v['industry']}\n"
        votes_text += f"   Bill: {v.get('bill', 'N/A')}\n"
        votes_text += f"   Description: {v['desc']}\n"
        votes_text += f"   Vote: {v['yea_or_nay']}\n"

    return f"""You are a political analyst scoring whether congressional votes served the interests of industry donors.

Politician: {name}
Top donor industry: {top_industry}

Known industry lobbying positions:
{positions_text}

Score each of these {len(votes)} votes:
{votes_text}
Return ONLY a JSON array, no other text. For each vote:
{{"index": 1, "score": 1, "confidence": "high", "reason": "one sentence max"}}

Where score: 1=served donor interest, 0=neutral, -1=against donor interest
And confidence: high/medium/low"""


def score_batch(client, name, top_industry, votes, retries=3):
    """Score a batch of votes in one API call. Returns list of result dicts."""
    prompt = build_batch_prompt(name, top_industry, votes)

    for attempt in range(retries):
        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()

            # Parse JSON array
            start = text.index("[")
            end = text.rindex("]") + 1
            results = json.loads(text[start:end])

            if isinstance(results, list) and len(results) > 0:
                return results
        except (json.JSONDecodeError, ValueError):
            pass
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"      API error (attempt {attempt + 1}): {e}. Retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"      API error after {retries} attempts: {e}")
                return None

    return None


def run():
    """Execute step 06: Score votes via Claude API (batched)."""
    import anthropic

    votes_path = DATA_ROOT / "processed" / "votes_matched.json"
    fec_path = DATA_ROOT / "processed" / "fec_politicians.json"
    require_files([votes_path, fec_path], "06_score_votes")

    votes_data = read_json(votes_path)
    fec_data = read_json(fec_path)

    # Build lookups
    name_lookup = {p["cand_id"]: p["name"] for p in fec_data}
    top_industry_lookup = {}
    for pol in fec_data:
        if pol["donations"]:
            real_donations = [d for d in pol["donations"] if d["industryId"] not in ("other", "ideological")]
            if real_donations:
                top_industry_lookup[pol["cand_id"]] = real_donations[0]["industryId"]

    # Load existing scores for resumability
    progress = read_progress(PROGRESS_PATH)
    scored_ids = set(progress.get("steps", {}).get("06_score_votes", {}).get("scored_ids", []))
    existing_scores = []
    if OUTPUT.exists() and scored_ids:
        existing_scores = read_json(OUTPUT)

    # Initialize Claude client
    client = anthropic.Anthropic()

    # Filter to unscored politicians
    politicians_to_score = [v for v in votes_data if v["cand_id"] not in scored_ids]
    print(f"  {len(politicians_to_score)} politicians to score ({len(scored_ids)} already done)")

    results = {s["cand_id"]: s for s in existing_scores}
    last_request_time = 0
    api_calls = 0

    for pol_votes in tqdm(politicians_to_score, desc="    Scoring"):
        cand_id = pol_votes["cand_id"]
        name = name_lookup.get(cand_id, "Unknown")
        relevant_votes = pol_votes.get("relevantVotes", [])

        if not relevant_votes:
            results[cand_id] = {
                "cand_id": cand_id,
                "voteAlignmentScore": 0,
                "suspiciousVotes": [],
            }
            scored_ids.add(cand_id)
            continue

        # Filter to votes with known industry positions
        scorable = [v for v in relevant_votes if v.get("industry") in INDUSTRY_LOBBYING_POSITIONS]
        if not scorable:
            results[cand_id] = {
                "cand_id": cand_id,
                "voteAlignmentScore": 0,
                "suspiciousVotes": [],
            }
            scored_ids.add(cand_id)
            continue

        # Limit to most relevant votes (cap at MAX_VOTES_PER_BATCH)
        top_industry = top_industry_lookup.get(cand_id, "")
        scorable = scorable[:MAX_VOTES_PER_BATCH]

        # Rate limiting
        now = time.time()
        elapsed = now - last_request_time
        if elapsed < REQUEST_INTERVAL:
            time.sleep(REQUEST_INTERVAL - elapsed)

        batch_results = score_batch(client, name, top_industry, scorable)
        last_request_time = time.time()
        api_calls += 1

        vote_scores = []
        if batch_results:
            for res in batch_results:
                idx = res.get("index", 0) - 1  # 1-indexed in prompt
                if 0 <= idx < len(scorable) and res.get("confidence") != "low":
                    vote = scorable[idx]
                    vote_scores.append({
                        "bill": vote.get("bill", ""),
                        "description": vote.get("desc", ""),
                        "industryId": vote.get("industry", ""),
                        "howTheyVoted": vote.get("yea_or_nay", ""),
                        "alignmentScore": res.get("score", 0),
                        "confidence": res.get("confidence", ""),
                        "reason": res.get("reason", ""),
                    })

        # Compute voteAlignmentScore
        non_neutral = [v for v in vote_scores if v["alignmentScore"] != 0]
        aligned = [v for v in non_neutral if v["alignmentScore"] == 1]
        alignment_score = round((len(aligned) / len(non_neutral)) * 100) if non_neutral else 0

        # Suspicious votes = those that aligned with donor interests
        suspicious = [v for v in vote_scores if v["alignmentScore"] == 1]

        results[cand_id] = {
            "cand_id": cand_id,
            "voteAlignmentScore": alignment_score,
            "suspiciousVotes": suspicious,
        }

        # Save progress
        scored_ids.add(cand_id)
        progress.setdefault("steps", {})["06_score_votes"] = {
            "status": "in_progress",
            "scored_ids": list(scored_ids),
        }
        write_progress(PROGRESS_PATH, progress)

    # Write final output
    final_results = list(results.values())
    write_json(OUTPUT, final_results)

    scored_count = sum(1 for r in final_results if r["voteAlignmentScore"] > 0)
    print(f"    {scored_count}/{len(final_results)} politicians with non-zero alignment scores")
    print(f"    {api_calls} API calls made")
    return {"record_count": len(final_results)}
