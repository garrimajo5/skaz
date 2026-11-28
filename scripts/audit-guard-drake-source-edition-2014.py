"""Verify the Guard Drake errata scope across public publisher documents."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy

import pypdfium2

HELPER = runpy.run_path(str(Path(__file__).with_name("audit-skt-linked-adventure-boundaries-2014.py")))
ROOT = HELPER["ROOT"]
INDEX_EVIDENCE = "catalog/remaining-bestiary-filter-evidence-2014.json"
REPORT = ROOT / "catalog/guard-drake-source-edition-evidence-2014.json"
SOURCES = {
    "rot-toc.html": "https://www.dndbeyond.com/sources/dnd/rot",
    "rot-supplement.pdf": "https://media.wizards.com/2014/downloads/dnd/RiseTiamatSupplement.pdf",
    "tod-toc.html": "https://www.dndbeyond.com/sources/dnd/tod",
    "tod-errata.pdf": "https://media.dndbeyond.com/compendium-images/errata/ToD/ToD-Errata.pdf",
    "tod-errata.html": "https://www.dndbeyond.com/sources/dnd/sae/tyranny-of-dragons",
    "volo-errata.html": "https://www.dndbeyond.com/sources/dnd/sae/volos-guide-to-monsters",
}
HEADING = "Guard Drake (p. 185)"
TARGET = re.compile(r"\bguard\s+drakes?\b", re.IGNORECASE)
clean = HELPER["clean"]
only = HELPER["only"]
tree = HELPER["read_tree"]


def corrections(text):
    normalized = text.casefold()
    HELPER["require_text"](normalized, [
        "damage resistances entry has been cut",
        "multiattack entry",
        "one bite attack and one tail attack",
    ])
    return {
        "damageResistances": "remove-entry",
        "multiattack": [{"attack": "Bite", "count": 1}, {"attack": "Tail", "count": 1}],
    }


def digital_corrections(root):
    body = only(root.find(lambda node: node.has("p-article-content")), "errata article body")
    headings = list(body.find(lambda node: node.tag in {"h2", "h3"}))
    heading = only((node for node in headings if node.tag == "h3" and clean(node) == HEADING),
                   "Guard Drake correction")
    leading = headings[:headings.index(heading)]
    if not leading or leading[-1].tag != "h2" or clean(leading[-1]) != "Appendix D":
        raise ValueError("Guard Drake is outside Appendix D")
    siblings = [node for node in body.children if hasattr(node, "tag")]
    index = siblings.index(heading)
    following = siblings[index + 1:]
    if not following or following[0].tag != "ul" or len(list(following[0].find(lambda node: node.tag == "li"))) != 2:
        raise ValueError("Expected two clauses under the Guard Drake heading")
    return corrections(clean(following[0]))


def supplement_evidence(path):
    with pypdfium2.PdfDocument(path) as document:
        pages = [" ".join(page.get_textpage().get_text_range().split()) for page in document]
    if len(pages) != 37 or not all(pages) or "Release: October 2014 (version 1)" not in pages[0]:
        raise ValueError("Unexpected Rise of Tiamat supplement version, page count or text")
    matches = [number for number, text in enumerate(pages, 1) if TARGET.search(text)]
    if matches:
        raise ValueError("Guard Drake text now found in the supplement")
    return {"edition": "October 2014, version 1", "pagesChecked": len(pages), "textMatchPages": matches}


def scoped_toc(root, title):
    return only((section for section in root.find(lambda node: node.has("compendium-toc-full"))
                 if first_heading(section) == title), "publication contents section")


def first_heading(section):
    return next((clean(node) for node in section.find(lambda node: node.tag in {"h2", "h3"})), "")


def build(directory):
    input_bytes = (ROOT / INDEX_EVIDENCE).read_bytes().replace(b"\r\n", b"\n")
    index = json.loads(input_bytes)
    comparison = only((entry for entry in index["comparisons"] if entry["relation"] == "combined-publication"),
                      "combined publication listing")
    legacy = comparison["unavailableReferenceFilter"]
    if legacy["referenceSourceId"] != "106":
        raise ValueError("The historical Rise claim changed")
    old_toc = scoped_toc(tree(directory / "rot-toc.html"), "Contents")
    if any(old_toc.find(lambda node: node.tag == "a" and clean(node) == "Guard Drake")):
        raise ValueError("A dedicated locator is now present in the Rise contents")
    rise_locator = HELPER["find_link"](old_toc, "Appendix D: Monsters", "/sources/rot/appendix-d-monsters")
    combined_toc = scoped_toc(tree(directory / "tod-toc.html"), "Appendix D: Monsters")
    tod_locator = HELPER["find_link"](combined_toc, "Guard Drake", "/sources/tod/monsters#GuardDrake")
    pdf = HELPER["read_page"](directory / "tod-errata.pdf", 1)
    HELPER["require_text"](pdf, ["Tyranny of Dragons", "Version 1.0", "Appendix D", HEADING])
    pdf_corrections = corrections(HELPER["section"](pdf, HEADING, "Pharblex Spattergoo"))
    html = tree(directory / "tod-errata.html")
    if not any(html.find(lambda node: node.tag == "h1" and clean(node) == "Tyranny of Dragons")):
        raise ValueError("Unexpected errata publication")
    if digital_corrections(html) != pdf_corrections:
        raise ValueError("PDF and digital corrections disagree")
    volo = tree(directory / "volo-errata.html")
    if not any(volo.find(lambda node: node.tag == "h1" and clean(node) == "Volo’s Guide to Monsters")):
        raise ValueError("Unexpected Volo errata publication")
    headings = volo.find(lambda node: node.tag in {"h2", "h3", "h4"} and TARGET.search(clean(node)))
    if any(headings):
        raise ValueError("Volo has a named Guard Drake correction now")

    sources = {}
    for name, url in SOURCES.items():
        raw = (directory / name).read_bytes()
        sources[name] = {"url": url, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
    return {
        "schemaVersion": 1,
        "checkedOn": "2026-11-28",
        "rulesetTarget": "5e-2014",
        "sources": sources,
        "riseOfTiamat": {
            "originalClaimKey": legacy["unresolvedClaimKey"],
            "originalAppendixLocator": rise_locator,
            "namedLocatorInArchivedContents": False,
            "supplement": supplement_evidence(directory / "rot-supplement.pdf"),
            "originalBlockVerified": False,
        },
        "tyrannyOfDragons": {
            "namedLocator": tod_locator,
            "appendix": "D",
            "printedPage": 185,
            "pdfPage": 1,
            "pdfVersion": "1.0 (2023)",
            "crossCheckedWithDigitalErrata": True,
            "changes": pdf_corrections,
            "appliesTo": "guard-drake-in-combined-tyranny-of-dragons",
            "fullBlockVerified": False,
        },
        "voloErrata": {"namedGuardDrakeHeadingInCheckedErrata": False},
        "applyToOtherPublications": False,
        "accepted": False,
        "approvedDenominator": None,
        "textReusePermission": "not-established",
        "inputSha256": {INDEX_EVIDENCE: hashlib.sha256(input_bytes).hexdigest()},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    evidence = build(args.directory)
    if args.write:
        REPORT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    if evidence != json.loads(REPORT.read_text(encoding="utf-8")):
        raise SystemExit("Guard Drake edition evidence differs from the tracked report")
    print("Verified two scoped Tyranny of Dragons corrections and six publisher captures")
