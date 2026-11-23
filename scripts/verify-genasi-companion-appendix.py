"""Verify the publisher's notice and four Genasi headings in one exact EEPC PDF."""

import argparse
import hashlib
import io
import json
from pathlib import Path

from pypdf import PdfReader

REPORT_PATH = Path(__file__).resolve().parents[1] / "catalog/genasi-companion-appendix-witness-2014.json"
NOTICE = (
    "The genasi in chapter 1 and all of the spells in chapter 2 "
    "appear in the appendices of Princes of the Apocalypse"
)


def verify_pdf(path, report):
    source = report["source"]
    raw = path.read_bytes()
    if len(raw) != source["bytes"] or hashlib.sha256(raw).hexdigest() != source["sha256"]:
        raise ValueError("Companion PDF does not match the reviewed source")

    pdf = PdfReader(io.BytesIO(raw))
    if len(pdf.pages) != source["pdfPages"]:
        raise ValueError("Companion page count changed")

    def page_text(number):
        return pdf.pages[number - 1].extract_text()

    notice = " ".join(page_text(source["publisherNoticePage"]).split())
    if notice.count(NOTICE) != 1 or "Published March 2015" not in notice:
        raise ValueError("Missing scoped publisher statement")

    for candidate in report["componentCandidates"]:
        lines = [line.strip() for line in page_text(candidate["pdfPage"]).splitlines()]
        if lines.count(candidate["name"]) != 1:
            raise ValueError("Missing or ambiguous heading: " + candidate["name"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    args = parser.parse_args()
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    verify_pdf(args.pdf, report)
    print("Publisher notice and four Genasi headings verified")


if __name__ == "__main__":
    main()
