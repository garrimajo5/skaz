"""Verify public bestiary filters for the remaining D02 publication groups."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
from urllib.parse import urlencode

PARSER = runpy.run_path(str(Path(__file__).with_name("audit-compound-bestiary-filters-2014.py")))
INPUT = PARSER["INPUT"]
OUTPUT = PARSER["CATALOG"] / "remaining-bestiary-filter-evidence-2014.json"
SCOPES = [
    ("bard", "15", "111", "Volo's Guide to Monsters"),
    ("bard", "43", "128", "Ghosts of Saltmarsh"),
    ("bard", "85", "158", "Mordenkainen Presents: Monsters of the Multiverse"),
    ("brain in a jar", "66", "120", "Icewind Dale: Rime of the Frostmaiden"),
    ("brain in a jar", "69", "125", "Van Richten’s Guide to Ravenloft"),
    ("large mimic", "36", "135", "Waterdeep: Dungeon of the Mad Mage"),
    ("large mimic", "54", "130", "Dungeons & Dragons vs. Rick and Morty"),
    ("amphisbaena", "61", "121", "Mythic Odysseys of Theros"),
    ("amphisbaena", "43", "128", "Ghosts of Saltmarsh"),
    ("necrichor", "125", "208", "Adventure Atlas: The Mortuary"),
    ("necrichor", "69", "125", "Van Richten’s Guide to Ravenloft"),
    ("space hamster", "36", "135", "Waterdeep: Dungeon of the Mad Mage"),
    ("space hamster", "90", "160", "Spelljammer: Adventures in Space"),
    ("cosmic horror", "132", "214", "Vecna: Eve of Ruin"),
    ("cosmic horror", "90", "160", "Spelljammer: Adventures in Space"),
    ("pech", "136", "213", "Descent into the Lost Caverns of Tsojcanth"),
    ("pech", "137", "218", "Quests from the Infinite Staircase"),
    ("red ruffian", "8", "110", "Lost Mine of Phandelver"),
    ("red ruffian", "113", "202", "Phandelver and Below: The Shattered Obelisk"),
    ("guard drake", "15", "111", "Volo's Guide to Monsters"),
    ("guard drake", "85", "158", "Mordenkainen Presents: Monsters of the Multiverse"),
    ("strahd von zarovich", "6", "124", "Curse of Strahd"),
    ("strahd von zarovich", "132", "214", "Vecna: Eve of Ruin"),
]
COMPARISONS = [
    ("red ruffian", "redbrand ruffian", "8", "Lost Mine of Phandelver", "alternate-query"),
    ("red ruffian", "redbrand ruffian", "113", "Phandelver and Below: The Shattered Obelisk", "alternate-query"),
    ("guard drake", "guard drake", "102", "Tyranny of Dragons", "combined-publication"),
]
UNAVAILABLE_SCOPE = ("guard drake", "106")


def checked_claims(proposals):
    by_name = {group["name"]: group for group in proposals["groups"]}
    pairs = [(name, source_id) for name, _, source_id, _ in SCOPES]
    pairs.append(UNAVAILABLE_SCOPE)
    observations = [
        ((name, claim["sourceId"]), (by_name[name]["reviewId"], claim["claimKey"]))
        for name in dict.fromkeys(name for name, _ in pairs)
        for claim in by_name[name]["publicationClaims"]
    ]
    claims = dict(observations)
    if len(pairs) != len(set(pairs)) or len(observations) != len(claims) or set(pairs) != set(claims):
        raise ValueError("Changed D02 claim scope for these groups")
    return claims


def query_evidence(raw, query, filter_value, label, *, claim_name=None):
    name = claim_name or query
    rows = PARSER["discover_rows"](raw, filter_value, label, query=query)
    return [
        {
            "name": row["digitalName"],
            "nameMatch": "exact" if row["digitalName"].casefold() == name else "different",
            "cardUrl": row["cardUrl"],
            "displayedPublication": row["displayedSource"],
            "indexType": row["type"],
            "indexSize": row["size"],
            "indexChallengeColumn": row["challengeRating"],
        }
        for row in rows
    ]


def require_unavailable_filter(raw, title):
    tree = PARSER["HELPER"]["Tree"]()
    tree.feed(raw.decode("utf-8"))
    selector = PARSER["publication_selector"](tree.root)
    labels = [
        PARSER["HELPER"]["clean"](node).casefold().removeprefix("the ")
        for node in selector.find(lambda node: node.tag == "option")
    ]
    if title.casefold() in labels:
        raise ValueError("The reference filter is now available")


def build(directory):
    input_bytes = INPUT.read_bytes()
    proposals = json.loads(input_bytes)
    claims = checked_claims(proposals)
    review_ids = {group["name"]: group["reviewId"] for group in proposals["groups"]}

    def capture(query, filter_value, label, name, **scope):
        raw = (directory / f"{query.replace(' ', '-')}-{filter_value}.html").read_bytes()
        rows = query_evidence(raw, query, filter_value, label, claim_name=name)
        return raw, {
            "query": query,
            "reviewId": review_ids[name],
            **scope,
            "publisherFilterValue": filter_value,
            "selectedPublisherLabel": label,
            "url": PARSER["SITE"] + "/monsters?" + urlencode({"filter-search": query, "filter-source": filter_value}),
            "bytes": len(raw),
            "htmlSha256": hashlib.sha256(raw).hexdigest(),
            "listing": "empty" if not rows else "rows",
            "indexRows": rows,
        }

    captures = []
    for name, filter_value, source_id, label in SCOPES:
        _, claim_key = claims[name, source_id]
        _, observation = capture(name, filter_value, label, name, checkedClaimKey=claim_key, referenceSourceId=source_id)
        captures.append(observation)

    comparisons = []
    for name, query, filter_value, label, relation in COMPARISONS:
        raw, comparison = capture(query, filter_value, label, name, relation=relation)
        if relation == "combined-publication":
            require_unavailable_filter(raw, "Rise of Tiamat")
            _, claim_key = claims[UNAVAILABLE_SCOPE]
            comparison["unavailableReferenceFilter"] = {
                "expectedLabel": "Rise of Tiamat",
                "unresolvedClaimKey": claim_key,
                "referenceSourceId": UNAVAILABLE_SCOPE[1],
            }
        comparisons.append(comparison)
    return {
        "schemaVersion": 1,
        "checkedOn": "2026-11-28",
        "evidenceKind": "publisher-selected-bestiary-filter",
        "captures": captures,
        "comparisons": comparisons,
        "accepted": False,
        "fullRulesVerified": False,
        "automaticMerge": False,
        "approvedDenominator": None,
        "textReusePermission": "not-established",
        "inputSha256": {"catalog/" + INPUT.name: hashlib.sha256(input_bytes).hexdigest()},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory of already captured public HTML files")
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    result = build(args.directory)
    if args.write:
        OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if result != json.loads(OUTPUT.read_text(encoding="utf-8")):
        raise SystemExit("Evidence differs from the tracked report")
    print(f"Verified {len(result['captures'])} source filters and {len(result['comparisons'])} comparisons across 11 bestiary groups")
