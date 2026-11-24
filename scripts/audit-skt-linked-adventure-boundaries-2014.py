"""Verify the public SKT Appendix A and the named references around it."""

import argparse
import hashlib
import json
import runpy
from pathlib import Path
from urllib.parse import urljoin

import pypdfium2

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'catalog/skt-linked-adventure-boundaries-2014.json'
INDEX = runpy.run_path(str(ROOT / 'scripts/audit-fiendish-folio-index.py'))
Tree, only, clean = (INDEX[key] for key in ('Tree', 'only', 'clean'))

SOURCES = {
    'skt-appendix-a.pdf': 'https://media.wizards.com/2016/dnd/downloads/EL2_SKT_AppA_0821.pdf',
    'skt-errata.pdf': 'https://media.wizards.com/2021/dnd/downloads/SKT-Errata.pdf',
    'skt-errata-ddb.html': 'https://www.dndbeyond.com/sources/dnd/sae/storm-kings-thunder',
    'tod-toc.html': 'https://www.dndbeyond.com/sources/dnd/tod',
    'tod-errata.pdf': 'https://media.dndbeyond.com/compendium-images/errata/ToD/ToD-Errata.pdf',
    'pota-toc.html': 'https://www.dndbeyond.com/sources/dnd/pota',
    'monster-index.html': 'https://www.dndbeyond.com/Monsters?page=21',
    'skt-monster-index-2.html': 'https://www.dndbeyond.com/monsters?filter-source=12&page=2',
}
INPUTS = (
    'catalog/scope-register-2014.json',
    'catalog/skt-index-review-2014.json',
    'catalog/skt-index-residual-2014.json',
    'catalog/srd51-giants.json',
    'catalog/srd51-spirits.json',
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def read_page(path, number):
    with pypdfium2.PdfDocument(path) as document:
        page = document[number - 1].get_textpage().get_text_range()
        return ' '.join(page.replace('\ufffe', '').replace('\xad', '').split())


def require_text(text, phrases):
    for phrase in phrases:
        if phrase not in text:
            raise ValueError('Expected primary locator or metadata changed: ' + phrase)


def section(text, start, stop):
    return text[text.index(start):text.index(stop, text.index(start) + len(start))]


def read_tree(path):
    tree = Tree()
    tree.feed(path.read_text(encoding='utf-8'))
    return tree.root


def find_link(tree, name, suffix):
    matches = {
        node.attrs['href']
        for node in tree.find(lambda n: n.tag == 'a' and clean(n) == name)
        if node.attrs.get('href', '').endswith(suffix)
    }
    href = only(matches, name + ' official locator')
    return urljoin('https://www.dndbeyond.com', href)


def read_monster_index(tree):
    listing = only(tree.find(lambda n: n.tag == 'ul' and n.has('rpgmonster-listing')), 'monster list')
    rows = INDEX['read_index_rows'](listing, allow_blank_cr=True)
    return {row['cardUrl'].split('/')[-1]: row for row in rows}


def observed(records, identifier):
    row = records[identifier]
    return {
        'id': identifier,
        'name': row['names']['en'],
        'sourceIds': row['sourceIds'],
        'url': row['url'],
    }


def base_reference(path, identifier):
    entry = only((e for e in load(path)['entries'] if e['id'] == identifier), identifier)
    monster = entry['monster']
    return {
        'id': identifier,
        'size': monster['size'],
        'challengeRating': monster['challenge'],
        'role': 'separate-srd-reference',
    }


def build(directory):
    source_metadata = {}
    for file, url in SOURCES.items():
        raw = (directory / file).read_bytes()
        source_metadata[file] = {'url': url, 'bytes': len(raw), 'sha256': digest(raw)}

    page231 = read_page(directory / 'skt-appendix-a.pdf', 1)
    page232 = read_page(directory / 'skt-appendix-a.pdf', 2)
    old = page231[page231.index('Hoard of the Dragon Queen'):]
    require_text(page231, ['APPENDIX A | Linked Adventures 231'])
    require_text(old, ['Skyreach Castle', 'cloud giant, Blagothkus', 'ghost of his dead son, Eigeron', 'The Chosen Path'])
    require_text(page232, ['APPENDIX A | Linked Adventures 232'])
    earth = section(page232, 'Using the Elemental Cults', 'The Cult of the Eternal Flame')
    require_text(earth, ['Princes of the Apocalypse', 'The Cult of the Black Earth sends cultists to Deadstone Cleft', 'Canyon of the Stone Giants', 'Thane Kayalithica'])

    updates = read_page(directory / 'skt-errata.pdf', 2)
    linked_update = section(updates, 'Appendix A', 'effects on Blagothkus:')
    require_text(linked_update, ['Hoard of the Dragon Queen (p. 231)', 'heading is now “Tyranny of Dragons,”',
                                 'first three paragraphs', 'Skyreach Castle', 'cloud giant named Blagothkus',
                                 'ghost of his dead son, Eigeron', 'The Chosen Path'])
    # The consolidation errata opens independently from the monster body.
    tod_updates = read_page(directory / 'tod-errata.pdf', 1)
    require_text(tod_updates, ['Tyranny of Dragons', 'Appendix D', 'Guard Drake'])

    skt_errata = read_tree(directory / 'skt-errata-ddb.html')
    tod_contents = read_tree(directory / 'tod-toc.html')
    pota_contents = read_tree(directory / 'pota-toc.html')
    main_index = read_monster_index(read_tree(directory / 'monster-index.html'))
    skt_index = INDEX['parse_page'](
        (directory / 'skt-monster-index-2.html').read_text(encoding='utf-8'),
        '12', 'filter-source-storm-kings-thunder', allow_blank_cr=True,
    )['rows']
    spirit = only((row for row in skt_index if row['cardUrl'].endswith('/299573-eigerons-spirit')), 'Eigeron')

    register = {r['id']: r for r in load(INPUTS[0])['records']}
    previous_spirit = only((r for r in load(INPUTS[1])['records'] if r['cardUrl'] == spirit['cardUrl']), 'Spirit review')
    cultist = main_index['297972-black-earth-cultist']
    previous_cultist = only((r for r in load(INPUTS[2])['publisherResidual'] if r['cardUrl'] == cultist['cardUrl']), 'Cultist residual')
    blagothkus = main_index['17468-blagothkus']
    targets = {
        'Tyranny of Dragons': find_link(skt_errata, 'Tyranny of Dragons', '/sources/tod'),
        'The Chosen Path': find_link(skt_errata, 'The Chosen Path', '/sources/skt/the-chosen-path#EigeronsGhost'),
        'Blagothkus': find_link(tod_contents, 'Blagothkus', '/sources/tod/monsters#Blagothkus'),
        'Cult of the Black Earth': find_link(pota_contents, 'Cult of the Black Earth', '/sources/pota/rise-of-elemental-evil#CultoftheBlackEarth'),
        'Black Earth Cultists': find_link(pota_contents, 'Black Earth Cultists', '/sources/pota/monsters-and-magic-items#BlackEarthCultists'),
    }
    return {
        'schemaVersion': 1,
        'rulesetTarget': '5e-2014',
        'checkedOn': '2026-11-24',
        'status': 'primary-linked-adventure-and-index-witnesses',
        'accepted': False,
        'historicalBookInventoryComplete': False,
        'fullStatBlocksVerified': False,
        'approvedDenominator': None,
        'reusePermission': 'not-established',
        'sources': source_metadata,
        'inputSha256': {path: digest((ROOT / path).read_bytes()) for path in INPUTS},
        'officialHeadingLinks': targets,
        'sktAppendixA': {
            'oldPrint': {'printedPage': 231, 'pdfPage': 1, 'section': 'Hoard of the Dragon Queen'},
            'errata': {'printedPage': 231, 'pdfPage': 2, 'headingAfter': 'Tyranny of Dragons',
                       'replacementParagraphsAnnounced': 3, 'scope': 'linked-adventure-prose'},
            'location': 'Skyreach Castle',
            'namedCloudGiant': 'Blagothkus',
            'namedGhostReference': 'Eigeron',
            'sktChapterReference': 'The Chosen Path',
        },
        'blagothkus': {
            'relation': 'named-npc-mentioned-in-linked-adventure',
            'index': blagothkus,
            'observation': observed(register, 'dndsu:bestiary:3330'),
            'separateSrdReference': base_reference(INPUTS[3], 'srd51:2014:monster:cloud-giant'),
            'canonicalId': None,
            'automaticAlias': False,
            'fullStatBlock': 'unverified',
        },
        'eigeron': {
            'relation': 'named-narrative-witness-with-digital-name-candidate',
            'index': spirit,
            'observation': observed(register, 'dndsu:bestiary:7738'),
            'previousReviewStatus': previous_spirit['status'],
            'separateSrdReference': base_reference(INPUTS[4], 'srd51:2014:monster:ghost'),
            'canonicalId': None,
            'automaticAlias': False,
            'fullStatBlock': 'unverified',
        },
        'blackEarth': {
            'relation': 'faction-reference-with-separate-digital-listings',
            'witness': {'printedPage': 232, 'pdfPage': 2, 'sidebar': 'Using the Elemental Cults',
                        'faction': 'Cult of the Black Earth', 'encounterLocation': 'Deadstone Cleft',
                        'sktChapter': 6, 'sktChapterTitle': 'Canyon of the Stone Giants'},
            'index': [cultist, main_index['17428-black-earth-guard'], main_index['17429-black-earth-priest']],
            'observations': [observed(register, 'dndsu:bestiary:4915'), observed(register, 'dndsu:bestiary:4912')],
            'previousCultistStatus': previous_cultist['category'],
            'canonicalId': None,
            'automaticAlias': False,
            'fullStatBlocks': 'unverified',
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--write', action='store_true', help='write the evidence manifest explicitly')
    args = parser.parse_args()
    report = build(args.directory)
    if args.write:
        REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    elif report != load(REPORT.relative_to(ROOT)):
        raise SystemExit('Manifest mismatch. Review any different snapshot before replacing evidence.')
    print('8 public source captures; 5 index rows; 5 official headings. Linked prose and index bounds verified.')


if __name__ == '__main__':
    main()
