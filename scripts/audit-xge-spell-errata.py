"""Connect XGE Chapter 3 print errata to existing 2014 spell observations."""
import argparse
import hashlib
import io
import json
import re
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
LOCATORS = "catalog/xge-eepc-spell-locators-2014.json"
REPORT = ROOT / "catalog/xge-spell-errata-2014.json"
SOURCE = {
    "url": "https://media.wizards.com/2020/dnd/downloads/XGtE-Errata.pdf",
    "sha256": "7f7a8bcef28bed0c7ba1ccb04fb8068ff0b5a2c38f87aeb808793424af421923",
    "version": "1.0",
    "publicationYear": 2020,
    "appliesFromPrinting": 4,
    "pdfPage": 1,
}
HEADING = re.compile(r"([A-Z][a-z]+(?: [A-Z][a-z]+)+) \(p\. (\d+)\)\.")
# These stable names identify the review scopes, not the spell text or a runtime rule.
CORRECTIONS = {
    "Healing Spirit": "healing-use-limit",
    "Holy Weapon": "dismissal-origin",
    "Life Transference": "unreducible-self-damage",
    "Mind Spike": "upcast-die-size",
}


def build(path):
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE["sha256"]:
        raise ValueError("XGE errata PDF differs from the reviewed v1.0 file")
    pages = PdfReader(io.BytesIO(raw)).pages
    if len(pages) != 1:
        raise ValueError("Expected a single-page errata")
    text = " ".join(pages[0].extract_text().split())
    if "starting with the fourth printing" not in text or "Version 1.0" not in text:
        raise ValueError("XGE errata version or printing label missing")
    chapters = re.split(r"\bChapter ([0-9]+)\b", text)
    if chapters[1::2] != ["1", "2", "3"]:
        raise ValueError("Unexpected XGE errata chapter sequence")

    locator_bytes = (ROOT / LOCATORS).read_bytes()
    index = json.loads(locator_bytes)["records"]
    headings = HEADING.findall(chapters[-1])
    if [name for name, _ in headings] != list(CORRECTIONS):
        raise ValueError("Unexpected XGE Chapter 3 heading sequence")
    records = []
    for name, page in headings:
        matches = [row for row in index if row["digitalName"] == name]
        if len(matches) != 1:
            raise ValueError(f"Expected one digital XGE match for {name}")
        row = matches[0]
        if "109" not in row["originalSourceIds"] or row["eepcIndexPage"] is not None:
            raise ValueError(f"Unexpected source assignment for {name}")
        records.append({
            "observationId": row["observationId"],
            "name": name,
            "xgePrintedPage": int(page),
            "digitalLocator": row["cardUrl"],
            "correctionScope": CORRECTIONS[name],
        })
    return {
        "schemaVersion": 1,
        "status": "publisher-errata-heading-and-printing-locators",
        "inputSha256": {LOCATORS: hashlib.sha256(locator_bytes).hexdigest()},
        "publisherSource": SOURCE,
        "targetPublicationSourceId": "109",
        "records": records,
        "printedFullTextCompared": False,
        "runtimeChanged": False,
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
        with args.output.open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(result, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    elif result != json.loads(REPORT.read_text(encoding="utf-8")):
        raise SystemExit("Stored XGE spell errata report differs")
    print(f"Verified {len(result['records'])} XGE Chapter 3 corrections")


if __name__ == "__main__":
    main()
