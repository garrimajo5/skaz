"""Reproduce the spell heading inventory of two exact official EEPC PDFs."""

import argparse
import hashlib
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCOPE_PATH = "catalog/scope-register-2014.json"
SOURCE_PATH = "catalog/ee-selected-spell-source-comparison-2014.json"
METADATA_PATH = "catalog/dndsu-spell-index-metadata.json"
OUTPUT_PATH = ROOT / "catalog/eepc-spell-inventory-2014.json"

SPELL_CLASSIFICATION = re.compile(
    r"(?:(?P<level>[1-9])(?:st|nd|rd|th)-level (?P<school>[a-z]+)(?P<ritual> \(ritual\))?"
    r"|(?P<cantrip_school>[a-z]+) cantrip)",
    re.IGNORECASE,
)
SCHOOLS = {
    "abjuration", "conjuration", "divination", "enchantment",
    "evocation", "illusion", "necromancy", "transmutation",
}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def name_key(name):
    # The exact PDFs extract replacement characters at some possessive apostrophes.
    normalized = re.sub(r"(?<=[A-Za-z])\ufffd(?=s\b)", "'", name.replace("\u2019", "'"))
    if "\ufffd" in normalized:
        raise ValueError("Unrecognized character in spell heading")
    return normalized.casefold()


def extract_headings(pages):
    headings = {}
    descriptions_seen = False
    for pdf_page, body in enumerate(pages, 1):
        previous = None
        for line in (value.strip() for value in body.splitlines() if value.strip()):
            if line == "Spell Descriptions":
                if descriptions_seen:
                    raise ValueError("Repeated Spell Descriptions boundary")
                descriptions_seen = True
            elif descriptions_seen and (classification := SPELL_CLASSIFICATION.fullmatch(line)):
                if previous in (None, "Spell Descriptions"):
                    raise ValueError("Spell classification has no heading")
                key = name_key(previous)
                if key in headings:
                    raise ValueError("Repeated spell heading: " + previous)
                school = (classification["school"] or classification["cantrip_school"]).lower()
                if school not in SCHOOLS:
                    raise ValueError("Unrecognized school: " + school)
                headings[key] = {
                    "pdfPage": pdf_page,
                    "level": int(classification["level"] or 0),
                    "school": school,
                    "ritual": classification["ritual"] is not None,
                }
            previous = line
    if not descriptions_seen:
        raise ValueError("Missing Spell Descriptions boundary")
    return headings


def read_pdf(path, source):
    from pypdf import PdfReader

    raw = path.read_bytes()
    if digest(raw) != source["sha256"]:
        raise ValueError("Source hash differs: " + source["id"])
    pdf = PdfReader(io.BytesIO(raw))
    if len(pdf.pages) != source["pageCount"]:
        raise ValueError("Source page count differs: " + source["id"])
    return [page.extract_text() for page in pdf.pages]


def join_observations(observations, original, alternate):
    by_name = {}
    for row in observations:
        key = name_key(row["names"]["en"])
        if key in by_name:
            raise ValueError("Ambiguous observed spell name: " + key)
        by_name[key] = row
    if by_name.keys() != original.keys() or by_name.keys() != alternate.keys():
        raise ValueError("Publisher headings and source 107 observations differ")

    records = []
    for key, row in sorted(by_name.items()):
        first, second = original[key].copy(), alternate[key].copy()
        pdf_pages = {"ee2015": first.pop("pdfPage"), "ee2016": second.pop("pdfPage")}
        if first != second:
            raise ValueError("Publisher metadata differs: " + key)
        records.append({
            "observationId": row["id"],
            "observedName": row["names"]["en"],
            "originalSourceIds": row["sourceIds"],
            "pdfPages": pdf_pages,
            **first,
        })
    return records


def verify_secondary_fields(records, secondary):
    by_id = {row["pageId"]: row for row in secondary["records"]}
    if len(by_id) != len(secondary["records"]):
        raise ValueError("Duplicate secondary metadata ID")
    for record in records:
        row = by_id.get(record["observationId"])
        if row is None or row["sourceIds"] != record["originalSourceIds"]:
            raise ValueError("Missing or changed secondary metadata source")
        if any(record[field] != row["fields"][field] for field in ("level", "school", "ritual")):
            raise ValueError("Secondary metadata differs: " + record["observationId"])


def build(original_path, alternate_path):
    raw = {path: (ROOT / path).read_bytes() for path in (SCOPE_PATH, SOURCE_PATH, METADATA_PATH)}
    source_specs = json.loads(raw[SOURCE_PATH])["sources"]
    sources = {source["id"]: source for source in source_specs}
    observations = [
        row for row in json.loads(raw[SCOPE_PATH])["records"]
        if row["section"] == "spells" and "107" in row["sourceIds"]
    ]
    original = extract_headings(read_pdf(original_path, sources["ee2015"]))
    alternate = extract_headings(read_pdf(alternate_path, sources["ee2016"]))
    records = join_observations(observations, original, alternate)
    verify_secondary_fields(records, json.loads(raw[METADATA_PATH]))
    return {
        "schemaVersion": 1,
        "ruleset": "5e-2014",
        "status": "publisher-spell-headings-reconciled",
        "inputSha256": {path: digest(content) for path, content in raw.items()},
        "publisherSources": [
            {field: sources[key][field] for field in ("id", "url", "sha256", "pageCount")}
            for key in ("ee2015", "ee2016")
        ],
        "secondaryMetadataMatches": len(records),
        "records": records,
        "directPotaAppendixRead": False,
        "bodyEquivalence": "unverified",
        "wholeCatalogCoverageAccepted": False,
        "textReusePermission": "not-established",
        "approvedDenominator": None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--original", required=True, type=Path)
    parser.add_argument("--alternate", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    result = build(args.original, args.alternate)
    if args.output:
        with args.output.open("x", encoding="utf-8", newline="\n") as target:
            json.dump(result, target, ensure_ascii=False, indent=2)
            target.write("\n")
    elif result != json.loads(OUTPUT_PATH.read_text(encoding="utf-8")):
        raise SystemExit("Committed inventory differs from both exact PDFs")
    print(f"Verified {len(result['records'])} spell headings in both EEPC PDFs")


if __name__ == "__main__":
    main()
