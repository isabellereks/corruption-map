"""Step 01: Load FEC data — candidates, PAC contributions, lobbyist bundling."""

import csv
from collections import defaultdict
from pathlib import Path

from tqdm import tqdm

from .utils import (
    build_industry_classifier,
    classify_pac,
    format_name,
    load_candidates,
    read_json,
    require_files,
    write_json,
)

DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
RAW = DATA_ROOT / "raw" / "fec"
OUTPUT = DATA_ROOT / "processed" / "fec_politicians.json"


def load_pac_names(path):
    """Load committee master file -> {CMTE_ID: pac_name}.
    Handles both webk*.txt (pipe-delimited) and ccl.txt formats."""
    pacs = {}
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            cols = line.strip().split("|")
            if len(cols) >= 2:
                pacs[cols[0]] = cols[1]
    return pacs


def load_ccl(path):
    """Load candidate-committee linkage -> {CMTE_ID: CAND_ID}."""
    linkage = {}
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            cols = line.strip().split("|")
            if len(cols) >= 2:
                cand_id = cols[0]
                cmte_id = cols[3] if len(cols) > 3 else cols[1]
                linkage[cmte_id] = cand_id
    return linkage


def load_lobbyist_bundled(path, candidates):
    """Load lobbyist bundled contributions CSV.
    Returns {cand_id: total_bundled_amount}."""
    bundled = defaultdict(float)
    if not path.exists():
        return bundled

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cand_id = row.get("CAND_ID", row.get("cand_id", "")).strip()
            try:
                amount = float(row.get("BUNDLED_AMOUNT", row.get("bundled_amount", 0)))
            except (ValueError, TypeError):
                continue
            if cand_id in candidates:
                bundled[cand_id] += amount

    return bundled


def run():
    """Execute step 01: Load FEC data."""
    required = [RAW / "cn.txt", RAW / "pas2.txt"]
    require_files(required, "01_load_fec")

    print("  Loading candidates from cn.txt...")
    candidates = load_candidates(RAW / "cn.txt")
    print(f"    {len(candidates)} House/Senate candidates")

    # Load committee-candidate linkage if available
    ccl_path = RAW / "ccl.txt"
    ccl = load_ccl(ccl_path) if ccl_path.exists() else {}
    if ccl:
        print(f"    {len(ccl)} committee-candidate links loaded")

    # Load PAC names from webk26.txt (committee master)
    pac_names_path = RAW / "webk26.txt"
    pac_names = load_pac_names(pac_names_path) if pac_names_path.exists() else {}
    if pac_names:
        print(f"    {len(pac_names)} PAC names loaded from webk26.txt")

    # Build industry classifier if OpenLobby data available
    openlobby_industries = DATA_ROOT / "raw" / "openlobby" / "industries.json"
    openlobby_clients = DATA_ROOT / "raw" / "openlobby" / "Top Clients Data.json"
    client_name_to_industry = {}
    if openlobby_industries.exists() and openlobby_clients.exists():
        industries_data = read_json(openlobby_industries)
        clients_data = read_json(openlobby_clients)
        client_name_to_industry = build_industry_classifier(industries_data, clients_data)
        print(f"    {len(client_name_to_industry)} client-to-industry mappings")

    # Process PAC contributions from pas2.txt
    print("  Processing PAC contributions from pas2.txt...")
    cand_industry_totals = defaultdict(lambda: defaultdict(float))
    cand_industry_donors = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    cand_cmte_ids = defaultdict(set)
    rows_processed = 0
    skipped = 0

    pas2_path = RAW / "pas2.txt"
    total_lines = sum(1 for _ in open(pas2_path, "r", encoding="utf-8", errors="replace"))

    with open(pas2_path, "r", encoding="utf-8", errors="replace") as f:
        for line in tqdm(f, total=total_lines, desc="    pas2.txt"):
            cols = line.strip().split("|")
            if len(cols) < 15:
                skipped += 1
                continue

            cmte_id = cols[0]
            try:
                amount = float(cols[14])
            except (ValueError, IndexError):
                skipped += 1
                continue

            cand_id = cols[16] if len(cols) > 16 else ""
            if not cand_id or cand_id not in candidates:
                continue

            rows_processed += 1
            cand_cmte_ids[cand_id].add(cmte_id)

            pac_name = pac_names.get(cmte_id, "")

            industry = classify_pac(pac_name, client_name_to_industry)
            cand_industry_totals[cand_id][industry] += amount
            if pac_name:
                cand_industry_donors[cand_id][industry][pac_name] += amount

    print(f"    {rows_processed} contributions processed, {skipped} rows skipped")

    # Load lobbyist bundled contributions
    lob_path = RAW / "lob_bundled.csv"
    lobbyist_bundled = load_lobbyist_bundled(lob_path, candidates)
    if lobbyist_bundled:
        print(f"    {len(lobbyist_bundled)} candidates with lobbyist bundled contributions")

    # Build output
    print("  Building output...")
    politicians = []
    for cand_id, ind_totals in cand_industry_totals.items():
        cand = candidates[cand_id]
        total_raised = sum(ind_totals.values())

        donations = []
        for ind_id, amt in sorted(ind_totals.items(), key=lambda x: -x[1]):
            if amt <= 0:
                continue
            donors = cand_industry_donors[cand_id][ind_id]
            top_donor = max(donors, key=donors.get) if donors else ""
            donations.append({
                "industryId": ind_id,
                "amount": round(amt),
                "topDonor": top_donor,
            })

        if not donations:
            continue

        politicians.append({
            "cand_id": cand_id,
            "name": cand["name"],
            "party": cand["party"],
            "state": cand["state"],
            "chamber": cand["chamber"],
            "donations": donations,
            "totalRaised": round(total_raised),
            "lobbyistBundled": round(lobbyist_bundled.get(cand_id, 0)),
            "cmteIds": list(cand_cmte_ids.get(cand_id, [])),
        })

    politicians.sort(key=lambda p: -p["totalRaised"])
    write_json(OUTPUT, politicians)
    print(f"    {len(politicians)} politicians with PAC donations")
    return {"record_count": len(politicians)}
