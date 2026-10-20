"""Read-only comparison of bundled monster statistics with the pinned SRD PDF.

Checks base statistics, not attacks, traits, senses or authored summaries.
Requires pypdf and the application's Node.js runtime.
"""
import argparse
import hashlib
import json
import re
import runpy
import subprocess
from pathlib import Path

shared = runpy.run_path(str(Path(__file__).with_name('audit-srd-spell-cards.py')))
normalize, ROOT, SHA256 = shared['normalize'], shared['ROOT'], shared['SHA256']
SIZES = 'Tiny|Small|Medium|Large|Huge|Gargantuan'
TYPES = 'aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead'


def statistics(text, name):
    text = normalize(text)
    heading = re.search(re.escape(normalize(name)) + r'\s+(' + SIZES + r')\s+(' + TYPES + r')\b', text)
    if not heading:
        raise ValueError('Missing creature heading: ' + name)
    body = text[heading.end():]
    # Never borrow a missing field from the next statblock.
    next_block = re.search(r'\b(?:' + SIZES + r')\s+(?:' + TYPES + r')\b', body)
    if next_block:
        body = body[:next_block.start()]
    def field(pattern, label):
        found = re.search(pattern, body)
        if not found:
            raise ValueError('Missing ' + label + ' for ' + name)
        return found
    ac = int(field(r'Armor Class (\d+)', 'AC')[1])
    hp = int(field(r'Hit Points (\d+)', 'HP')[1])
    speed_text = field(r'Speed (.*?) STR DEX CON INT WIS CHA', 'speed')[1]
    # Hover is retained in the authored trait text; the numeric schema stores speed only.
    speed_text = re.sub(r'\bfly (\d+) ft\. \(hover\)', r'fly \1 ft.', speed_text)
    speeds = {}
    for mode, number in re.findall(r'(?:(walk|climb|swim|fly|burrow) )?(\d+) ft\.', speed_text):
        speeds[mode or 'walk'] = int(number)
    if not speeds or re.sub(r'(?:(?:walk|climb|swim|fly|burrow) )?\d+ ft\.[, ]*', '', speed_text).strip():
        raise ValueError('Unsupported speed notation for ' + name)
    ability_text = field(r'STR DEX CON INT WIS CHA ((?:\d+ \([+−-]\d+\)\s*){6})', 'abilities')[1]
    scores = list(map(int, re.findall(r'(\d+) \(', ability_text)))
    cr = field(r'Challenge (\d+(?:/\d+)?) \(([\d,]+) XP\)', 'challenge/XP')
    return {'size': heading[1].lower(), 'type': heading[2], 'armorClass': ac,
            'hitPoints': hp, 'speed': speeds,
            'abilities': dict(zip(['str','dex','con','int','wis','cha'], scores)),
            'challenge': cr[1], 'xp': int(cr[2].replace(',', ''))}


def npc_headings(pages):
    """Inventory the pinned appendix, independently of prepared catalog cards."""
    entries = []
    for page, text in sorted(pages.items()):
        for match in re.finditer(r'([A-Z][a-z]+(?: [A-Z][a-z]+)?) Medium humanoid', normalize(text)):
            name = match[1]
            entries.append({'id': 'srd51:2014:monster:' + name.lower().replace(' ', '-'),
                            'nameEn': name, 'page': page})
    return entries


def familiar_headings(text):
    match = re.search(r'animal form you choose: (.*?)\. Appearing', normalize(text))
    if not match:
        raise ValueError('Missing Find Familiar form list')
    names = match[1].replace(', or ', ', ').split(', ')
    aliases = {'frog (toad)': 'Frog', 'fish (quipper)': 'Quipper'}
    names = [aliases.get(name, name.title()) for name in names]
    if len(names) != 15 or len(set(names)) != 15:
        raise ValueError('Unexpected or duplicate familiar forms')
    return names


def ooze_headings(pages):
    """Inventory this source section independently of the authored card list."""
    rows = []
    for page, text in sorted(pages.items()):
        for match in re.finditer(r'([A-Z][a-z]+(?: [A-Z][a-z]+)?) (?:' + SIZES + r') ooze\b', normalize(text)):
            name = match[1]
            rows.append({'id': 'srd51:2014:monster:' + name.lower().replace(' ', '-'),
                         'nameEn': name, 'page': page})
    return rows


def check_ooze_coverage(pages, manifest, cards):
    rows = ooze_headings(pages)
    declared = [{'id': row['id'], 'nameEn': row['nameEn'], 'page': row['pages'][0]}
                for row in manifest['entries']]
    if (manifest['sourceSha256'] != SHA256 or not rows or
            manifest['expectedSubsetCount'] != len(rows) or declared != rows):
        raise ValueError('Ooze coverage differs from pinned section headings/pages.')
    for row in rows:
        found = [card for card in cards if card['id'] == row['id']]
        if (len(found) != 1 or found[0]['name']['en'] != row['nameEn'] or
                found[0]['monster']['type'] != 'ooze' or
                not found[0]['source']['url'].endswith('#page=' + str(row['page']))):
            raise ValueError('Missing, duplicate or mismatched ooze card: ' + row['nameEn'])
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Source hash differs; only the pinned SRD 5.1 is supported.')
    from pypdf import PdfReader
    reader = PdfReader(args.pdf)
    appendix = npc_headings({p: reader.pages[p-1].extract_text() for p in range(395, 404)})
    inventory = json.loads((ROOT / 'catalog/srd51-npc-inventory.json').read_text(encoding='utf-8-sig'))
    if inventory['sourceSha256'] != SHA256 or inventory['expectedCount'] != len(appendix) or inventory['entries'] != appendix:
        raise SystemExit('NPC inventory differs from the pinned Appendix B headings/pages.')
    code = "import{bundledCatalog}from'./server/bundled-catalog.mjs';process.stdout.write(JSON.stringify(bundledCatalog().bundle.entries.filter(e=>e.kind==='monster')))"
    cards = json.loads(subprocess.check_output(['node','--input-type=module','-e',code], cwd=ROOT, encoding='utf-8'))
    ooze_manifest = json.loads((ROOT / 'catalog/srd51-oozes.coverage.json').read_text(encoding='utf-8-sig'))
    ooze_count = check_ooze_coverage({p: reader.pages[p-1].extract_text() for p in range(337, 340)}, ooze_manifest, cards)
    familiar = json.loads((ROOT / 'catalog/srd51-familiar-forms.coverage.json').read_text(encoding='utf-8-sig'))
    familiar_names = familiar_headings(reader.pages[142].extract_text())
    if familiar['sourceSha256'] != SHA256 or familiar['expectedSubsetCount'] != 15 or sorted(row['nameEn'] for row in familiar['entries']) != sorted(familiar_names):
        raise SystemExit('Familiar inventory differs from the pinned spell on page 143.')
    for row in familiar['entries']:
        matches = [card for card in cards if card['id'] == row['id']]
        if len(matches) != 1 or matches[0]['name']['en'] != row['nameEn'] or not matches[0]['source']['url'].endswith('#page=' + str(row['pages'][0])):
            raise SystemExit('Missing or mismatched familiar card: ' + row['nameEn'])
    pages, failures = {}, []
    for card in cards:
        page = int(card['source']['url'].rsplit('#page=', 1)[1])
        for n in range(page, min(page + 1, len(reader.pages)) + 1):
            if n not in pages:
                pages[n] = reader.pages[n-1].extract_text()
        try:
            expected = statistics(pages[page] + pages.get(page+1, ''), card['name']['en'])
            errors = [key for key in expected if expected[key] != card['monster'][key]]
            if errors:
                failures.append({'id': card['id'], 'fields': errors, 'source': expected})
        except ValueError as error:
            failures.append({'id': card['id'], 'error': str(error)})
    print(json.dumps({'checked': len(cards), 'npcHeadingsChecked': len(appendix), 'familiarFormsChecked': len(familiar_names), 'oozeHeadingsChecked': ooze_count, 'failures': failures,
                      'scope': 'Base statistics only; actions, traits and summaries need source review.'}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
