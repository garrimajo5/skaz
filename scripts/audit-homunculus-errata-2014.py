"""Verify the publisher errata for Homunculus Servant from saved PDF captures."""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
import unicodedata

from pypdf import PdfReader


SOURCES = {
    "eberron-errata.pdf": {
        "url": "https://media.wizards.com/2020/dnd/downloads/ERftLW-Errata.pdf",
        "sha256": "94f194059290862f626f883fac83866e665655c7b4987405e17d71a9d4b4026d",
        "title": "Eberron: Rising from the Last War",
        "errataVersion": "2.0",
        "pages": 2,
        "homunculusPages": [1, 2],
        "pageHashes": [
            "965e21a69a7cc91dc973e8eed8ca67b0e770cbefa8cfc6369b8cfb481ef10593",
            "32c15a193d3662b83961059bf92120c00b6165ded1ee9858d6d46fe03f59af60",
        ],
    },
    "tasha-errata.pdf": {
        "url": "https://media.wizards.com/2021/dnd/downloads/TCE-Errata.pdf",
        "sha256": "471b401d7c44c23c3f880fa2ca5d1e9b26abd87cc673a27ba614c9fea371dbd9",
        "title": "Tasha’s Cauldron of Everything",
        "errataVersion": "1.0",
        "pages": 1,
        "homunculusPages": [],
        "pageHashes": ["4593107ce5159a316ab3a6a4be17e6194d3c35808172d3790a6727d0779b3583"],
    },
}

TARGET = re.compile(r"\bhomunculus servant\b")
PRINTED_TARGET = re.compile(r"\bhomunculus servant(?: stat block)? \(p\. 62\)")


def digest(data):
    return sha256(data).hexdigest()


def normalize(text):
    return " ".join(unicodedata.normalize("NFKC", text).split()).casefold()


def named_pages(texts, marker):
    return [index for index, text in enumerate(texts, 1) if marker.search(text)]


def inspect_capture(folder, filename, pin, receipt):
    raw = (folder / filename).read_bytes()
    expected = {
        "requestedUrl": pin["url"],
        "finalUrl": pin["url"],
        "status": 200,
        "outcome": "complete",
        "bodyFile": filename,
        "bytes": len(raw),
        "sha256": pin["sha256"],
    }
    if any(receipt.get(key) != value for key, value in expected.items()) or digest(raw) != pin["sha256"]:
        raise ValueError(f"Official capture does not match its pin: {filename}")

    pages = [normalize(page.extract_text()) for page in PdfReader(BytesIO(raw)).pages]
    hashes = [digest(text.encode("utf-8")) for text in pages]
    if len(pages) != pin["pages"] or hashes != pin["pageHashes"]:
        raise ValueError(f"Unexpected normalized PDF pages: {filename}")
    if f"version {pin['errataVersion']}" not in pages[0] or "personal use only" not in pages[0]:
        raise ValueError(f"Unexpected version or rights footer: {filename}")
    named = named_pages(pages, TARGET)
    printed_targets = named_pages(pages, PRINTED_TARGET)
    if named != pin["homunculusPages"] or printed_targets != pin["homunculusPages"]:
        raise ValueError(f"Unexpected Homunculus Servant markers: {filename}")
    return {
        "title": pin["title"],
        "errataVersion": pin["errataVersion"],
        **{key: receipt[key] for key in ("requestedUrl", "finalUrl", "status", "bytes", "sha256", "capturedAt")},
        "pdfPages": len(pages),
        "normalizedPageSha256": hashes,
        "namedPages": named,
        "printedPage62Markers": printed_targets,
        "rights": "personal-use printing and photocopying in the publisher footer",
    }


def audit(folder):
    folder = Path(folder)
    receipts = json.loads((folder / "capture.json").read_text(encoding="utf-8"))
    sources = {
        filename: inspect_capture(folder, filename, pin, receipts[filename])
        for filename, pin in SOURCES.items()
    }
    return {
        "schemaVersion": 1,
        "ruleset": "5e-2014",
        "subject": "Homunculus Servant",
        "sources": sources,
        "findings": {
            "eberron": {
                "scope": "Eberron errata v2.0",
                "printedPage": 62,
                "pdfPages": sources["eberron-errata.pdf"]["printedPage62Markers"],
            },
            "tasha": {
                "scope": "Tasha errata v1.0 only",
                "namedErrataFound": bool(sources["tasha-errata.pdf"]["namedPages"]),
            },
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    result = json.dumps(audit(options.folder), ensure_ascii=False, indent=2) + "\n"
    if options.output:
        options.output.write_text(result, encoding="utf-8", newline="\n")
    else:
        print(result, end="")
