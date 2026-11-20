"""Check selected, manually curated 2014 rule witnesses against exact local PDFs.

Read-only: no downloads, database access, rule evaluation, or acceptance promotion.
The presence of an anchor is evidence for review, not proof of every curated fact.
Requires pypdf only in the CLI, not for the pure section/contract tests.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def section(text, start, stop):
    text, start, stop = map(normalize, (text, start, stop))
    if not start or not stop or text.count(start) != 1:
        raise ValueError("Missing or ambiguous section start")
    begin = text.index(start)
    end = text.find(stop, begin + len(start))
    if end < 0:
        raise ValueError("Missing section end after start")
    return text[begin:end]


def audit(contract, sources, pages):
    if contract.get("ruleset") != "5e-2014":
        raise ValueError("Only the reviewed 2014 contract is supported")
    if contract.get("acceptedForRuntime") is not False or contract.get("runtimeChanged") is not False:
        raise ValueError("Witness audit cannot promote acceptance or runtime status")
    definitions = contract.get("sources", [])
    ids = [x["id"] for x in definitions]
    if len(set(ids)) != len(ids) or not ids:
        raise ValueError("Duplicate or empty source definitions")
    if set(sources) != set(ids) or set(pages) != set(ids):
        raise ValueError("Provide exactly the declared sources")
    for spec in definitions:
        key = spec["id"]
        if hashlib.sha256(sources[key]).hexdigest() != spec["sha256"]:
            raise ValueError("Source hash differs: " + key)
        if len(pages[key]) != spec["pageCount"]:
            raise ValueError("Source page count differs: " + key)
    units = contract.get("units", [])
    keys = [x["key"] for x in units]
    if not keys or len(keys) != len(set(keys)):
        raise ValueError("Duplicate or empty rule units")
    result = []
    for unit in units:
        src, number = unit["source"], unit["pdfPage"]
        if src not in pages or type(number) is not int or not 1 <= number <= len(pages[src]):
            raise ValueError("Invalid source page for " + unit["key"])
        body = section(pages[src][number - 1], unit["start"], unit["stop"])
        anchors = unit.get("anchors", [])
        if not anchors or any(not normalize(a) for a in anchors):
            raise ValueError("Empty witness for " + unit["key"])
        missing = [a for a in anchors if normalize(a) not in body]
        if missing:
            raise ValueError("Missing scoped witness for " + unit["key"])
        forbidden = [a for a in unit.get("forbidden", []) if normalize(a) in body]
        if forbidden:
            raise ValueError("Foreign rule in selected section: " + unit["key"])
        result.append({"key": unit["key"], "source": src, "pdfPage": number,
                       "anchorCount": len(anchors), "scopeVerified": True})
    return {"ruleset": "5e-2014", "acceptedForRuntime": False, "runtimeChanged": False,
            "ruleInterpretationVerified": False, "unitCount": len(result),
            "anchorCount": sum(x["anchorCount"] for x in result), "witnesses": result}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract", type=Path, default=Path("catalog/rest-spellcasting-source-comparison-2014.json"))
    parser.add_argument("--srd", type=Path, required=True)
    parser.add_argument("--ph-errata", type=Path, required=True)
    parser.add_argument("--basic-rules", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    contract = json.loads(args.contract.read_text(encoding="utf-8"))
    paths = {"srd51": args.srd, "phErrata30": args.ph_errata, "basic2018": args.basic_rules}
    blobs = {key: path.read_bytes() for key, path in paths.items()}
    # Verify hashes before allowing the PDF library to parse a supplied replacement.
    for spec in contract["sources"]:
        if spec["id"] not in blobs or hashlib.sha256(blobs[spec["id"]]).hexdigest() != spec["sha256"]:
            raise SystemExit("Source hash differs: " + spec["id"])
    from pypdf import PdfReader
    documents = {key: PdfReader(path) for key, path in paths.items()}
    # Unselected pages stay empty; page indices/counts remain identical to the PDF.
    pages = {key: [""] * len(doc.pages) for key, doc in documents.items()}
    for unit in contract["units"]:
        key, index = unit["source"], unit["pdfPage"] - 1
        if not pages[key][index]:
            pages[key][index] = documents[key].pages[index].extract_text()
    result = audit(contract, blobs, pages)
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
