"""Keep publication locators for unresolved Volo/MotM pairs without assigning versions."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = "catalog/monster-version-unit-proposals-2014.json"
SPEC = importlib.util.spec_from_file_location(
    "monster_toc", Path(__file__).with_name("extract-monster-version-evidence.py")
)
EXTRACTOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(EXTRACTOR)

VOLO = {
    "nilbog,goblin гоблин": ("Nilbog", "name-candidate"),
    "stench kow": ("Stench Kow (Cow)", "named-index-variant"),
    "firenewt warrior": ("Firenewt", "broader-heading"),
    "ox": ("Ox (Cow)", "named-index-variant"),
    "deep rothe": ("Rothé (Cow)", "broader-heading"),
    "shadow mastiff alpha": ("Shadow Mastiff", "broader-heading"),
}
for color in ("black", "blue", "green", "red", "white"):
    VOLO[color + " guard drake"] = ("Guard Drake", "broader-heading")

MULTIVERSE = {
    "nilbog,goblin гоблин": ("Nilbog", "name-candidate"),
    "deep rothe": ("Deep Rothé", "accented-name-candidate"),
}


def select_records(raw, book, labels):
    names = sorted({label.lower() for label, _ in labels.values()})
    evidence = EXTRACTOR.extract(raw, book, names)
    if evidence["missing"]:
        raise ValueError(f"Expected publisher headings changed: {evidence['missing']}")
    return evidence, {row["name"]: row for row in evidence["records"]}


def build(base, volo_html, motm_html):
    if base["accepted"] is not False or base["complete"] is not False or base["approvedDenominator"] is not None:
        raise ValueError("Version proposals must still be open")
    volo, old = select_records(volo_html, "vgtm", VOLO)
    motm, new = select_records(motm_html, "motm", MULTIVERSE)
    frames = {"111": (VOLO, old), "158": (MULTIVERSE, new)}
    records = []
    encountered = set()
    observation_ids = set()
    for group in base["groups"]:
        if all(unit["publicationEvidence"] for unit in group["units"]):
            continue
        name = group["name"]
        if name not in VOLO or name in encountered or group["accepted"] or group["automaticMerge"]:
            raise ValueError(f"Unresolved set changed: {name}")
        encountered.add(name)
        members = []
        for unit in group["units"]:
            if unit["observationId"] in observation_ids:
                raise ValueError(f"Observation repeated: {unit['observationId']}")
            observation_ids.add(unit["observationId"])
            [source_id] = unit["sourceIds"]
            labels, index = frames[source_id]
            locator = None
            if name in labels:
                heading, relation = labels[name]
                found = index[heading.lower()]
                locator = {
                    "heading": found["heading"],
                    "url": found["targetUrl"],
                    "relation": relation,
                }
            members.append({
                "observationId": unit["observationId"],
                "observedName": unit["observedName"],
                "sourceIds": unit["sourceIds"],
                "existingExactHeading": unit["publicationEvidence"] is not None,
                "additionalLocator": locator,
            })
        if sorted(member["sourceIds"] for member in members) != [["111"], ["158"]]:
            raise ValueError(f"Original publication membership changed: {name}")
        records.append({
            "reviewId": group["reviewId"],
            "name": name,
            "members": members,
            "canonicalId": None,
            "aliasAccepted": False,
            "standaloneRulesVerified": False,
        })
    if encountered != set(VOLO):
        raise ValueError("An unresolved comparison disappeared")
    return {
        "schemaVersion": 1,
        "accepted": False,
        "complete": False,
        "approvedDenominator": None,
        "sources": [
            {key: evidence[key] for key in ("sourceId", "title", "url", "htmlSha256")}
            for evidence in (volo, motm)
        ],
        "groups": records,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    base = (ROOT / BASE).read_bytes().replace(b"\r\n", b"\n")
    report = build(
        json.loads(base),
        (args.directory / "volo.html").read_bytes(),
        (args.directory / "motm.html").read_bytes(),
    )
    report["inputSha256"] = {BASE: hashlib.sha256(base).hexdigest()}
    args.output.write_bytes((json.dumps(report, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(f'{len(report["groups"])} unresolved groups preserved')
