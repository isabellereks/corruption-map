"""Step 05: Load OpenLobby data — revolving door records."""

from pathlib import Path

from tqdm import tqdm

from .utils import fuzzy_match_politician, normalize_name, read_json, require_files, write_json

DATA_ROOT = Path(__file__).resolve().parent.parent.parent / "data"
RAW = DATA_ROOT / "raw" / "openlobby"
OUTPUT = DATA_ROOT / "processed" / "openlobby_enriched.json"


def run():
    """Execute step 05: Load OpenLobby revolving door data."""
    revolving_path = RAW / "revolving_door.json"
    require_files([revolving_path], "05_load_openlobby")

    fec_data = read_json(DATA_ROOT / "processed" / "fec_politicians.json")

    # Build candidate list for matching
    candidates = [
        {"cand_id": p["cand_id"], "name": p["name"], "state": p["state"], "chamber": p["chamber"]}
        for p in fec_data
    ]
    cand_names = {p["cand_id"]: normalize_name(p["name"]) for p in fec_data}

    # Load revolving door data
    print("  Loading revolving door data...")
    revolving_data = read_json(revolving_path)
    print(f"    {len(revolving_data)} revolving door records")

    # Match revolving door records to politicians
    print("  Matching revolving door records to politicians...")
    politician_lobby = {}  # cand_id -> {formerLobbyist, becameLobbyist, connections[]}

    for record in tqdm(revolving_data, desc="    Revolving door"):
        name = record.get("name", record.get("person_name", ""))
        if not name:
            continue

        # Try to determine direction (lobbyist -> politician or politician -> lobbyist)
        role = record.get("role", record.get("position", "")).lower()
        firm = record.get("firm", record.get("organization", record.get("registrant", "")))
        industry = record.get("industry", record.get("sector", ""))
        is_former_lobbyist = any(
            kw in role for kw in ["former lobbyist", "lobbyist to", "revolving in"]
        )
        became_lobbyist = any(
            kw in role for kw in ["became lobbyist", "to lobbyist", "revolving out", "former member"]
        )

        # Try direct name match first
        matched_id = None
        norm_name = normalize_name(name)
        for cand_id, cand_norm in cand_names.items():
            if norm_name == cand_norm:
                matched_id = cand_id
                break

        # Fall back to fuzzy match if no direct match
        if not matched_id:
            # Try matching without state/chamber constraint for revolving door
            from thefuzz import fuzz
            best_score = 0
            for cand in candidates:
                score = fuzz.token_sort_ratio(norm_name, normalize_name(cand["name"]))
                if score > best_score:
                    best_score = score
                    matched_id = cand["cand_id"]
            if best_score < 85:
                matched_id = None

        if not matched_id:
            continue

        if matched_id not in politician_lobby:
            politician_lobby[matched_id] = {
                "formerLobbyist": False,
                "becameLobbyist": False,
                "revolvingDoorConnections": [],
            }

        entry = politician_lobby[matched_id]
        if is_former_lobbyist:
            entry["formerLobbyist"] = True
        if became_lobbyist:
            entry["becameLobbyist"] = True

        entry["revolvingDoorConnections"].append({
            "name": name,
            "firm": firm,
            "industry": industry,
        })

    # Build output — include all FEC politicians, with defaults for unmatched
    results = []
    for pol in fec_data:
        cand_id = pol["cand_id"]
        lobby_info = politician_lobby.get(cand_id, {})
        results.append({
            "cand_id": cand_id,
            "formerLobbyist": lobby_info.get("formerLobbyist", False),
            "becameLobbyist": lobby_info.get("becameLobbyist", False),
            "revolvingDoorConnections": lobby_info.get("revolvingDoorConnections", []),
        })

    write_json(OUTPUT, results)
    matched_count = sum(1 for r in results if r["formerLobbyist"] or r["becameLobbyist"] or r["revolvingDoorConnections"])
    print(f"    {matched_count} politicians with revolving door connections")
    return {"record_count": len(results)}
