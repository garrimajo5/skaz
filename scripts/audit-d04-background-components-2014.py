"""Verify public publisher metadata about selected D04 background components."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import runpy


ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'catalog/background-adventure-component-witnesses-2014.json'
PUBLISHER = 'https://www.dndbeyond.com'
DRAGONLANCE = 'Dragonlance: Shadow of the Dragon Queen'
TREE = runpy.run_path(str(ROOT / 'scripts/audit-fiendish-folio-index.py'))
Tree, clean, only = (TREE[name] for name in ('Tree', 'clean', 'only'))
SOURCES = {
    'wildemount-support': ('raw', '/forums/d-d-beyond-general/release-issues-support/59558-support-thread-explorers-guide-to-wildemount'),
    'wildemount-toc': ('additional', '/sources/dnd/egtw'),
    'dragonlance-support': ('raw', '/forums/d-d-beyond-general/release-issues-support/157621-dragonlance-shadow-of-the-dragon-queen-issues-and'),
    'dragonlance-feats': ('raw', '/feats'),
    'dragonlance-preview': ('raw', '/posts/1364-dragonlance-backgrounds-and-feats-answer-the-call'),
    'dragonlance-change': ('additional', '/changelog'),
    'hoard-errata': ('raw', '/sources/dnd/sae/hoard-of-the-dragon-queen'),
    'abyss-errata': ('additional', '/sources/dnd/sae/out-of-the-abyss'),
}


def read_source(directory, key):
    subfolder, path = SOURCES[key]
    file = directory / subfolder / (key + '.html')
    raw = file.read_bytes()
    url = PUBLISHER + path
    digest = hashlib.sha256(raw).hexdigest()
    receipt = json.loads(file.with_suffix('.html.capture.json').read_text(encoding='utf-8'))
    expected = {
        'requestedUrl': url, 'finalUrl': url, 'status': 200, 'outcome': 'complete',
        'sha256': digest, 'bytes': len(raw), 'bodyFile': file.name, 'retried': False,
    }
    if any(receipt.get(name) != value for name, value in expected.items()):
        raise ValueError('Invalid source capture: ' + key)
    tree = Tree()
    tree.feed(raw.decode('utf-8'))
    return tree.root, {name: expected[name] for name in ('requestedUrl', 'bytes', 'sha256')}


def first_staff_post(tree, role, author):
    post = only(tree.find(lambda node: node.attrs.get('id') == 'c1'), 'first support post')
    if not post.has(role) or not any(
        clean(node) == author for node in post.find(lambda item: item.tag == 'a')
    ):
        raise ValueError('Unexpected support post author')
    return only(post.find(lambda node: node.attrs.get('id') == 'forum-post-body-1'), 'first post body')


def section(tree, start, stop):
    nodes = list(tree.find(lambda node: node.tag in ('h2', 'h3', 'h4', 'h5', 'p', 'li')))
    start_node = only((node for node in nodes if clean(node) == start), start)
    stop_node = only((node for node in nodes if clean(node) == stop), stop)
    first, last = nodes.index(start_node), nodes.index(stop_node)
    if first >= last:
        raise ValueError('Unexpected section order: ' + start)
    return ' '.join(clean(node) for node in nodes[first + 1:last])


def require(value, *anchors):
    for anchor in anchors:
        if anchor not in value:
            raise ValueError('Publisher locator missing: ' + anchor)


def wildemount(trees):
    body = first_staff_post(trees['wildemount-support'], 'user-role-d-d-beyond-founders', 'Stormknight')
    summary = section(body, 'CHARACTER OPTIONS: BACKGROUNDS', 'CHARACTER OPTIONS: HEROIC CHRONICLE')
    require(summary, 'Grinner', 'Volstrucker Agent')
    match = re.search(r'variants of existing backgrounds for: ([^.]+)\.', summary)
    if not match:
        raise ValueError('Wildemount base backgrounds missing')
    bases = match[1].replace(', and ', ', ').split(', ')
    if bases != ['Acolyte', 'Criminal', 'Sailor', 'Sage', 'Spy']:
        raise ValueError('Wildemount base backgrounds changed')
    locators = {}
    for label, anchor in {
        'Adapting Backgrounds': 'AdaptingBackgrounds',
        'Heroic Chronicle': 'HeroicChronicle',
        'Grinner': 'Grinner',
        'Volstrucker Agent': 'VolstruckerAgent',
    }.items():
        path = '/sources/egtw/character-options-subclasses#' + anchor
        only(trees['wildemount-toc'].find(
            lambda node: node.tag == 'a' and node.attrs.get('href') == path and clean(node) == label
        ), label)
        locators[label] = PUBLISHER + path
    return {
        'observationId': 'dndsu:backgrounds:848',
        'variantBaseBackgrounds': bases,
        'standaloneBackgrounds': ['Grinner', 'Volstrucker Agent'],
        'locators': locators,
        'printedVariantComponentsVerified': False,
    }


def dragonlance(trees):
    support = first_staff_post(trees['dragonlance-support'], 'user-role-d-d-beyond-staff', 'GPyromania')
    character_builder = section(support, 'January 25th, 2023 Update:', 'CHARACTER OPTIONS: FEATS')
    require(character_builder, 'Backgrounds now grant feats', 'the feat has been taken')
    initiate = section(support, 'Initiate of High Sorcery', 'Adept of the Black/Red/White Robes')
    moons = re.findall(r'Initiate of High Sorcery \((Nuitari|Lunitari|Solinari)\)', initiate)
    if moons != ['Nuitari', 'Lunitari', 'Solinari']:
        raise ValueError('Unexpected historical Initiate choices')
    adept = section(support, 'Adept of the Black/Red/White Robes', 'Previous Books')
    require(initiate, 'Intelligence, Wisdom, or Charisma')
    require(adept, 'chosen ability score', 'relevant Initiate of High Sorcery feat')

    article = only(trees['dragonlance-preview'].find(lambda node: node.has('article-main')), 'preview article')
    knight = section(article, 'Choosing the Knight of Solamnia Background', 'Dedicate to Power With the Mages of High Sorcery')
    mage = section(article, 'Joining the Mages of High Sorcery', 'Prepare Your Character for War!')
    require(knight, 'Squire of Solamnia', 'Dragonlance Campaign', 'Fighter or Paladin', 'Knight of Solamnia Background')
    require(mage, 'Initiate of High Sorcery', 'Dragonlance Campaign', 'Sorcerer or Wizard', 'Mage of High Sorcery Background')

    index = {}
    for row in trees['dragonlance-feats'].find(lambda node: node.has('list-row') and node.has('list-row-feat')):
        source = clean(only(row.find(lambda node: node.has('list-row-name-secondary')), 'feat source'))
        if source != DRAGONLANCE:
            continue
        link = only(row.find(lambda node: node.tag == 'a' and node.attrs.get('href', '').startswith('/feats/')), 'feat card')
        name, path = clean(link), link.attrs['href']
        if name in index or not re.fullmatch(r'/feats/\d+-[a-z0-9-]+', path):
            raise ValueError('Unexpected feat index row: ' + name)
        index[name] = PUBLISHER + path
    expected = [
        'Adept of the Black Robes', 'Adept of the Red Robes', 'Adept of the White Robes',
        'Divinely Favored', 'Initiate of High Sorcery', 'Knight of the Crown', 'Knight of the Rose',
        'Knight of the Sword', 'Squire of Solamnia',
    ]
    if list(index) != expected:
        raise ValueError('Dragonlance public feat rows changed')

    entries = list(trees['dragonlance-change'].find(lambda node: node.tag in ('h3', 'li')))
    date_node = only((node for node in entries if node.attrs.get('id') == '2026September28'), 'September changelog')
    changes = []
    for node in entries[entries.index(date_node) + 1:]:
        if node.tag == 'h3':
            break
        prefix = 'Bug fix: [' + DRAGONLANCE + '] Feat - '
        line = clean(node)
        if line.startswith(prefix):
            changes.append(line[len(prefix):].split(' - ', 1)[0])
    if changes != [*expected[:3], 'Initiate of High Sorcery']:
        raise ValueError('Dragonlance changelog items changed')

    return {
        'observationId': 'dndsu:backgrounds:856',
        'indexedFeats': index,
        'historicalBuilderInitiateChoices': moons,
        'adeptCarriesChosenInitiateAbilityInBuilder': True,
        'backgroundGrantsSupportedSince': '2023-01-25',
        'digitalFixes': {'date': '2026-09-28', 'feats': changes},
        'previewPrerequisiteContext': {
            'Squire of Solamnia': {'classes': ['Fighter', 'Paladin'], 'background': 'Knight of Solamnia'},
            'Initiate of High Sorcery': {'classes': ['Sorcerer', 'Wizard'], 'background': 'Mage of High Sorcery'},
        },
        'publishedBonusFeatTablesVerified': False,
    }


def errata_sections(tree):
    scope = only(tree.find(lambda node: node.has('compendium-sae')), 'errata article')
    names = [clean(node) for node in scope.find(lambda item: item.tag == 'h2' and item.has('heading-anchor'))]
    if not names or 'Appendix A' in names:
        raise ValueError('Review the changed errata scope')
    return names


def build(directory):
    trees, receipts = {}, {}
    for key in SOURCES:
        trees[key], receipts[key] = read_source(directory, key)
    return {
        'sources': receipts,
        'wildemount': wildemount(trees),
        'dragonlance': dragonlance(trees),
        'digitalErrataScopes': {
            'dndsu:backgrounds:846': errata_sections(trees['abyss-errata']),
            'dndsu:backgrounds:847': errata_sections(trees['hoard-errata']),
        },
        'fullPrimaryRuleSectionsVerified': False,
        'componentUnitsAccepted': 0,
        'approvedDenominator': None,
        'textReusePermission': 'not-established',
        'runtimeChanged': False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    report = build(args.directory)
    if args.write:
        REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif report != json.loads(REPORT.read_text(encoding='utf-8')):
        raise ValueError('Source component metadata differs from the checked-in report')
    print('Verified 8 captures, 5 adaptation bases, 9 feat rows, 4 digital updates and 2 errata scopes.')


if __name__ == '__main__':
    main()
