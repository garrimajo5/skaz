"""Record two publisher-index comparisons while keeping the source proposals open."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
PARSER = runpy.run_path(str(ROOT / "scripts/audit-fiendish-folio-index.py"))
BASE = "catalog/volo-motm-residual-locators-2014.json"
BOOKS = {
    "vgtm": ("15", "111", "filter-source-volos-guide-to-monsters", "Volo's Guide to Monsters"),
    "motm": ("85", "158", "filter-source-mordenkainen-presents-monsters-of-the-multiverse", "Mordenkainen Presents: Monsters of the Multiverse"),
}
NAMES = {
    "Firenewt Warrior": ("dndsu:bestiary:594", "dndsu:bestiary:6749"),
    "Shadow Mastiff Alpha": ("dndsu:bestiary:5678", "dndsu:bestiary:6936"),
}
FIELDS = ("type", "challengeRating", "alignment")


def build(base, captures):
    if base["accepted"] is not False or base["complete"] is not False or base["approvedDenominator"] is not None:
        raise ValueError("The existing version review must remain open")
    if set(captures) != {(name, book) for name in NAMES for book in BOOKS}:
        raise ValueError("Both books are required for each of the two names")

    groups = []
    cards = set()
    for name, ids in NAMES.items():
        previous = PARSER["only"]((g for g in base["groups"] if g["name"] == name.lower()), name)
        if previous["aliasAccepted"] is not False or previous["canonicalId"] is not None:
            raise ValueError("A newly resolved group needs separate review")
        members = previous["members"]
        if [member["observationId"] for member in members] != list(ids):
            raise ValueError("Original observations changed")

        observations = []
        for (book, (value, source_id, option_id, label)), member in zip(BOOKS.items(), members):
            if member["sourceIds"] != [source_id]:
                raise ValueError("Original source membership changed")
            raw = captures[name, book]
            page = PARSER["parse_page"](raw.decode("utf-8"), value, option_id, {label})
            row = PARSER["only"](page["rows"], name + " filter result")
            if row["digitalName"] != name or page["nextPage"] is not None:
                raise ValueError("Unexpected result or another page under the named filter")
            if row["cardUrl"] in cards:
                raise ValueError("One digital card cannot evidence two observations here")
            cards.add(row["cardUrl"])
            observations.append({
                **member,
                "publisherFilterValue": value,
                "publisherIndexUrl": "https://www.dndbeyond.com/monsters?" + urlencode({
                    "filter-search": name, "filter-source": value,
                }),
                "htmlSha256": hashlib.sha256(raw).hexdigest(),
                "digitalRow": row,
            })

        old, new = (item["digitalRow"] for item in observations)
        groups.append({
            "reviewId": previous["reviewId"],
            "name": name,
            "observations": observations,
            "digitalDifferences": {
                field: {"vgtm": old[field], "motm": new[field]}
                for field in FIELDS if old[field] != new[field]
            },
            "canonicalId": None,
            "aliasAccepted": False,
            "fullStatBlocksCompared": False,
            "exactErrataVersionVerified": False,
            "translationReusePermission": "not-established",
        })
    return {
        "schemaVersion": 1,
        "checkedOn": "2026-11-23",
        "groups": groups,
        "accepted": False,
        "complete": False,
        "approvedDenominator": None,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    paths = {
        (name, book): args.directory / f"{name.lower().replace(' ', '-')}-{book}.html"
        for name in NAMES for book in BOOKS
    }
    if args.output.suffix != ".json" or args.output.resolve() in {path.resolve() for path in paths.values()}:
        parser.error("Write an independent JSON report")
    baseline = (ROOT / BASE).read_bytes().replace(b"\r\n", b"\n")
    report = build(json.loads(baseline), {key: path.read_bytes() for key, path in paths.items()})
    report["inputSha256"] = {BASE: hashlib.sha256(baseline).hexdigest()}
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
