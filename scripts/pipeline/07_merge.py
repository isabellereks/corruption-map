"""Step 07: Merge all processed data into final politicians.json."""

import shutil
from datetime import datetime, timezone
from pathlib import Path

from .utils import read_json, write_json

DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
PUBLIC_OUTPUT = Path(__file__).resolve().parent.parent.parent / "public" / "data" / "politicians.json"
OUTPUT = DATA_ROOT / "politicians.json"


def normalize_dime_score(score, min_score=-2, max_score=2):
    """Normalize DIME CFscore from [-2, 2] range to [0, 100]."""
    clamped = max(min_score, min(max_score, score))
    return round(((clamped - min_score) / (max_score - min_score)) * 100, 1)


def run():
    """Execute step 07: Merge all data into final politicians.json."""
    processed = DATA_ROOT / "processed"

    # Load all processed files
    fec_data = read_json(processed / "fec_politicians.json")

    # Optional enrichment files — load if they exist
    opensecrets_data = {}
    opensecrets_path = processed / "opensecrets_enriched.json"
    if opensecrets_path.exists():
        for r in read_json(opensecrets_path):
            opensecrets_data[r["cand_id"]] = r

    votes_data = {}
    votes_path = processed / "votes_matched.json"
    if votes_path.exists():
        for r in read_json(votes_path):
            votes_data[r["cand_id"]] = r

    dime_data = {}
    dime_path = processed / "dime_enriched.json"
    if dime_path.exists():
        for r in read_json(dime_path):
            dime_data[r["cand_id"]] = r

    openlobby_data = {}
    openlobby_path = processed / "openlobby_enriched.json"
    if openlobby_path.exists():
        for r in read_json(openlobby_path):
            openlobby_data[r["cand_id"]] = r

    vote_scores_data = {}
    scores_path = processed / "vote_scores.json"
    if scores_path.exists():
        for r in read_json(scores_path):
            vote_scores_data[r["cand_id"]] = r

    print("  Data sources loaded:")
    print(f"    FEC politicians: {len(fec_data)}")
    print(f"    OpenSecrets enriched: {len(opensecrets_data)}")
    print(f"    Votes matched: {len(votes_data)}")
    print(f"    DIME scores: {len(dime_data)}")
    print(f"    OpenLobby records: {len(openlobby_data)}")
    print(f"    Vote scores: {len(vote_scores_data)}")

    # Deduplicate FEC records — same person may have House + Senate entries
    # Group by name+state, keep the highest-funded record but inherit enrichment from any ID
    from collections import defaultdict
    name_state_groups = defaultdict(list)
    for pol in fec_data:
        key = (pol["name"].lower().strip(), pol["state"])
        name_state_groups[key].append(pol)

    deduped_fec = []
    # Map: any cand_id for this person -> all cand_ids (for looking up enrichment)
    alt_ids = {}
    for key, group in name_state_groups.items():
        # Pick the record with highest totalRaised as primary
        primary = max(group, key=lambda p: p.get("totalRaised", 0))
        all_ids = [p["cand_id"] for p in group]
        for cid in all_ids:
            alt_ids[cid] = all_ids
        deduped_fec.append(primary)

    # Build set of cand_ids that have voting records (i.e. currently/recently in office)
    has_votes_ids = set()
    for cid in votes_data:
        has_votes_ids.add(cid)
    for cid in vote_scores_data:
        has_votes_ids.add(cid)
    # Also check via alt_ids
    in_office_ids = set()
    for cid in has_votes_ids:
        for alt in alt_ids.get(cid, [cid]):
            in_office_ids.add(alt)

    print(f"  Deduplicated: {len(fec_data)} -> {len(deduped_fec)} politicians")
    print(f"  In office (have voting record): {sum(1 for p in deduped_fec if p['cand_id'] in in_office_ids or any(a in in_office_ids for a in alt_ids.get(p['cand_id'], [])))}")

    def lookup_any_id(data_dict, cand_id):
        """Look up enrichment data trying all alternate IDs for this person."""
        result = data_dict.get(cand_id, {})
        if result:
            return result
        for alt in alt_ids.get(cand_id, []):
            result = data_dict.get(alt, {})
            if result:
                return result
        return {}

    # Merge
    print("  Merging...")
    now = datetime.now(timezone.utc).isoformat()
    politicians = []

    for pol in deduped_fec:
        cand_id = pol["cand_id"]
        os_data = lookup_any_id(opensecrets_data, cand_id)
        dime = lookup_any_id(dime_data, cand_id)
        lobby = lookup_any_id(openlobby_data, cand_id)
        scores = lookup_any_id(vote_scores_data, cand_id)

        # Donations (keep existing format for frontend compatibility)
        donations = pol.get("donations", [])

        # Top donors — top 5 by amount across all industries
        top_donors = sorted(
            [{"name": d["topDonor"], "amount": d["amount"], "industry": d["industryId"]}
             for d in donations if d.get("topDonor")],
            key=lambda x: -x["amount"]
        )[:5]

        total_raised = pol.get("totalRaised", 0)

        # Net worth
        nw_history = os_data.get("netWorthHistory", [])
        nw_growth = os_data.get("netWorthGrowthVsSalary", 0)

        # Vote alignment
        vote_alignment = scores.get("voteAlignmentScore", 0)
        suspicious_votes = scores.get("suspiciousVotes", [])

        # DIME score
        dime_score = dime.get("dimeScore", 0)

        # Revolving door
        former_lobbyist = lobby.get("formerLobbyist", False)
        became_lobbyist = lobby.get("becameLobbyist", False)
        revolving_connections = lobby.get("revolvingDoorConnections", [])

        # Compute donationConcentration
        donation_concentration = 0
        if total_raised > 0 and donations:
            # Filter out 'other' and 'ideological' for top industry
            real_donations = [d for d in donations if d["industryId"] not in ("other", "ideological")]
            if real_donations:
                top_industry_amount = real_donations[0]["amount"]
                donation_concentration = (top_industry_amount / total_raised) * 100

        # Compute combinedCaptureScore
        dime_normalized = normalize_dime_score(dime_score) if dime_score else 0
        combined_capture_score = round(
            (vote_alignment * 0.5) +
            (dime_normalized * 0.3) +
            (donation_concentration * 0.2),
            1
        )

        # Determine if currently/recently in office (has voting record in congress 115-119)
        is_in_office = cand_id in in_office_ids or any(
            a in in_office_ids for a in alt_ids.get(cand_id, [])
        )

        politicians.append({
            "id": cand_id,
            "name": pol["name"],
            "party": pol["party"],
            "state": pol["state"],
            "chamber": pol["chamber"],
            "status": "office" if is_in_office else "candidate",
            "donations": donations,
            "topDonors": top_donors,
            "totalRaised": total_raised,
            "lobbyistBundled": pol.get("lobbyistBundled", 0),
            "netWorthHistory": nw_history,
            "netWorthGrowthVsSalary": nw_growth,
            "voteAlignmentScore": vote_alignment,
            "dimeScore": dime_score,
            "combinedCaptureScore": combined_capture_score,
            "suspiciousVotes": suspicious_votes,
            "formerLobbyist": former_lobbyist,
            "becameLobbyist": became_lobbyist,
            "revolvingDoorConnections": revolving_connections,
            "yearsInOffice": 0,
            "netWorthStart": nw_history[0]["min"] if nw_history else 0,
            "netWorthCurrent": nw_history[-1]["max"] if nw_history else 0,
            "salary": 174000,
            "lastUpdated": now,
        })

    # Sort by combinedCaptureScore descending
    politicians.sort(key=lambda p: -p["combinedCaptureScore"])

    # Write output
    write_json(OUTPUT, politicians)

    # Copy to public/data/ for frontend
    PUBLIC_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(OUTPUT, PUBLIC_OUTPUT)
    print(f"  Copied to {PUBLIC_OUTPUT}")

    # Completeness report
    print(f"\n  === COMPLETENESS REPORT ===")
    print(f"  Total politicians: {len(politicians)}")
    with_nw = sum(1 for p in politicians if p["netWorthHistory"])
    with_votes = sum(1 for p in politicians if p["voteAlignmentScore"] > 0)
    with_dime = sum(1 for p in politicians if p["dimeScore"] != 0)
    with_lobby = sum(1 for p in politicians if p["formerLobbyist"] or p["becameLobbyist"])
    with_suspicious = sum(1 for p in politicians if p["suspiciousVotes"])

    total = len(politicians) or 1
    print(f"  Net worth data:     {with_nw}/{total} ({with_nw/total*100:.1f}%)")
    print(f"  Vote scores:        {with_votes}/{total} ({with_votes/total*100:.1f}%)")
    print(f"  DIME scores:        {with_dime}/{total} ({with_dime/total*100:.1f}%)")
    print(f"  Revolving door:     {with_lobby}/{total} ({with_lobby/total*100:.1f}%)")
    print(f"  Suspicious votes:   {with_suspicious}/{total} ({with_suspicious/total*100:.1f}%)")

    return {"record_count": len(politicians)}
