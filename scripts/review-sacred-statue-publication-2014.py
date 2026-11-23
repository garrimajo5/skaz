"""Preserve filter evidence for Sacred Statue without promoting a digital row to rules."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
PARSER = runpy.run_path(str(ROOT / "scripts/audit-fiendish-folio-index.py"))
BASE = "catalog/mtf-monster-version-unit-proposals-2014.json"
NAME = "Sacred Statue"
BOOKS = {
    "mtof": ("33", "113", "filter-source-mordenkainens-tome-of-foes", "Mordenkainen’s Tome of Foes"),
    "motm": ("85", "158", "filter-source-mordenkainen-presents-monsters-of-the-multiverse", "Mordenkainen Presents: Monsters of the Multiverse"),
}


def build(base, captures):
    if base["accepted"] is not False or base["complete"] is not False or base["approvedDenominator"] is not None:
        raise ValueError("The base version review must remain open")
    group = PARSER["only"]((g for g in base["groups"] if g["name"] == NAME.lower()), NAME + " group")
    eidolon = PARSER["only"]((g for g in base["groups"] if g["name"] == "eidolon"), "Eidolon group")
    expected_sources = [[book[1]] for book in BOOKS.values()]
    if [unit["sourceIds"] for unit in group["units"]] != expected_sources:
        raise ValueError("Original source membership changed")
    if set(captures) != set(BOOKS):
        raise ValueError("Both named publisher filters are required")

    rows = []
    for (key, (value, _, option_id, label)), unit in zip(BOOKS.items(), group["units"]):
        raw = captures[key]
        page = PARSER["parse_page"](raw.decode("utf-8"), value, option_id, {label}, allow_blank_cr=True)
        row = PARSER["only"](page["rows"], NAME + " filter result")
        if row["digitalName"] != NAME or page["nextPage"] is not None:
            raise ValueError("Unexpected result or another page under the named filter")
        rows.append({
            "observationId": unit["observationId"],
            "observedName": unit["observedName"],
            "sourceIds": unit["sourceIds"],
            "publisherFilterValue": value,
            "publisherIndexUrl": "https://www.dndbeyond.com/monsters?" + urlencode({
                "filter-search": NAME, "filter-source": value,
            }),
            "htmlSha256": hashlib.sha256(raw).hexdigest(),
            "exactBookHeading": unit["publicationEvidence"],
            "digitalRow": row,
        })

    if len({row["observationId"] for row in rows}) != 2 or len({row["digitalRow"]["cardUrl"] for row in rows}) != 2:
        raise ValueError("The two source observations or the digital cards no longer differ")
    motm_eidolon = PARSER["only"](
        (unit for unit in eidolon["units"] if unit["sourceIds"] == ["158"]), "MotM Eidolon"
    )
    return {
        "schemaVersion": 1,
        "checkedOn": "2026-11-23",
        "reviewId": group["reviewId"],
        "observations": rows,
        "relatedPublicationEvidence": {
            "referenceTitle": "Six Faces of Death",
            "referenceUrl": "https://media.wizards.com/2018/dnd/dragon/21/DRA21_sixfacesdeath.pdf",
            "locator": "p. 43, area 6.38, Relics and Retribution",
            "relation": "adventure-occurrence-refers-to-mtof-eidolon-and-sacred-statue",
            "motmEidolonLocator": motm_eidolon["publicationEvidence"]["targetUrl"],
            "motmParentConnectionVerified": False,
        },
        "printedChallengeRatingVerified": False,
        "fullStatBlocksCompared": False,
        "exactErrataVersionVerified": False,
        "translationReusePermission": "not-established",
        "canonicalId": None,
        "accepted": False,
        "complete": False,
        "approvedDenominator": None,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    paths = {key: args.directory / f"sacred-statue-{key}.html" for key in BOOKS}
    if args.output.suffix != ".json" or args.output.resolve() in {path.resolve() for path in paths.values()}:
        parser.error("Write an independent JSON report")
    baseline = (ROOT / BASE).read_bytes().replace(b"\r\n", b"\n")
    report = build(json.loads(baseline), {key: path.read_bytes() for key, path in paths.items()})
    report["inputSha256"] = {BASE: hashlib.sha256(baseline).hexdigest()}
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
