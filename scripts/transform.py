#!/usr/bin/env python3
"""
Transform FEC bulk data + OpenLobby data into politicians.json for the corruption-map app.
"""

import json
import os
import re
import tempfile
import zipfile
from collections import defaultdict
from pathlib import Path

DOWNLOADS = Path.home() / "Downloads"
OUTPUT = Path(__file__).resolve().parent.parent / "public" / "data" / "politicians.json"

# FEC zip paths
CANDIDATE_ZIP = DOWNLOADS / "FEC Data - Candidate Master.zip"
PAS2_ZIP = DOWNLOADS / "FEC Data pas226.zip"
PAC_SUMMARY_ZIP = DOWNLOADS / "FEC Data - PAC summary.zip"

# OpenLobby paths
INDUSTRIES_JSON = DOWNLOADS / "openlobby data" / "Industries Data.json"
CLIENTS_JSON = DOWNLOADS / "openlobby data" / "Top Clients Data.json"

# Industry ID mapping (display name -> id used in app)
INDUSTRY_NAME_TO_ID = {
    "Finance": "finance",
    "Healthcare": "healthcare",
    "Energy & Environment": "energy",
    "Defense & Security": "defense",
    "Technology": "technology",
    "Transportation": "transportation",
    "Trade & Tariffs": "trade",
    "Labor & Education": "labor",
    "Agriculture & Food": "agriculture",
    "Real Estate & Housing": "real-estate",
}

MIN_PAC_DONATIONS_HOUSE = 50_000
MIN_PAC_DONATIONS_SENATE = 10_000


def extract_file(zip_path: Path, filename: str, tmp_dir: str) -> str:
    """Extract a file from a zip to tmp_dir, return path."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extract(filename, tmp_dir)
    return os.path.join(tmp_dir, filename)


def load_candidates(path: str) -> dict:
    """Load cn.txt -> {CAND_ID: {name, party, state, chamber}}. Only H/S.
    Keeps the most recent election year entry per candidate."""
    raw = {}  # cand_id -> (year, record)
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            cols = line.strip().split("|")
            if len(cols) < 7:
                continue
            cand_id = cols[0]
            raw_name = cols[1]
            party_code = cols[2]
            try:
                year = int(cols[3])
            except ValueError:
                year = 0
            state = cols[4]
            office = cols[5]

            if office not in ("H", "S"):
                continue

            # Keep latest year entry per candidate
            if cand_id in raw and raw[cand_id][0] >= year:
                continue

            if party_code == "REP":
                party = "R"
            elif party_code == "DEM":
                party = "D"
            else:
                party = "I"

            name = format_name(raw_name)
            chamber = "House" if office == "H" else "Senate"

            raw[cand_id] = (year, {
                "name": name,
                "party": party,
                "state": state,
                "chamber": chamber,
            })

    return {cid: record for cid, (_, record) in raw.items()}


def format_name(raw: str) -> str:
    """Convert 'LASTNAME, FIRSTNAME MIDDLE JR' to 'Firstname Lastname'."""
    raw = raw.strip()
    if "," in raw:
        parts = raw.split(",", 1)
        last = parts[0].strip().title()
        first_parts = parts[1].strip().split()
        if first_parts:
            first = first_parts[0].title()
            # Handle suffixes like Jr, Sr, III, II, IV
            suffixes = {"Jr", "Sr", "Ii", "Iii", "Iv"}
            if len(first_parts) > 1 and first_parts[-1].title() in suffixes:
                return f"{first} {last} {first_parts[-1].title()}"
            return f"{first} {last}"
        return last
    return raw.title()


def load_pac_names(path: str) -> dict:
    """Load webk26.txt -> {CMTE_ID: pac_name}."""
    pacs = {}
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            cols = line.strip().split("|")
            if len(cols) >= 2:
                pacs[cols[0]] = cols[1]
    return pacs


def build_industry_classifier(industries_data: list, clients_data: list) -> tuple:
    """
    Build:
    1. code_to_industry: {issue_code: industry_id}
    2. client_name_words: for fuzzy matching PAC names to clients
    Returns (code_to_industry, client_name_to_industry, keyword_rules)
    """
    # Map each code to the industry it belongs to
    code_to_industry = {}
    for ind in industries_data:
        ind_id = INDUSTRY_NAME_TO_ID[ind["name"]]
        for code in ind["codes"]:
            code_to_industry[code] = ind_id

    # Build client name -> industry mapping
    # For each client, look at their issue codes, find which industry has the most matching codes
    client_name_to_industry = {}
    for client in clients_data:
        issues = client.get("issues", [])
        if not issues:
            continue
        # Count how many codes match each industry
        industry_scores = defaultdict(int)
        for code in issues:
            if code in code_to_industry:
                industry_scores[code_to_industry[code]] += 1
        if industry_scores:
            best = max(industry_scores, key=industry_scores.get)
            # Normalize client name for matching
            norm = normalize_name(client["name"])
            client_name_to_industry[norm] = best

    # Keyword fallback rules (order matters — more specific first)
    keyword_rules = [
        # Finance — banks, investment, insurance, accounting
        (["bank", "bankers", "financial", "credit union", "credit", "invest",
          "securities", "insurance", "mutual fund", "accounting", "accountant",
          "cpa", "certified public", "ernst", "deloitte", "kpmg", "pwc",
          "pricewaterhouse", "hedge fund", "private equity", "brokerage",
          "aflac", "prudential", "fidelity", "schwab", "goldman", "morgan stanley",
          "citigroup", "jpmorgan", "wells fargo", "visa", "mastercard", "paypal"], "finance"),
        # Healthcare — medical, pharma, dental, optometry
        (["medical", "health", "hospital", "pharma", "drug", "dental", "nurse",
          "physician", "surgery", "biotech", "optometric", "optometry", "optomet",
          "chiropr", "podiatr", "therapeut", "clinical", "patient", "medicare",
          "medicaid", "anesthesi", "orthop", "dermat", "oncolog", "cardiol",
          "radiolog", "emergen", "ambulance", "pfizer", "merck", "abbott",
          "amgen", "johnson  johnson", "eli lilly", "astrazeneca", "novartis"], "healthcare"),
        # Energy — oil, gas, electric, mining, renewables
        (["oil", "petro", "energy", "gas ", " gas", "coal", "mining", "electric",
          "utility", "power", "fuel", "solar", "wind", "nuclear", "pipeline",
          "refin", "natural resource", "exxon", "chevron", "conocophillips",
          "halliburton", "schlumberger", "baker hughes", "devon energy",
          "marathon", "valero", "dominion energy", "duke energy",
          "southern company", "entergy", "exelon", "nextera"], "energy"),
        # Defense — military, veterans, intelligence
        (["defense", "military", "army", "navy", "air force", "veteran",
          "security", "homeland", "intelligence", "lockheed", "raytheon",
          "boeing", "northrop", "grumman", "general dynamics", "bae systems",
          "l3harris", "leidos", "saic", "booz allen", "palantir",
          "weapons", "missile", "combat", "tactical"], "defense"),
        # Technology
        (["tech", "software", "internet", "cyber", "data", "computer",
          "digital", "microsoft", "google", "apple inc", "amazon", "oracle",
          "ibm", "intel", "qualcomm", "cisco", "salesforce", "adobe",
          "semiconductor", "telecom", "broadband", "wireless", "comcast",
          "verizon", "at t", "att", "sprint", "t mobile", "cable",
          "satellite", "spectrum", "communications"], "technology"),
        # Transportation — airlines, pilots, auto, shipping, rail
        (["transport", "airline", "air line", "pilot", "aviation", "railroad",
          "trucking", "shipping", "auto ", "automobile", "motor", "vehicle",
          "car dealer", "ferry", "maritime", "freight", "logistics", "ups",
          "fedex", "rail", "transit", "highway", "road builder",
          "asphalt", "paving", "teamster"], "transportation"),
        # Trade & Tariffs
        (["trade", "tariff", "import", "export", "chamber of commerce",
          "foreign affairs", "international", "aipac", "israel public affairs"], "trade"),
        # Labor & Education
        (["labor", "union", "teacher", "education", "school", "university",
          "worker", "employ", "workforce", "seiu", "afscme", "ibew",
          "carpenters", "plumbers", "pipefitters", "ironworker",
          "sheet metal", "bricklayer", "painters", "machinists",
          "steelworker", "firefighter", "police", "fraternal order",
          "letter carrier", "postal"], "labor"),
        # Agriculture & Food
        (["farm", "agricul", "food", "dairy", "cattle", "grain", "crop",
          "livestock", "rancher", "sugar", "cotton", "tobacco", "corn",
          "soybean", "wheat", "poultry", "meat", "pork", "beef",
          "grower", "nursery", "horticultur", "forestry", "timber",
          "lumber", "beer", "wine", "spirit", "beverage", "distill"], "agriculture"),
        # Real Estate & Housing
        (["real estate", "realty", "realtor", "housing", "mortgage",
          "homebuilder", "home builder", "construction", "property",
          "apartment", "building", "contractor", "plumbing",
          "roofing", "architect", "engineer", "surveyor",
          "title", "escrow", "land", "develop"], "real-estate"),
    ]

    # Ideological / political PAC patterns — checked after keyword rules
    ideological_patterns = [
        "conservative", "liberal", "progressive", "freedom", "liberty",
        "patriot", "maga", "republican", "democrat", "gop",
        "leadership fund", "leadership pac", "victory fund", "victory pac",
        "majority pac", "majority fund", "action fund", "action pac",
        "future pac", "future fund", "rising pac", "values",
        "great america", "keep america", "america first", "american dream",
        "win it back", "fight to win", "hardworking american",
        "restore", "restoration", "renewal", "movement",
        "nrsc", "nrcc", "dccc", "dscc",
        "senate conservatives", "house freedom", "club for growth",
        "emilys list", "emily s list",
        "democracy project", "protect progress",
        "community pac", "mission pac", "your community",
        "fighter pac", "fighters", "excellence",
        "dlga", "hmp", "slf pac",
        "johnson leadership", "kentucky first", "northwoods future",
        "lone star", "illinois future", "defend american",
        "oversight action", "american mission",
    ]

    return code_to_industry, client_name_to_industry, keyword_rules, ideological_patterns


def normalize_name(name: str) -> str:
    """Normalize a name for fuzzy matching."""
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def classify_pac(pac_name: str, client_name_to_industry: dict, keyword_rules: list, ideological_patterns: list) -> str:
    """Classify a PAC into an industry ID."""
    if not pac_name:
        return "other"

    norm = normalize_name(pac_name)

    # Try direct match against client names
    if norm in client_name_to_industry:
        return client_name_to_industry[norm]

    # Try substring match — check if any client name is contained in PAC name or vice versa
    for client_norm, industry in client_name_to_industry.items():
        if len(client_norm) >= 6 and (client_norm in norm or norm in client_norm):
            return industry

    # Try matching just the core company name (first 2-3 significant words)
    norm_words = norm.split()
    if len(norm_words) >= 2:
        for n in (2, 3):
            prefix = " ".join(norm_words[:n])
            if len(prefix) >= 6:
                for client_norm, industry in client_name_to_industry.items():
                    if client_norm.startswith(prefix):
                        return industry

    # Industry keyword fallback
    for keywords, industry in keyword_rules:
        for kw in keywords:
            if kw in norm:
                return industry

    # Ideological / political PAC patterns
    for pattern in ideological_patterns:
        if pattern in norm:
            return "ideological"

    return "other"


def main():
    with tempfile.TemporaryDirectory() as tmp:
        print("Extracting FEC data...")
        cn_path = extract_file(CANDIDATE_ZIP, "cn.txt", tmp)
        pas2_path = extract_file(PAS2_ZIP, "itpas2.txt", tmp)
        pac_path = extract_file(PAC_SUMMARY_ZIP, "webk26.txt", tmp)

        print("Loading candidates...")
        candidates = load_candidates(cn_path)
        print(f"  {len(candidates)} House/Senate candidates loaded")

        print("Loading PAC names...")
        pac_names = load_pac_names(pac_path)
        print(f"  {len(pac_names)} PAC names loaded")

        print("Loading OpenLobby data...")
        with open(INDUSTRIES_JSON, "r") as f:
            industries_data = json.load(f)
        with open(CLIENTS_JSON, "r") as f:
            clients_data = json.load(f)

        print("Building industry classifier...")
        code_to_industry, client_name_to_industry, keyword_rules, ideological_patterns = build_industry_classifier(
            industries_data, clients_data
        )
        print(f"  {len(client_name_to_industry)} client-to-industry mappings")

        print("Processing PAC contributions (itpas2.txt)...")
        # {CAND_ID: {industry_id: total_amount}}
        cand_industry_totals = defaultdict(lambda: defaultdict(float))
        # {CAND_ID: {industry_id: {pac_name: amount}}} for top donor tracking
        cand_industry_donors = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))

        classified_count = 0
        other_count = 0
        rows_processed = 0

        with open(pas2_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                cols = line.strip().split("|")
                if len(cols) < 17:
                    continue

                cmte_id = cols[0]
                try:
                    amount = float(cols[14])
                except (ValueError, IndexError):
                    continue

                cand_id = cols[16] if len(cols) > 16 else ""

                if not cand_id or cand_id not in candidates:
                    continue

                rows_processed += 1

                pac_name = pac_names.get(cmte_id, "")
                industry = classify_pac(pac_name, client_name_to_industry, keyword_rules, ideological_patterns)

                if industry == "other":
                    other_count += 1
                else:
                    classified_count += 1

                cand_industry_totals[cand_id][industry] += amount
                if pac_name:
                    cand_industry_donors[cand_id][industry][pac_name] += amount

        print(f"  {rows_processed} contribution rows processed")
        print(f"  {classified_count} classified, {other_count} 'other'")

        print("Building output...")
        politicians = []
        for cand_id, ind_totals in cand_industry_totals.items():
            cand = candidates[cand_id]
            total = sum(ind_totals.values())
            threshold = MIN_PAC_DONATIONS_SENATE if cand["chamber"] == "Senate" else MIN_PAC_DONATIONS_HOUSE
            if total < threshold:
                continue

            # Build donations array sorted by amount desc
            donations = []
            for ind_id, amt in sorted(ind_totals.items(), key=lambda x: -x[1]):
                if amt <= 0:
                    continue
                # Find top donor for this industry
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
                "id": cand_id,
                "name": cand["name"],
                "state": cand["state"],
                "party": cand["party"],
                "chamber": cand["chamber"],
                "yearsInOffice": 0,
                "netWorthStart": 0,
                "netWorthCurrent": 0,
                "salary": 174000,
                "donations": donations,
                "voteAlignmentScore": 0,
                "suspiciousVotes": [],
            })

        # Sort by total donations desc
        politicians.sort(key=lambda p: -sum(d["amount"] for d in p["donations"]))

        print(f"\nFiltering: House >= ${MIN_PAC_DONATIONS_HOUSE:,}, Senate >= ${MIN_PAC_DONATIONS_SENATE:,}...")
        print(f"  {len(politicians)} politicians included")

        # Write output
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        with open(OUTPUT, "w") as f:
            json.dump(politicians, f, indent=2)
        print(f"\nWrote {OUTPUT}")

        # === Validation Summary ===
        print("\n" + "=" * 60)
        print("VALIDATION SUMMARY")
        print("=" * 60)

        print(f"\nTotal politicians: {len(politicians)}")

        chamber_counts = defaultdict(int)
        party_counts = defaultdict(int)
        for p in politicians:
            chamber_counts[p["chamber"]] += 1
            party_counts[p["party"]] += 1
        print(f"\nBy chamber:")
        for c, n in sorted(chamber_counts.items()):
            print(f"  {c}: {n}")
        print(f"\nBy party:")
        for p, n in sorted(party_counts.items()):
            print(f"  {p}: {n}")

        # Top industries
        ind_totals = defaultdict(int)
        for p in politicians:
            for d in p["donations"]:
                ind_totals[d["industryId"]] += d["amount"]
        print(f"\nTop 5 industries by total PAC spend:")
        for ind_id, total in sorted(ind_totals.items(), key=lambda x: -x[1])[:5]:
            print(f"  {ind_id}: ${total:,.0f}")

        # Top politicians
        print(f"\nTop 10 politicians by total PAC donations:")
        for p in politicians[:10]:
            total = sum(d["amount"] for d in p["donations"])
            print(f"  {p['name']} ({p['party']}-{p['state']}): ${total:,.0f}")

        # Classification stats
        total_classified = classified_count + other_count
        if total_classified > 0:
            print(f"\nPAC classification:")
            print(f"  Mapped to industry: {classified_count} ({classified_count/total_classified*100:.1f}%)")
            print(f"  'Other': {other_count} ({other_count/total_classified*100:.1f}%)")


if __name__ == "__main__":
    main()
