"""Step 04: Load Stanford DIME data — ideology scores via fuzzy matching."""

from pathlib import Path

import pandas as pd
from tqdm import tqdm

from .utils import fuzzy_match_politician, read_json, require_files, write_json

DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
RAW = DATA_ROOT / "raw" / "dime"
OUTPUT = DATA_ROOT / "processed" / "dime_enriched.json"


def run():
    """Execute step 04: Load Stanford DIME data."""
    dime_path = RAW / "dime_recipients.csv"
    require_files([dime_path], "04_load_dime")

    fec_data = read_json(DATA_ROOT / "processed" / "fec_politicians.json")

    # Build candidate list for matching
    candidates = [
        {"cand_id": p["cand_id"], "name": p["name"], "state": p["state"], "chamber": p["chamber"]}
        for p in fec_data
    ]

    # Load DIME data
    print("  Loading DIME recipients...")
    dime_df = pd.read_csv(dime_path, encoding="utf-8", low_memory=False)
    print(f"    {len(dime_df)} DIME records loaded")

    # Identify relevant columns
    name_col = None
    for col in ["name", "recipient.name", "Name", "lname"]:
        if col in dime_df.columns:
            name_col = col
            break

    state_col = None
    for col in ["state", "recipient.state", "State"]:
        if col in dime_df.columns:
            state_col = col
            break

    chamber_col = None
    for col in ["seat", "chamber", "recipient.seat", "office"]:
        if col in dime_df.columns:
            chamber_col = col
            break

    cfscore_col = None
    for col in ["recipient.cfscore", "cfscore", "cfscores.dyn", "recipient.cfscore.dyn"]:
        if col in dime_df.columns:
            cfscore_col = col
            break

    if not name_col or not cfscore_col:
        print(f"    WARNING: Could not identify required columns. Found: {list(dime_df.columns[:20])}")
        write_json(OUTPUT, [])
        return {"record_count": 0}

    print(f"    Using columns: name={name_col}, state={state_col}, chamber={chamber_col}, cfscore={cfscore_col}")

    # Match DIME records to FEC politicians
    print("  Matching DIME records to FEC politicians...")
    matched = {}

    for _, row in tqdm(dime_df.iterrows(), total=len(dime_df), desc="    DIME matching"):
        name = str(row.get(name_col, "")).strip()
        if not name or name == "nan":
            continue

        state = str(row.get(state_col, "")).strip().upper() if state_col else ""
        chamber_raw = str(row.get(chamber_col, "")).strip().lower() if chamber_col else ""

        # Normalize chamber value
        if chamber_raw in ("federal:house", "house", "h"):
            chamber = "House"
        elif chamber_raw in ("federal:senate", "senate", "s"):
            chamber = "Senate"
        else:
            continue

        try:
            cfscore = float(row[cfscore_col])
        except (ValueError, TypeError):
            continue

        if not state or len(state) != 2:
            continue

        cand_id = fuzzy_match_politician(name, state, chamber, candidates)
        if cand_id and cand_id not in matched:
            matched[cand_id] = cfscore

    # Build output
    results = [
        {"cand_id": cand_id, "dimeScore": round(score, 4)}
        for cand_id, score in matched.items()
    ]

    write_json(OUTPUT, results)
    print(f"    {len(results)} politicians matched with DIME scores")
    return {"record_count": len(results)}
