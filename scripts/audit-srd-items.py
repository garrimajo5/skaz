"""Read-only audit of item headers and healing formulas against the pinned SRD 5.1.

Does not verify translated effect text. Unsupported headers fail explicitly.
Requires pypdf and Node.js; does not download or modify source/catalog files.
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
RARITY = r'very rare|uncommon|common|rare|legendary|rarity varies'
TYPES = {'Wondrous item': 'wondrous', 'Armor': 'armor', 'Weapon': 'weapon',
         'Ring': 'ring', 'Rod': 'rod', 'Staff': 'staff', 'Wand': 'wand',
         'Potion': 'potion', 'Scroll': 'scroll'}


def header(text, name):
    text, name = normalize(text), normalize(name)
    # Four cards share one named heading and a table, not four separate headings.
    healing = re.fullmatch(r'Potion of (Healing|Greater Healing|Superior Healing|Supreme Healing)', name)
    if healing:
        section = re.search(r'Potion of Healing Potion, rarity varies.*?Potions of Healing Potion of … Rarity HP Regained (.*?) Potion of Heroism', text)
        if not section:
            raise ValueError('Missing bounded healing table')
        row = re.search(r'(?:^|(?<=\d) )' + re.escape(healing[1]) + r' (' + RARITY + r') (\d+)d(\d+) \+ (\d+)(?!\d)', section[1], re.I)
        if not row:
            raise ValueError('Missing healing row: ' + name)
        return {'type': 'potion', 'rarity': row[1].lower().replace(' ', '-'), 'attunement': False,
                'healing': dict(zip(['diceCount', 'diceSides', 'bonus'], map(int, row.group(2, 3, 4))))}
    pattern = re.escape(name) + r' (' + '|'.join(TYPES) + r')(?: \([^)]*\))?, (' + RARITY + r')(?![\w-])(?: \(requires attunement([^)]*)\))?'
    match = re.search(pattern, text)
    if not match:
        raise ValueError('Missing or unsupported item heading: ' + name)
    tail = text[match.end():]
    # Avoid accepting half of a compound rarity or an unrecognized requirement.
    if tail.startswith((' or ', ' (')):
        raise ValueError('Unsupported extended item header: ' + name)
    result = {'type': TYPES[match[1]], 'rarity': match[2].replace('rarity varies', 'varies').replace(' ', '-'),
              'attunement': match[3] is not None}
    if match[3]:
        result['requirementEn'] = match[3].strip()
    if result['type'] == 'wand':
        charges = re.match(r' (?:This|The) wand has (\d+) charges\b', tail)
        if not charges:
            raise ValueError('Unsupported wand charge definition: ' + name)
        result['chargeMaximum'] = int(charges[1])
    return result


def differences(card, expected):
    item = card['item']
    errors = [key for key, value in expected.items() if key not in ['requirementEn', 'chargeMaximum'] and item.get(key) != value]
    requirements = {'by a spellcaster': 'Заклинатель'}
    requirement = expected.get('requirementEn')
    if requirement and requirement not in requirements:
        errors.append('unsupported attunement requirement: ' + requirement)
    elif item.get('attunementRequirement') != (requirements[requirement] if requirement else None):
        errors.append('attunementRequirement')
    if 'healing' in item and 'healing' not in expected:
        errors.append('unexpected healing')
    if 'chargeMaximum' in expected:
        if item.get('charges', {}).get('max') != expected['chargeMaximum']:
            errors.append('chargeMaximum')
    elif 'charges' in item:
        errors.append('unsupported charges')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != SHA256:
        raise SystemExit('Source hash differs; only the pinned SRD 5.1 is supported.')
    from pypdf import PdfReader
    reader = PdfReader(args.pdf)
    code = "import{bundledCatalog}from'./server/bundled-catalog.mjs';process.stdout.write(JSON.stringify(bundledCatalog().bundle.entries.filter(e=>e.kind==='item')))"
    cards = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code], cwd=ROOT, encoding='utf-8'))
    pages, failures = {}, []
    for card in cards:
        page = int(card['source']['url'].rsplit('#page=', 1)[1])
        if page not in pages:
            pages[page] = reader.pages[page-1].extract_text()
        try:
            expected = header(pages[page], card['name']['en'])
            errors = differences(card, expected)
            if errors:
                failures.append({'id': card['id'], 'fields': errors, 'source': expected})
        except ValueError as error:
            failures.append({'id': card['id'], 'error': str(error)})
    print(json.dumps({'checked': len(cards), 'failures': failures,
                      'scope': 'Type, rarity, attunement, healing formulas and wand charge maximum only; effects and recharge need manual review.'}, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
