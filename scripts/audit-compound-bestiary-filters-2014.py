"""Verify selected publication filters against a bounded set of public D&D Beyond index captures."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog"
SITE = "https://www.dndbeyond.com"
INPUT = CATALOG / "remaining-bestiary-attribution-proposals-2014.json"
OUTPUT = CATALOG / "compound-bestiary-filter-evidence-2014.json"
HELPER = runpy.run_path(str(Path(__file__).with_name("audit-fiendish-folio-index.py")))
# The publisher's filter values and the reference catalog's source IDs are distinct.
FILTERS = {
    "chwinga": [
        ("25", "114", "Tomb of Annihilation"),
        ("66", "120", "Icewind Dale: Rime of the Frostmaiden"),
        ("68", "122", "Candlekeep Mysteries"),
        ("90", "160", "Spelljammer: Adventures in Space"),
    ],
    "orcus": [
        ("9", "129", "Out of the Abyss"),
        ("33", "113", "Mordenkainen’s Tome of Foes"),
        ("85", "158", "Mordenkainen Presents: Monsters of the Multiverse"),
    ],
    "wereraven": [
        ("6", "124", "Curse of Strahd"),
        ("68", "122", "Candlekeep Mysteries"),
        ("69", "125", "Van Richten’s Guide to Ravenloft"),
    ],
}


def publication_selector(root):
    return HELPER["only"](root.find(
        lambda n: n.tag == "select"
        and n.attrs.get("id") == "filter-source"
        and n.attrs.get("name") == "filter-source"
    ), "publication selector")


def selected_listing(raw, filter_value, label, query=None):
    tree = HELPER["Tree"]()
    tree.feed(raw.decode("utf-8"))
    selector = publication_selector(tree.root)
    selection = HELPER["only"](selector.find(
        lambda n: n.tag == "option" and "selected" in n.attrs
    ), "selected publication")
    if selection.attrs.get("value") != filter_value or HELPER["clean"](selection) != label:
        raise ValueError("Captured publication filter differs from the chosen one")

    if query is not None:
        field = HELPER["only"](tree.root.find(
            lambda n: n.tag == "input"
            and n.attrs.get("id") == "filter-search"
            and n.attrs.get("name") == "filter-search"
        ), "monster search field")
        if field.attrs.get("value") != query:
            raise ValueError("Captured search differs from the chosen query")
        for link in tree.root.find(lambda n: n.tag == "a" and "href" in n.attrs):
            href = urlsplit(link.attrs["href"])
            if href.path == "/monsters" and "page" in parse_qs(href.query):
                raise ValueError("Paginated search requires further captures")

    return HELPER["only"](tree.root.find(
        lambda n: n.tag == "ul" and n.has("rpgmonster-listing")
    ), "monster listing")


def discover_rows(raw, filter_value, label, query=None):
    listing = selected_listing(raw, filter_value, label, query)
    empty_rows = list(listing.find(lambda node: node.tag == "li" and node.has("no-results")))
    monster_rows = list(listing.find(lambda node: node.attrs.get("data-type") == "monsters"))
    if empty_rows:
        if len(empty_rows) != 1 or monster_rows:
            raise ValueError("Conflicting or repeated empty index markers")
        return []
    rows = HELPER["read_index_rows"](listing)
    if len(rows) != len(monster_rows):
        raise ValueError("Unrecognized monster rows in the selected listing")
    for node, row in zip(monster_rows, rows, strict=True):
        if row["cardUrl"] != SITE + "/monsters/" + node.attrs.get("data-slug", ""):
            raise ValueError("Digital card does not match its row")
    return rows


def extract(raw, name, filter_value, label):
    listing = selected_listing(raw, filter_value, label)
    row = HELPER["only"](listing.find(lambda n: n.attrs.get("data-type") == "monsters"), "monster row")
    link = HELPER["only"](row.find(
        lambda n: n.tag == "a" and re.fullmatch(r"/monsters/[0-9]+-[a-z0-9-]+", n.attrs.get("href", ""))
    ), "digital card link")
    if link.attrs["href"] != "/monsters/" + row.attrs.get("data-slug", ""):
        raise ValueError("Digital card does not match its row")
    displayed_name = HELPER["clean"](link)
    match = "exact"
    if displayed_name.lower() != name:
        if (name, filter_value, displayed_name) != ("chwinga", "90", "Chwinga Astronaut"):
            raise ValueError("Listing changed; recheck the selected publication")
        match = "related-name-only"
    source = HELPER["clean"](HELPER["only"](row.find(lambda n: n.has("source")), "displayed publication"))
    if not source:
        raise ValueError("Missing displayed publication")
    return {
        "name": displayed_name,
        "cardUrl": urljoin(SITE, link.attrs["href"]),
        "displayedPublication": source,
        "match": match,
    }


def build(directory):
    proposal_bytes = INPUT.read_bytes()
    proposals = {group["name"]: group for group in json.loads(proposal_bytes)["groups"]}
    groups = []
    for name, sources in FILTERS.items():
        proposal = proposals[name]
        claims = {claim["sourceId"]: claim for claim in proposal["publicationClaims"]}
        if len(claims) != len(proposal["publicationClaims"]) or set(claims) != {source for _, source, _ in sources}:
            raise ValueError(f"Changed reference publication scope for {name}")
        observations = []
        for value, source, label in sources:
            raw = (directory / f"{name}-{value}.html").read_bytes()
            observations.append({
                "claimKey": claims[source]["claimKey"],
                "referenceSourceId": source,
                "publisherFilterValue": value,
                "selectedPublisherLabel": label,
                "url": f"{SITE}/monsters?" + urlencode({"filter-search": name, "filter-source": value}),
                "bytes": len(raw),
                "htmlSha256": hashlib.sha256(raw).hexdigest(),
                "card": extract(raw, name, value, label),
            })
        groups.append({
            "name": name,
            "reviewId": proposal["reviewId"],
            "observations": observations,
        })
    return {
        "schemaVersion": 1,
        "checkedOn": "2026-11-28",
        "evidenceKind": "publisher-selected-bestiary-filter",
        "groups": groups,
        "accepted": False,
        "fullRulesVerified": False,
        "automaticMerge": False,
        "approvedDenominator": None,
        "textReusePermission": "not-established",
        "inputSha256": {"catalog/" + INPUT.name: hashlib.sha256(proposal_bytes).hexdigest()},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="Directory of already captured HTML files")
    parser.add_argument("--write", action="store_true", help="Replace the tracked evidence after manually reviewing changes")
    args = parser.parse_args()
    evidence = build(args.directory)
    if args.write:
        OUTPUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    if evidence != json.loads(OUTPUT.read_text(encoding="utf-8")):
        raise SystemExit("Evidence differs from the tracked report")
    print("Verified 10 publication filters across 3 bestiary groups")
