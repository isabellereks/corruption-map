"""Step 02: Load OpenSecrets data — PAC industry mapping + personal finances."""

import csv
import glob as globmod
from collections import defaultdict
from pathlib import Path

from tqdm import tqdm

from .utils import CONGRESSIONAL_SALARY, read_json, require_files, write_json

DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
RAW = DATA_ROOT / "raw" / "opensecrets"
OUTPUT = DATA_ROOT / "processed" / "opensecrets_enriched.json"


def load_pac_industry_map(path):
    """Load pac_industry.csv -> {CMTE_ID: {industry_name, industry_code}}.
    Maps PAC/committee IDs to their industry classification."""
    mapping = {}
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cmte_id = row.get("Cmte_ID", row.get("cmte_id", row.get("CMTE_ID", ""))).strip()
            industry = row.get("Industry", row.get("industry", row.get("Catname", ""))).strip()
            code = row.get("Catcode", row.get("catcode", row.get("Industry_Code", ""))).strip()
            if cmte_id and industry:
                mapping[cmte_id] = {
                    "industry_name": industry,
                    "industry_code": code,
                }
    return mapping


def load_personal_finances(finances_dir):
    """Load personal_finances/*.csv -> {name_key: [{year, min, max}]}.
    name_key is lowercase 'firstname lastname' for matching."""
    net_worth = defaultdict(list)
    csv_files = sorted(globmod.glob(str(finances_dir / "*.csv")))

    if not csv_files:
        return net_worth

    for csv_path in tqdm(csv_files, desc="    personal_finances"):
        # Try to extract year from filename (e.g., "2020.csv" or "personal_finances_2020.csv")
        filename = Path(csv_path).stem
        year = None
        for part in filename.replace("_", " ").replace("-", " ").split():
            if part.isdigit() and 2000 <= int(part) <= 2030:
                year = int(part)
                break

        with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("Name", row.get("name", row.get("member_name", ""))).strip()
                if not name:
                    continue

                # Parse net worth range (min/max)
                nw_min = parse_money(row.get("Net_Worth_Min", row.get("minimum", row.get("min", "0"))))
                nw_max = parse_money(row.get("Net_Worth_Max", row.get("maximum", row.get("max", "0"))))
                report_year = year
                if not report_year:
                    yr_field = row.get("Year", row.get("year", row.get("FilingYear", "")))
                    if yr_field and str(yr_field).strip().isdigit():
                        report_year = int(yr_field)

                if not report_year:
                    continue

                name_key = name.lower().strip()
                net_worth[name_key].append({
                    "year": report_year,
                    "min": nw_min,
                    "max": nw_max,
                })

    # Sort each politician's history by year
    for key in net_worth:
        net_worth[key].sort(key=lambda x: x["year"])

    return net_worth


def parse_money(value):
    """Parse a money string like '$1,234,567' or '1234567' to float."""
    if not value:
        return 0
    cleaned = str(value).replace("$", "").replace(",", "").replace(" ", "").strip()
    if cleaned.startswith("(") and cleaned.endswith(")"):
        cleaned = "-" + cleaned[1:-1]
    try:
        return float(cleaned)
    except ValueError:
        return 0


def match_net_worth(politician_name, net_worth_data):
    """Try to match a politician name to net worth data.
    Returns list of {year, min, max} or empty list."""
    name_lower = politician_name.lower().strip()

    # Direct match
    if name_lower in net_worth_data:
        return net_worth_data[name_lower]

    # Try last name, first name format
    parts = name_lower.split()
    if len(parts) >= 2:
        # Try "first last" -> various stored formats
        for key in net_worth_data:
            key_parts = key.split()
            if len(key_parts) >= 2:
                if parts[0] in key_parts and parts[-1] in key_parts:
                    return net_worth_data[key]

    return []


def run():
    """Execute step 02: Load OpenSecrets data."""
    fec_data = read_json(DATA_ROOT / "processed" / "fec_politicians.json")

    # Load PAC industry mapping
    pac_industry_path = RAW / "pac_industry.csv"
    pac_industry_map = {}
    if pac_industry_path.exists():
        print("  Loading PAC industry mapping...")
        pac_industry_map = load_pac_industry_map(pac_industry_path)
        print(f"    {len(pac_industry_map)} committee-to-industry mappings")

    # Enrich donations with OpenSecrets industry data
    enriched_industries = {}
    if pac_industry_map:
        for pol in fec_data:
            cand_id = pol["cand_id"]
            for cmte_id in pol.get("cmteIds", []):
                if cmte_id in pac_industry_map:
                    if cand_id not in enriched_industries:
                        enriched_industries[cand_id] = {}
                    enriched_industries[cand_id][cmte_id] = pac_industry_map[cmte_id]

    # Load personal finances
    finances_dir = RAW / "personal_finances"
    net_worth_data = {}
    if finances_dir.exists():
        print("  Loading personal finances...")
        net_worth_data = load_personal_finances(finances_dir)
        print(f"    {len(net_worth_data)} politicians with net worth data")

    # Build enriched output
    print("  Building enriched output...")
    results = []
    for pol in tqdm(fec_data, desc="    Enriching"):
        cand_id = pol["cand_id"]

        # Net worth history
        nw_history = match_net_worth(pol["name"], net_worth_data)

        # Compute net worth growth vs salary
        nw_growth_vs_salary = 0
        if len(nw_history) >= 2:
            start_avg = (nw_history[0]["min"] + nw_history[0]["max"]) / 2
            end_avg = (nw_history[-1]["min"] + nw_history[-1]["max"]) / 2
            years = nw_history[-1]["year"] - nw_history[0]["year"]
            if years > 0:
                expected_salary_growth = years * CONGRESSIONAL_SALARY
                actual_growth = end_avg - start_avg
                if expected_salary_growth > 0:
                    nw_growth_vs_salary = round(actual_growth / expected_salary_growth, 2)

        results.append({
            "cand_id": cand_id,
            "industryMap": enriched_industries.get(cand_id, {}),
            "netWorthHistory": nw_history,
            "netWorthGrowthVsSalary": nw_growth_vs_salary,
        })

    write_json(OUTPUT, results)
    with_nw = sum(1 for r in results if r["netWorthHistory"])
    print(f"    {with_nw}/{len(results)} politicians with net worth data")
    return {"record_count": len(results)}
