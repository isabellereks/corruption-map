"""Step 03: Load Voteview data — congressional votes matched to donor industries."""

from pathlib import Path

import pandas as pd
from tqdm import tqdm

from .utils import VOTE_INDUSTRY_KEYWORDS, read_json, require_files, write_json

DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
RAW = DATA_ROOT / "raw" / "voteview"
OUTPUT = DATA_ROOT / "processed" / "votes_matched.json"

# Congress numbers 115-119 (2017-2026)
MIN_CONGRESS = 115
MAX_CONGRESS = 119


def match_vote_to_industry(description):
    """Match a vote description to an industry using keyword mapping.
    Returns industry name or None."""
    if not description:
        return None

    desc_lower = description.lower()
    for industry, keywords in VOTE_INDUSTRY_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in desc_lower:
                return industry
    return None


def build_icpsr_to_cand_id(fec_data, members_df):
    """Build mapping from Voteview ICPSR number to FEC candidate ID.
    Uses name + state + chamber matching with fuzzy fallback."""
    from .utils import format_name, normalize_name

    icpsr_map = {}

    # Build lookup by (normalized_name, state, chamber) -> cand_id
    # Also index by (name, state) without chamber for cross-chamber matching
    fec_lookup = {}
    fec_by_state_chamber = {}
    fec_by_name_state = {}
    for pol in fec_data:
        norm = normalize_name(pol["name"])
        key = (norm, pol["state"], pol["chamber"])
        fec_lookup[key] = pol["cand_id"]
        sc_key = (pol["state"], pol["chamber"])
        if sc_key not in fec_by_state_chamber:
            fec_by_state_chamber[sc_key] = []
        fec_by_state_chamber[sc_key].append((norm, pol["cand_id"]))
        # Cross-chamber index: a House member running for Senate still has House votes
        ns_key = (norm, pol["state"])
        fec_by_name_state[ns_key] = pol["cand_id"]

    if members_df is None or members_df.empty:
        return icpsr_map

    # Filter to recent congresses only
    recent = members_df[members_df["congress"] >= 115]

    for _, row in recent.iterrows():
        icpsr = row.get("icpsr")
        if icpsr in icpsr_map:
            continue

        bioname = str(row.get("bioname", ""))
        state = str(row.get("state_abbrev", ""))
        chamber_raw = str(row.get("chamber", ""))
        if chamber_raw in ("House", "H"):
            chamber = "House"
        elif chamber_raw in ("Senate", "S"):
            chamber = "Senate"
        else:
            continue
        if not bioname:
            continue

        # format_name converts "CORNYN, John" -> "John Cornyn"
        formatted = format_name(bioname)
        norm = normalize_name(formatted)

        # Exact match (same chamber)
        key = (norm, state, chamber)
        if key in fec_lookup:
            icpsr_map[icpsr] = fec_lookup[key]
            continue

        # Cross-chamber exact match (e.g. House member now running for Senate)
        ns_key = (norm, state)
        if ns_key in fec_by_name_state:
            icpsr_map[icpsr] = fec_by_name_state[ns_key]
            continue

        # Fuzzy fallback — search both chambers for same state
        from thefuzz import fuzz
        best_score = 0
        best_id = None
        for search_chamber in (chamber, "House" if chamber == "Senate" else "Senate"):
            sc_key = (state, search_chamber)
            for cand_norm, cand_id in fec_by_state_chamber.get(sc_key, []):
                score = fuzz.token_sort_ratio(norm, cand_norm)
                if score > best_score:
                    best_score = score
                    best_id = cand_id
        if best_score >= 80:
            icpsr_map[icpsr] = best_id

    return icpsr_map


def run():
    """Execute step 03: Load Voteview data."""
    votes_path = RAW / "HSall_votes.csv"
    rollcalls_path = RAW / "HSall_rollcalls.csv"
    require_files([votes_path, rollcalls_path], "03_load_voteview")

    fec_data = read_json(DATA_ROOT / "processed" / "fec_politicians.json")

    # Load rollcalls (vote descriptions)
    print("  Loading rollcalls...")
    rollcalls_df = pd.read_csv(rollcalls_path, encoding="utf-8", low_memory=False)
    rollcalls_df = rollcalls_df[
        (rollcalls_df["congress"] >= MIN_CONGRESS) &
        (rollcalls_df["congress"] <= MAX_CONGRESS)
    ]
    print(f"    {len(rollcalls_df)} rollcalls in congresses {MIN_CONGRESS}-{MAX_CONGRESS}")

    # Build rollcall lookup: (congress, rollnumber) -> {desc, bill, date, chamber}
    rollcall_info = {}
    for _, row in rollcalls_df.iterrows():
        key = (int(row["congress"]), int(row["rollnumber"]))
        desc = str(row.get("vote_desc", row.get("vote_question", "")))
        bill = str(row.get("bill_number", ""))
        date = str(row.get("date", ""))
        chamber = str(row.get("chamber", ""))
        rollcall_info[key] = {
            "desc": desc,
            "bill": bill,
            "date": date,
            "chamber": chamber,
        }

    # Match rollcalls to industries
    industry_rollcalls = {}
    for key, info in rollcall_info.items():
        industry = match_vote_to_industry(info["desc"])
        if industry:
            industry_rollcalls[key] = industry

    print(f"    {len(industry_rollcalls)} rollcalls matched to donor industries")

    # Load votes
    print("  Loading individual votes...")
    votes_df = pd.read_csv(votes_path, encoding="utf-8", low_memory=False)
    votes_df = votes_df[
        (votes_df["congress"] >= MIN_CONGRESS) &
        (votes_df["congress"] <= MAX_CONGRESS)
    ]
    print(f"    {len(votes_df)} individual votes in range")

    # Try to load members file for ICPSR mapping
    members_path = RAW / "HSall_members.csv"
    members_df = None
    if members_path.exists():
        members_df = pd.read_csv(members_path, encoding="utf-8", low_memory=False)

    icpsr_to_cand = build_icpsr_to_cand_id(fec_data, members_df)
    print(f"    {len(icpsr_to_cand)} ICPSR-to-FEC mappings")

    # Build per-politician vote records
    print("  Matching votes to industries...")
    politician_votes = {}

    for _, row in tqdm(votes_df.iterrows(), total=len(votes_df), desc="    Votes"):
        icpsr = row.get("icpsr")
        congress = int(row.get("congress", 0))
        rollnumber = int(row.get("rollnumber", 0))
        cast_code = int(row.get("cast_code", 0))

        key = (congress, rollnumber)
        if key not in industry_rollcalls:
            continue

        cand_id = icpsr_to_cand.get(icpsr)
        if not cand_id:
            continue

        # cast_code: 1=Yea, 6=Nay
        if cast_code == 1:
            vote_str = "Yea"
        elif cast_code == 6:
            vote_str = "Nay"
        else:
            continue

        info = rollcall_info[key]
        industry = industry_rollcalls[key]

        if cand_id not in politician_votes:
            politician_votes[cand_id] = []

        politician_votes[cand_id].append({
            "rollnumber": rollnumber,
            "congress": congress,
            "desc": info["desc"],
            "bill": info["bill"],
            "date": info["date"],
            "yea_or_nay": vote_str,
            "industry": industry,
        })

    # Build output
    results = []
    for cand_id, votes in politician_votes.items():
        results.append({
            "cand_id": cand_id,
            "relevantVotes": votes,
        })

    write_json(OUTPUT, results)
    total_votes = sum(len(r["relevantVotes"]) for r in results)
    print(f"    {len(results)} politicians with {total_votes} industry-relevant votes")
    return {"record_count": len(results)}
