"""Verify the boundary between HotDQ, its online supplements and combined ToD."""

import argparse
import json
import re
import runpy
from pathlib import Path

import pypdfium2

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'catalog/hotdq-monster-locators-2014.json'
PREVIOUS = ROOT / 'catalog/skt-linked-adventure-boundaries-2014.json'
SKT = runpy.run_path(str(ROOT / 'scripts/audit-skt-linked-adventure-boundaries-2014.py'))
digest, find_link, read_tree = (SKT[key] for key in ('digest', 'find_link', 'read_tree'))

SOURCES = {
    'hotdq-toc.html': 'https://www.dndbeyond.com/sources/dnd/hotdq',
    'tod-toc.html': 'https://www.dndbeyond.com/sources/dnd/tod',
    'hotdq-supplement-v1.pdf': 'https://media.wizards.com/2014/downloads/dnd/HoardDragonQueen_Supplement1.pdf',
    'hotdq-supplement-v0.3.pdf': 'https://media.wizards.com/2014/downloads/dnd/HoardDragonQueen_Supplement_v0.3.pdf',
    'skt-errata.pdf': 'https://media.wizards.com/2021/dnd/downloads/SKT-Errata.pdf',
}


def verify_supplement(path, version, expected_pages, stone_page):
    with pypdfium2.PdfDocument(path) as document:
        texts = [page.get_textpage().get_text_range() for page in document]
    if len(texts) != expected_pages or version not in texts[0].lower():
        raise ValueError(f'Supplement version or page count changed: {path.name}')
    headings = [
        number for number, text in enumerate(texts, 1)
        if any(re.fullmatch('Stone Giant', line.strip(), re.I) for line in text.splitlines())
    ]
    if headings != [stone_page]:
        raise ValueError(f'Stone Giant heading changed: {path.name}')
    named_pages = [number for number, text in enumerate(texts, 1)
                   if re.search(r'\bblagothkus\b', text, re.I)]
    if named_pages:
        raise ValueError(f'Named figure found in the supplement: {path.name}')
    return {
        'source': path.name,
        'version': version.removeprefix('version '),
        'pdfPages': expected_pages,
        'stoneGiantPdfPage': stone_page,
        'blagothkusTextMatchPages': named_pages,
    }


def build(directory):
    evidence = {}
    for filename, url in SOURCES.items():
        raw = (directory / filename).read_bytes()
        evidence[filename] = {'url': url, 'bytes': len(raw), 'sha256': digest(raw)}

    hotdq = read_tree(directory / 'hotdq-toc.html')
    tod = read_tree(directory / 'tod-toc.html')
    if any(hotdq.find(lambda node: node.tag == 'a' and SKT['clean'](node) == 'Blagothkus')):
        raise ValueError('The separate Hoard contents now has a named locator')
    old_raw = PREVIOUS.read_bytes()
    old = json.loads(old_raw)
    old_link = old['officialHeadingLinks']['Blagothkus']
    named_link = find_link(tod, 'Blagothkus', '/sources/tod/monsters#Blagothkus')
    if named_link != old_link:
        raise ValueError('Combined ToD named locator no longer matches the D06 observation')

    errata_text = SKT['read_page'](directory / 'skt-errata.pdf', 2)
    SKT['require_text'](errata_text, (
        'Development (p. 129)', 'Hoard of the Dragon Queen (p. 231)',
        'The heading is now', 'the first three paragraphs', 'Blagothkus',
    ))
    return {
        'schemaVersion': 1,
        'scope': 'D06 locator evidence only',
        'ruleset': '5e-2014',
        'asOf': '2026-11-25',
        'sources': evidence,
        'previousD06Sha256': digest(old_raw.replace(b'\r\n', b'\n')),
        'separateHoardToc': {
            'castleChapter': find_link(hotdq, 'Chapter 8: Castle in the Clouds', '/sources/hotdq/castle-in-the-clouds'),
            'appendixBLabel': 'Council Scorecard',
            'appendixBLocator': find_link(hotdq, 'Appendix B: Council Scorecard', '/sources/hotdq/appendix-b-council-scorecard'),
            'appendixDLabel': 'Monsters',
            'appendixDLocator': find_link(hotdq, 'Appendix D: Monsters', '/sources/hotdq/appendix-d-monsters'),
            'verifiedSurface': 'public-contents-only',
        },
        'combinedTyrannyToc': {
            'appendixDLabel': 'Monsters',
            'appendixDLocator': find_link(tod, 'Appendix D: Monsters', '/sources/tod/monsters'),
            'blagothkusLocator': named_link,
            'verifiedSurface': 'public-contents-and-named-link',
        },
        'hoardOnlineSupplements': [
            verify_supplement(directory / 'hotdq-supplement-v1.pdf', 'version 1', 30, 18),
            verify_supplement(directory / 'hotdq-supplement-v0.3.pdf', '0.3', 28, 17),
        ],
        'sktErrata': {
            'source': 'skt-errata.pdf',
            'pdfPage': 2,
            'bookPages': [129, 231],
            'change': 'combined-adventure-reference-and-opening-paragraphs',
            'addsFullStatBlock': False,
        },
        'baselineObservationId': old['blagothkus']['observation']['id'],
        'identityDecision': 'keep-observation-and-publication-locators-separate',
        'fullBlockEquivalence': 'unverified',
        'rightsDecision': 'unverified',
        'runtimeCatalogChanges': [],
        'denominatorChanges': [],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path, help='directory of original publisher snapshots')
    parser.add_argument('--write', action='store_true', help='write the report explicitly')
    args = parser.parse_args()
    report = build(args.directory)
    if args.write:
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    elif report != json.loads(REPORT.read_text(encoding='utf-8')):
        raise SystemExit('Saved primary evidence differs from the report')
    print('Verified {} original sources and separate Hoard, ToD and SKT locators.'.format(len(report['sources'])))


if __name__ == '__main__':
    main()
