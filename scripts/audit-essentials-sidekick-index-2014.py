"""Check Essentials Kit NPC rows without promoting later sidekicks from empty filters."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
from urllib.parse import urlencode

PARSER = runpy.run_path(str(Path(__file__).with_name("audit-compound-bestiary-filters-2014.py")))
CATALOG = PARSER["CATALOG"]
PROPOSALS = PARSER["INPUT"]
CONTENTS = CATALOG / "remaining-bestiary-publication-evidence-2014.json"
OUTPUT = CATALOG / "essentials-sidekick-index-evidence-2014.json"
BOOKS = [
    ("41", "157", "Dragon of Icespire Peak"),
    ("50", "167", "Storm Lord’s Wrath"),
    ("51", "131", "Sleeping Dragon’s Wake"),
    ("52", "127", "Divine Contention"),
]
ROLES = {
    "expert": {"Expert": "expert"},
    "spellcaster": {"Spellcaster - Healer": "spellcaster (healer)", "Spellcaster - Mage": "spellcaster (mage)"},
    "warrior": {"Warrior": "warrior"},
}


def discover_rows(raw, filter_value, label):
    listing = PARSER["selected_listing"](raw, filter_value, label)
    empty_rows = list(listing.find(lambda node: node.tag == "li" and node.has("no-results")))
    monster_rows = list(listing.find(lambda node: node.attrs.get("data-type") == "monsters"))
    if empty_rows:
        if len(empty_rows) != 1 or monster_rows:
            raise ValueError("Conflicting or repeated empty index markers")
        return []
    rows = PARSER["HELPER"]["read_index_rows"](listing)
    if len(rows) != len(monster_rows):
        raise ValueError("Unrecognized monster rows in the selected listing")
    return rows


def build(directory):
    proposal_bytes = PROPOSALS.read_bytes()
    contents_bytes = CONTENTS.read_bytes()
    by_role = {group["name"]: group["publicationClaims"] for group in json.loads(proposal_bytes)["groups"]}
    by_source = {source["sourceId"]: source for source in json.loads(contents_bytes)["sources"]}

    publications = []
    for value, source, label in BOOKS:
        toc = by_source[source]
        chapter = PARSER["HELPER"]["only"](toc["parentContexts"], "Sidekick appendix")
        if chapter["satisfiesCreatureClaim"] or chapter["relation"] != "parent-chapter-only":
            raise ValueError("A chapter pointer must remain distinct from a monster row")

        observations = []
        for query, roles in ROLES.items():
            claims = {
                name: PARSER["HELPER"]["only"](
                    (claim for claim in by_role[role] if claim["sourceId"] == source), "reference claim"
                )["claimKey"]
                for name, role in roles.items()
            }
            raw = (directory / f"{query}-{value}.html").read_bytes()
            rows = [
                {
                    "name": row["digitalName"],
                    "cardUrl": row["cardUrl"],
                    "displayedPublication": row["displayedSource"],
                    "indexChallengeColumn": row["challengeRating"],
                    "indexNameMatchesClaim": claims.get(row["digitalName"]),
                }
                for row in discover_rows(raw, value, label)
            ]
            observations.append({
                "query": query,
                "url": PARSER["SITE"] + "/monsters?" + urlencode({"filter-search": query, "filter-source": value}),
                "bytes": len(raw),
                "htmlSha256": hashlib.sha256(raw).hexdigest(),
                "checkedClaimKeys": list(claims.values()),
                "indexRows": rows,
            })
        publications.append({
            "publisherFilterValue": value,
            "selectedPublisherLabel": label,
            "referenceSourceId": source,
            "contentsUrl": toc["indexUrl"],
            "sidekicksChapter": chapter,
            "captures": observations,
        })
    return {
        "schemaVersion": 1,
        "checkedOn": "2026-11-28",
        "evidenceKind": "essentials-kit-sidekick-index-metadata",
        "publications": publications,
        "accepted": False,
        "fullStatBlocksVerified": False,
        "automaticMerge": False,
        "textReusePermission": "not-established",
        "approvedDenominator": None,
        "inputSha256": {
            "catalog/" + PROPOSALS.name: hashlib.sha256(proposal_bytes).hexdigest(),
            "catalog/" + CONTENTS.name: hashlib.sha256(contents_bytes).hexdigest(),
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    evidence = build(args.directory)
    if args.write:
        OUTPUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    if evidence != json.loads(OUTPUT.read_text(encoding="utf-8")):
        raise SystemExit("Evidence differs from the tracked report")
    print("Verified 12 publisher pages and 16 historical Sidekick attributions")
