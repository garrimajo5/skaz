"""Check the remaining creature corrections in Tyranny of Dragons Appendix D."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
from urllib.parse import urlencode

HERE = Path(__file__).resolve().parent
EDITION = runpy.run_path(str(HERE / "audit-guard-drake-source-edition-2014.py"))
FILTERS = runpy.run_path(str(HERE / "audit-remaining-bestiary-filters-2014.py"))
ROOT = EDITION["ROOT"]
REGISTER = "catalog/scope-register-2014.json"
PREVIOUS = "catalog/guard-drake-source-edition-evidence-2014.json"
REPORT = ROOT / "catalog/tod-npc-errata-evidence-2014.json"
SITE = "https://www.dndbeyond.com"
BOOK = "Tyranny of Dragons"
ENTRIES = (
    ("Pharblex Spattergoo", "Pharblex Spattergoo", "PharblexSpattergoo", "3337", "105", "17475"),
    ("Neronvain", "Nerovain", "Neronvain", "485", "106", "21907"),
)
SOURCE_FILES = {
    "tod-errata.pdf": EDITION["SOURCES"]["tod-errata.pdf"],
    "tod-errata.html": EDITION["SOURCES"]["tod-errata.html"],
    "tod-toc.html": EDITION["SOURCES"]["tod-toc.html"],
    "rot-toc.html": EDITION["SOURCES"]["rot-toc.html"],
}
clean = EDITION["clean"]
only = EDITION["only"]
helpers = EDITION["HELPER"]


def errata_text(root, name):
    body = only(root.find(lambda node: node.has("p-article-content")), "errata article body")
    elements = [node for node in body.children if hasattr(node, "tag")]
    heading = only((node for node in elements if node.tag == "h3" and clean(node) == name + " (p. 187)"),
                   name + " errata heading")
    index = elements.index(heading)
    earlier_sections = [node for node in elements[:index] if node.tag == "h2"]
    if not earlier_sections or clean(earlier_sections[-1]) != "Appendix D":
        raise ValueError(f"{name} correction is outside Appendix D")
    block = []
    for node in elements[index + 1:]:
        if node.tag in {"h2", "h3"}:
            break
        block.append(clean(node))
    return " ".join(block)


def amendments(text, printed):
    """Read only the three announced changes, with unknown old save DC."""
    if printed == "Pharblex Spattergoo":
        if not re.search(r"spellcasting trait.+poison cloud.+now.+poison spray", text, re.I):
            raise ValueError("Pharblex spell replacement changed")
        return [{"field": "spellcastingSpell", "from": "Poison Cloud", "to": "Poison Spray"}]
    attack = re.search(r"shortsword action.+?attack modifier.+?from (\+\d+) to (\+\d+)", text, re.I)
    dc = re.search(r"poisonous cloud action.+?DC in the third sentence (?:has changed to|is now) (\d+)", text, re.I)
    if not attack or not dc:
        raise ValueError("Nerovain attack modifier or save DC correction changed")
    return [
        {"action": "Shortsword", "field": "attackModifier", "from": int(attack[1]), "to": int(attack[2])},
        {"action": "Poisonous Cloud", "field": "saveDc", "from": None, "to": int(dc[1])},
    ]


def selected_row(directory, query, sources):
    filename = f"{query.replace(' ', '-')}-102.html"
    raw = (directory / filename).read_bytes()
    sources[filename] = {
        "url": SITE + "/monsters?" + urlencode({"filter-search": query, "filter-source": "102"}),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    return FILTERS["query_evidence"](raw, query, "102", BOOK)


def build(directory):
    raw_inputs = {filename: (ROOT / filename).read_bytes().replace(b"\r\n", b"\n")
                  for filename in (REGISTER, PREVIOUS)}
    original = {item["id"]: item for item in json.loads(raw_inputs[REGISTER])["records"]}
    pins = json.loads(raw_inputs[PREVIOUS])["sources"]
    sources = {}
    for filename, url in SOURCE_FILES.items():
        raw = (directory / filename).read_bytes()
        sources[filename] = {"url": url, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
        if sources[filename] != pins[filename]:
            raise ValueError(f"Previously verified publisher capture changed: {filename}")

    combined = EDITION["tree"](directory / "tod-toc.html")
    appendix = EDITION["scoped_toc"](combined, "Appendix D: Monsters")
    contents = EDITION["scoped_toc"](combined, "Contents")
    separate_rise = EDITION["scoped_toc"](EDITION["tree"](directory / "rot-toc.html"), "Contents")
    digital = EDITION["tree"](directory / "tod-errata.html")
    pdf = helpers["read_page"](directory / "tod-errata.pdf", 1)
    old_story = helpers["find_link"](separate_rise, "Neronvain", "/sources/rot/death-to-the-wyrmspeakers#Episode4Neronvain")
    new_story = helpers["find_link"](contents, "Neronvain", "/sources/tod/death-to-the-wyrmspeakers#Neronvain")
    old_appendix = helpers["find_link"](separate_rise, "Appendix D: Monsters", "/sources/rot/appendix-d-monsters")

    first = "Pharblex Spattergoo (p. 187)"
    last = "Nerovain (p. 187)"
    appendix_pdf = pdf[pdf.index("Guard Drake (p. 185)"):]
    if appendix_pdf.count(first) != 1 or appendix_pdf.count(last) != 2:
        raise ValueError("Unexpected number of changes in Appendix D")
    published = {
        "Pharblex Spattergoo": helpers["section"](appendix_pdf, first, last),
        "Nerovain": appendix_pdf[appendix_pdf.index(last):],
    }
    entries = []
    for name, errata_name, anchor, observation_id, source_id, card_id in ENTRIES:
        observation = original["dndsu:bestiary:" + observation_id]
        if observation["names"]["en"] != name or observation["sourceIds"] != [source_id]:
            raise ValueError(f"Original claim changed: {name}")
        link = helpers["find_link"](appendix, name, "/sources/tod/monsters#" + anchor)
        row = only(selected_row(directory, name.lower(), sources), name + " filtered row")
        if row["nameMatch"] != "exact" or row["displayedPublication"] != BOOK or not row["cardUrl"].startswith(SITE + "/monsters/" + card_id + "-"):
            raise ValueError(f"Unexpected combined edition card: {name}")
        changes = amendments(errata_text(digital, errata_name), errata_name)
        if changes != amendments(published[errata_name], errata_name):
            raise ValueError(f"PDF and digital corrections disagree for {name}")
        entries.append({
            "originalObservationId": observation["id"],
            "originalSourceIds": observation["sourceIds"],
            "namedAppendixUrl": link,
            "errataHeading": errata_name,
            "digitalCard": row,
            "changesInCombinedEdition": changes,
            "originalEditionBlockVerified": False,
        })
    if selected_row(directory, "nerovain", sources):
        raise ValueError("The spelling from the errata has a digital match now")
    return {
        "schemaVersion": 1,
        "checkedOn": "2026-11-28",
        "rulesetTarget": "5e-2014",
        "scope": {"publication": BOOK, "appendix": "D", "printedPage": 187, "pdfPage": 1},
        "sources": sources,
        "entries": entries,
        "neronvainLocators": {
            "historicalStory": old_story,
            "historicalAppendix": old_appendix,
            "combinedStory": new_story,
            "combinedAppendix": entries[1]["namedAppendixUrl"],
            "errataSpellingSearchResult": "empty",
        },
        "automaticAlias": False,
        "applyToOriginalVersions": False,
        "fullStatBlocksVerified": False,
        "textReusePermission": "not-established",
        "accepted": False,
        "approvedDenominator": None,
        "inputSha256": {name: hashlib.sha256(value).hexdigest() for name, value in raw_inputs.items()},
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
        raise SystemExit("Tyranny NPC errata evidence differs from the tracked report")
    print("Verified three scoped corrections and seven publisher captures")
