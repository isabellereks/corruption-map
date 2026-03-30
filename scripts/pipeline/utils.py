"""Shared utilities for the data pipeline, extracted from transform.py."""

import json
import re
from collections import defaultdict
from pathlib import Path

CONGRESSIONAL_SALARY = 174_000

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

KEYWORD_RULES = [
    (["bank", "bankers", "financial", "credit union", "credit", "invest",
      "securities", "insurance", "mutual fund", "accounting", "accountant",
      "cpa", "certified public", "ernst", "deloitte", "kpmg", "pwc",
      "pricewaterhouse", "hedge fund", "private equity", "brokerage",
      "aflac", "prudential", "fidelity", "schwab", "goldman", "morgan stanley",
      "citigroup", "jpmorgan", "wells fargo", "visa", "mastercard", "paypal"], "finance"),
    (["medical", "health", "hospital", "pharma", "drug", "dental", "nurse",
      "physician", "surgery", "biotech", "optometric", "optometry", "optomet",
      "chiropr", "podiatr", "therapeut", "clinical", "patient", "medicare",
      "medicaid", "anesthesi", "orthop", "dermat", "oncolog", "cardiol",
      "radiolog", "emergen", "ambulance", "pfizer", "merck", "abbott",
      "amgen", "johnson  johnson", "eli lilly", "astrazeneca", "novartis"], "healthcare"),
    (["oil", "petro", "energy", "gas ", " gas", "coal", "mining", "electric",
      "utility", "power", "fuel", "solar", "wind", "nuclear", "pipeline",
      "refin", "natural resource", "exxon", "chevron", "conocophillips",
      "halliburton", "schlumberger", "baker hughes", "devon energy",
      "marathon", "valero", "dominion energy", "duke energy",
      "southern company", "entergy", "exelon", "nextera"], "energy"),
    (["defense", "military", "army", "navy", "air force", "veteran",
      "security", "homeland", "intelligence", "lockheed", "raytheon",
      "boeing", "northrop", "grumman", "general dynamics", "bae systems",
      "l3harris", "leidos", "saic", "booz allen", "palantir",
      "weapons", "missile", "combat", "tactical"], "defense"),
    (["tech", "software", "internet", "cyber", "data", "computer",
      "digital", "microsoft", "google", "apple inc", "amazon", "oracle",
      "ibm", "intel", "qualcomm", "cisco", "salesforce", "adobe",
      "semiconductor", "telecom", "broadband", "wireless", "comcast",
      "verizon", "at t", "att", "sprint", "t mobile", "cable",
      "satellite", "spectrum", "communications"], "technology"),
    (["transport", "airline", "air line", "pilot", "aviation", "railroad",
      "trucking", "shipping", "auto ", "automobile", "motor", "vehicle",
      "car dealer", "ferry", "maritime", "freight", "logistics", "ups",
      "fedex", "rail", "transit", "highway", "road builder",
      "asphalt", "paving", "teamster"], "transportation"),
    (["trade", "tariff", "import", "export", "chamber of commerce",
      "foreign affairs", "international", "aipac", "israel public affairs"], "trade"),
    (["labor", "union", "teacher", "education", "school", "university",
      "worker", "employ", "workforce", "seiu", "afscme", "ibew",
      "carpenters", "plumbers", "pipefitters", "ironworker",
      "sheet metal", "bricklayer", "painters", "machinists",
      "steelworker", "firefighter", "police", "fraternal order",
      "letter carrier", "postal"], "labor"),
    (["farm", "agricul", "food", "dairy", "cattle", "grain", "crop",
      "livestock", "rancher", "sugar", "cotton", "tobacco", "corn",
      "soybean", "wheat", "poultry", "meat", "pork", "beef",
      "grower", "nursery", "horticultur", "forestry", "timber",
      "lumber", "beer", "wine", "spirit", "beverage", "distill"], "agriculture"),
    (["real estate", "realty", "realtor", "housing", "mortgage",
      "homebuilder", "home builder", "construction", "property",
      "apartment", "building", "contractor", "plumbing",
      "roofing", "architect", "engineer", "surveyor",
      "title", "escrow", "land", "develop"], "real-estate"),
]

IDEOLOGICAL_PATTERNS = [
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

# Vote-to-industry keyword mapping for Voteview matching
VOTE_INDUSTRY_KEYWORDS = {
    "Oil & Gas": ["pipeline", "drilling", "fossil", "carbon", "ANWR",
                   "energy production", "oil", "gas", "LNG"],
    "Pharma": ["drug pricing", "prescription", "pharmaceutical", "patent",
               "FDA", "Medicare negotiation", "biosimilar"],
    "Finance": ["Dodd-Frank", "banking", "securities", "CFPB", "fiduciary",
                "Wall Street", "deregulation", "crypto"],
    "Defense": ["NDAA", "defense spending", "military", "Pentagon",
                "weapons", "armed forces", "contractor"],
    "Health Insurance": ["ACA", "Affordable Care Act", "public option",
                         "Medicaid", "insurance", "premium"],
    "Telecom": ["net neutrality", "FCC", "broadband", "spectrum",
                "internet", "telecommunications"],
    "Agribusiness": ["farm bill", "USDA", "crop insurance", "subsidy",
                     "pesticide", "GMO", "EPA agriculture"],
}

# Industry lobbying positions for Claude API scoring prompt
INDUSTRY_LOBBYING_POSITIONS = {
    "Oil & Gas": "opposes carbon taxes, climate regulation, supports drilling rights, pipeline approvals",
    "Pharma": "opposes drug price negotiation, supports patent extension, opposes Medicare negotiation",
    "Finance": "opposes Dodd-Frank restrictions, supports deregulation, opposes consumer protection rules",
    "Defense": "supports defense spending increases, opposes military cuts, supports weapons contracts",
    "Health Insurance": "opposes public option, opposes ACA expansion, supports private market protection",
    "Telecom": "opposes net neutrality, supports spectrum rights, opposes broadband regulation",
    "Agribusiness": "supports farm subsidies, opposes EPA regulations, supports GMO deregulation",
}


def format_name(raw):
    """Convert 'LASTNAME, FIRSTNAME MIDDLE JR' to 'Firstname Lastname'."""
    raw = raw.strip()
    if "," in raw:
        parts = raw.split(",", 1)
        last = parts[0].strip().title()
        first_parts = parts[1].strip().split()
        # Filter out honorifics and duplicates
        skip = {"hon", "hon.", "mr", "mr.", "ms", "ms.", "mrs", "mrs.", "dr", "dr."}
        first_parts = [p for p in first_parts if p.lower() not in skip]
        # Deduplicate consecutive tokens (e.g. "BRETT BRETT")
        deduped = []
        for p in first_parts:
            if not deduped or p.lower() != deduped[-1].lower():
                deduped.append(p)
        first_parts = deduped
        if first_parts:
            first = first_parts[0].title()
            # If first name is just an initial (e.g. "S."), use the next part as first name
            if len(first) <= 2 or (first.endswith('.') and len(first) <= 3):
                if len(first_parts) > 1:
                    first = first_parts[1].title()
            suffixes = {"Jr", "Sr", "Ii", "Iii", "Iv"}
            if len(first_parts) > 1 and first_parts[-1].title() in suffixes:
                return f"{first} {last} {first_parts[-1].title()}"
            return f"{first} {last}"
        return last
    return raw.title()


def normalize_name(name):
    """Normalize a name for fuzzy matching."""
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def load_candidates(cn_path):
    """Load cn.txt (pipe-delimited) -> {CAND_ID: {name, party, state, chamber}}.
    Only House/Senate. Keeps the most recent election year per candidate."""
    raw = {}
    with open(cn_path, "r", encoding="utf-8", errors="replace") as f:
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


def build_industry_classifier(industries_data, clients_data):
    """Build industry classification tools from OpenLobby data.
    Returns (client_name_to_industry,) for use with classify_pac()."""
    code_to_industry = {}
    for ind in industries_data:
        ind_name = ind.get("name", "")
        if ind_name in INDUSTRY_NAME_TO_ID:
            ind_id = INDUSTRY_NAME_TO_ID[ind_name]
            for code in ind.get("codes", []):
                code_to_industry[code] = ind_id

    client_name_to_industry = {}
    for client in clients_data:
        issues = client.get("issues", [])
        if not issues:
            continue
        industry_scores = defaultdict(int)
        for code in issues:
            if code in code_to_industry:
                industry_scores[code_to_industry[code]] += 1
        if industry_scores:
            best = max(industry_scores, key=industry_scores.get)
            norm = normalize_name(client["name"])
            client_name_to_industry[norm] = best

    return client_name_to_industry


def classify_pac(pac_name, client_name_to_industry):
    """Classify a PAC into an industry ID using client names, keywords, and patterns."""
    if not pac_name:
        return "other"

    norm = normalize_name(pac_name)

    # Direct match
    if norm in client_name_to_industry:
        return client_name_to_industry[norm]

    # Substring match
    for client_norm, industry in client_name_to_industry.items():
        if len(client_norm) >= 6 and (client_norm in norm or norm in client_norm):
            return industry

    # Prefix match
    norm_words = norm.split()
    if len(norm_words) >= 2:
        for n in (2, 3):
            prefix = " ".join(norm_words[:n])
            if len(prefix) >= 6:
                for client_norm, industry in client_name_to_industry.items():
                    if client_norm.startswith(prefix):
                        return industry

    # Keyword fallback
    for keywords, industry in KEYWORD_RULES:
        for kw in keywords:
            if kw in norm:
                return industry

    # Ideological patterns
    for pattern in IDEOLOGICAL_PATTERNS:
        if pattern in norm:
            return "ideological"

    return "other"


def read_json(path):
    """Read a JSON file, return parsed data."""
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data):
    """Write data as JSON, creating parent dirs if needed."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  Wrote {path}")


def read_progress(progress_path):
    """Read .progress.json, return dict."""
    path = Path(progress_path)
    if path.exists():
        with open(path, "r") as f:
            return json.load(f)
    return {"steps": {}}


def write_progress(progress_path, data):
    """Write .progress.json."""
    with open(progress_path, "w") as f:
        json.dump(data, f, indent=2)


def is_step_complete(progress, step_name):
    """Check if a step is marked complete in progress data."""
    step = progress.get("steps", {}).get(step_name, {})
    return step.get("status") == "completed"


def mark_step_complete(progress_path, step_name):
    """Mark a step as completed in .progress.json."""
    from datetime import datetime, timezone
    progress = read_progress(progress_path)
    if "steps" not in progress:
        progress["steps"] = {}
    progress["steps"][step_name] = {
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    write_progress(progress_path, progress)


def require_files(paths, step_name):
    """Validate that all required input files exist. Raises FileNotFoundError if any missing."""
    missing = [str(p) for p in paths if not Path(p).exists()]
    if missing:
        msg = f"Step {step_name}: missing required files:\n"
        for m in missing:
            msg += f"  - {m}\n"
        raise FileNotFoundError(msg)


def fuzzy_match_politician(name, state, chamber, candidates, threshold=80):
    """Fuzzy match a name+state+chamber to FEC candidates.
    candidates: list of dicts with 'cand_id', 'name', 'state', 'chamber'.
    Returns best matching cand_id or None."""
    from thefuzz import fuzz

    best_id = None
    best_score = 0

    for cand in candidates:
        if cand["state"] != state:
            continue
        if cand["chamber"] != chamber:
            continue
        score = fuzz.token_sort_ratio(normalize_name(name), normalize_name(cand["name"]))
        if score > best_score:
            best_score = score
            best_id = cand["cand_id"]

    if best_score >= threshold:
        return best_id
    return None
