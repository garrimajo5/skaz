"""Index PotA v1.5 spell errata headings, printing labels and stable spell IDs."""

import argparse
import hashlib
import io
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPELL_PATH = "catalog/eepc-spell-inventory-2014.json"
SOURCE_PATH = "catalog/ee-selected-spell-source-comparison-2014.json"
OUTPUT_PATH = ROOT / "catalog/pota-spell-errata-locators-2014.json"

HEADING = re.compile(
    r"([A-Z][A-Za-z’'-]*(?: [A-Z][A-Za-z’'-]*| (?:of|the|with|from))*) \(p\. ([0-9]+)\)\."
)
PRINTING = re.compile(r"\((5th|future) printing\)")
CLASSES = {"Sorcerer Spells": "sorcerer", "Wizard Spells": "wizard"}


def key(text):
    return text.replace("\u2019", "'").casefold()


def extract_appendix(text, spells):
    normalized = " ".join(text.split())
    normalized = normalized.replace("fu - ture printing", "future printing").replace("con- juration", "conjuration")
    chunks = normalized.split("Appendix B")
    if len(chunks) != 2 or "Version 1.5" not in normalized:
        raise ValueError("Expected one Appendix B and errata version 1.5")
    appendix = chunks[1]
    headings = list(HEADING.finditer(appendix))
    by_name = {key(row["observedName"]): row for row in spells}
    descriptions = []
    class_lists = []
    seen_headings = set()
    for i, match in enumerate(headings):
        heading, page = match.groups()
        end = headings[i + 1].start() if i + 1 < len(headings) else len(appendix)
        body = appendix[match.end():end]
        labels = PRINTING.findall(body)
        if not labels or heading in seen_headings:
            raise ValueError("Missing printing or duplicate heading: " + heading)
        seen_headings.add(heading)
        if heading in CLASSES:
            spell_names = re.findall(r"([A-Z][A-Za-z ]+) \((abjuration|conjuration|evocation)\)", body)
            if len(spell_names) != len(labels):
                raise ValueError("Class-list additions and printing labels differ")
            for (name, school), label in zip(spell_names, labels, strict=True):
                spell = by_name[key(name)]
                if spell["school"] != school:
                    raise ValueError("Printing list changed school: " + name)
                class_lists.append({
                    "observationId": spell["observationId"],
                    "observedName": spell["observedName"],
                    "class": CLASSES[heading],
                    "printedPage": int(page),
                    "printing": label,
                })
        else:
            spell = by_name[key(heading)]
            descriptions.append({
                "observationId": spell["observationId"],
                "observedName": spell["observedName"],
                "printedPage": int(page),
                "printings": list(dict.fromkeys(labels)),
            })
    if not descriptions or not class_lists:
        raise ValueError("Expected both description and class-list errata")
    return descriptions, class_lists


def build(pdf_path):
    from pypdf import PdfReader

    inputs = {path: (ROOT / path).read_bytes() for path in (SPELL_PATH, SOURCE_PATH)}
    source = next(row for row in json.loads(inputs[SOURCE_PATH])["sources"] if row["id"] == "potaErrata")
    raw = pdf_path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("Errata PDF does not match reviewed source")
    pdf = PdfReader(io.BytesIO(raw))
    if len(pdf.pages) != source["pageCount"]:
        raise ValueError("Errata page count differs")

    descriptions, class_lists = extract_appendix(
        " ".join(page.extract_text() for page in pdf.pages),
        json.loads(inputs[SPELL_PATH])["records"],
    )
    return {
        "schemaVersion": 1,
        "status": "publisher-errata-heading-and-printing-locators",
        "inputSha256": {path: hashlib.sha256(content).hexdigest() for path, content in inputs.items()},
        "publisherSource": {**{field: source[field] for field in ("url", "sha256", "pageCount")},
                            "version": "1.5", "appendixPdfPages": [2, 3]},
        "descriptionErrata": descriptions,
        "spellListAdditions": class_lists,
        "uniqueAffectedObservations": len({row["observationId"] for row in descriptions + class_lists}),
        "targetPublicationSourceId": "107",
        "automaticRulesPatch": False,
        "exactRulesVersionAccepted": False,
        "textReusePermission": "not-established",
        "approvedDenominator": None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = build(args.pdf)
    if args.output:
        with args.output.open("x", encoding="utf-8", newline="\n") as target:
            json.dump(result, target, ensure_ascii=False, indent=2)
            target.write("\n")
    elif result != json.loads(OUTPUT_PATH.read_text(encoding="utf-8")):
        raise SystemExit("Stored PotA errata inventory differs")
    print(f"Verified {len(result['descriptionErrata'])} descriptions and {len(result['spellListAdditions'])} class-list changes")


if __name__ == "__main__":
    main()
