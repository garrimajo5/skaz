"""Verify exact D&D Beyond spell-filter captures without reading spell rules."""

import argparse
import hashlib
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCOPE_PATH = "catalog/scope-register-2014.json"
EEPC_PATH = "catalog/eepc-spell-inventory-2014.json"
OUTPUT_PATH = ROOT / "catalog/xge-eepc-spell-locators-2014.json"
ORIGIN = "https://www.dndbeyond.com"

FILTERS = {
    "xge": ("27", "xanathars-guide-to-everything", 5),
    "ee": ("4", "elemental-evil-players-companion", 3),
    "pota": ("10", "princes-of-the-apocalypse", 1),
}
CARD = re.compile(r'<a href="(/spells/\d+-[a-z0-9-]+)" class="link">([^<]+)</a>')


def key(name):
    return name.replace("\u2019", "'").casefold()


def url_for(value, page):
    return f"{ORIGIN}/spells?filter-source={value}" + (f"&page={page}" if page != 1 else "")


def parse_page(text, value, book, number, page_count):
    select = re.search(r'<select\b[^>]*\bid="filter-source"[^>]*>(.*?)</select>', text, re.DOTALL)
    if select is None:
        raise ValueError("Source selector missing")
    selected = [
        tag for tag in re.findall(r"<option\b[^>]*>", select[1])
        if 'selected="selected"' in tag
    ]
    if len(selected) != 1 or f'value="{value}"' not in selected[0] or (
        f'id="filter-source-{book}"' not in selected[0]
    ):
        raise ValueError("Unexpected selected source")

    listing_start = text.find('<ul class="listing listing-rpgspell rpgspell-listing"')
    listing_end = text.find('<div class="listing-footer">', listing_start)
    if listing_start < 0 or listing_end < 0:
        raise ValueError("Spell listing missing")
    active = set(re.findall(r'<span class="b-pagination-item s-active active">(\d+)</span>', text))
    next_urls = {html.unescape(url) for url in re.findall(r'<a href="([^"]+)" rel="next"', text)}
    expected_next = {url_for(value, number + 1).removeprefix(ORIGIN)} if number < page_count else set()
    if active != ({str(number)} if page_count > 1 else set()) or next_urls != expected_next:
        raise ValueError("Pagination differs from the recorded traversal")

    return [(html.unescape(name).strip(), ORIGIN + path) for path, name in CARD.findall(
        text[listing_start:listing_end]
    )]


def capture(directory, tag):
    value, book, page_count = FILTERS[tag]
    pages = []
    by_name = {}
    seen_urls = set()
    for page in range(1, page_count + 1):
        path = directory / f"skaz-ddb-{tag}-spells-{page}-20261124.html"
        raw = path.read_bytes()
        cards = parse_page(raw.decode("utf-8"), value, book, page, page_count)
        pages.append({
            "page": page,
            "url": url_for(value, page),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "rowCount": len(cards),
        })
        for name, card_url in cards:
            normalized = key(name)
            if normalized in by_name or card_url in seen_urls:
                raise ValueError("Duplicate spell name or URL in filter: " + name)
            seen_urls.add(card_url)
            by_name[normalized] = {"name": name, "cardUrl": card_url, "indexPage": page}

    return by_name, {"value": value, "optionId": "filter-source-" + book, "pages": pages}


def build(directory):
    xge, xge_capture = capture(directory, "xge")
    ee, ee_capture = capture(directory, "ee")
    pota, pota_capture = capture(directory, "pota")
    if pota:
        raise ValueError("PotA filter returned rows and needs a new review")

    raw = {path: (ROOT / path).read_bytes() for path in (SCOPE_PATH, EEPC_PATH)}
    xge_observations = [
        row for row in json.loads(raw[SCOPE_PATH])["records"]
        if row["section"] == "spells" and "109" in row["sourceIds"]
    ]
    observations_by_name = {key(row["names"]["en"]): row for row in xge_observations}
    if xge.keys() != observations_by_name.keys() or len(xge) != len(xge_observations):
        raise ValueError("XGE filter and source 109 observations differ")

    eepc = json.loads(raw[EEPC_PATH])["records"]
    eepc_ids = {key(row["observedName"]): row["observationId"] for row in eepc}
    if ee.keys() != eepc_ids.keys() or len(ee) != len(eepc) or not ee.keys() <= xge.keys():
        raise ValueError("EEPC filter and PDF inventory differ")

    records = []
    for normalized, row in sorted(observations_by_name.items()):
        edition = xge[normalized]
        cross_listed = ee.get(normalized)
        if cross_listed and (
            cross_listed["cardUrl"] != edition["cardUrl"] or eepc_ids[normalized] != row["id"]
        ):
            raise ValueError("Cross-listed card or observation identity differs: " + normalized)
        records.append({
            "observationId": row["id"],
            "originalSourceIds": row["sourceIds"],
            "digitalName": edition["name"],
            "cardUrl": edition["cardUrl"],
            "xgeIndexPage": edition["indexPage"],
            "eepcIndexPage": cross_listed["indexPage"] if cross_listed else None,
        })

    return {
        "schemaVersion": 1,
        "status": "digital-source-filter-membership-verified",
        "inputSha256": {path: hashlib.sha256(content).hexdigest() for path, content in raw.items()},
        "filters": {"xge": xge_capture, "eepc": ee_capture, "pota": pota_capture},
        "counts": {"xgeRows": len(xge), "eepcRows": len(ee), "potaRows": len(pota),
                   "sharedDigitalUrls": len(ee)},
        "records": records,
        "printedVersionEquivalence": "unverified",
        "directPotaAppendixRead": False,
        "fullRulesVerified": False,
        "textReusePermission": "not-established",
        "approvedDenominator": None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = build(args.directory)

    if args.output:
        with args.output.open("x", encoding="utf-8", newline="\n") as target:
            json.dump(result, target, ensure_ascii=False, indent=2)
            target.write("\n")
    elif result != json.loads(OUTPUT_PATH.read_text(encoding="utf-8")):
        raise SystemExit("Recorded spell filter evidence differs from current captures")
    print(json.dumps(result["counts"]))


if __name__ == "__main__":
    main()
