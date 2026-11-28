"""Check SRD item casting and three Staff of Fire spell boundaries for #78."""

import argparse
import json
from pathlib import Path
import runpy

ROOT = Path(__file__).resolve().parents[1]
TOOLS = runpy.run_path(str(ROOT / 'scripts/audit-wand-bag-rule-evidence-2014.py'))
BASELINE = 'catalog/resource-rule-source-evidence-2014.json'
SPELLS = (
    ('level-one-combat', 'burning-hands', 'Burning Hands', 'Call Lightning', 123, 1, 1, False, (3, 6)),
    ('level-three', 'fireball', 'Fireball', 'Fire Bolt', 144, 3, 3, False, (8, 6)),
    ('level-four', 'wall-of-fire', 'Wall of Fire', 'Wall of Force', 190, 4, 4, True, (5, 8)),
)


def build(pdf):
    inputs = {}

    def load(path):
        raw = (ROOT / path).read_text(encoding='utf-8')
        inputs[path] = TOOLS['digest'](raw.encode('utf-8'))
        return json.loads(raw)

    base = load(BASELINE)
    source = base['source']
    sha256 = TOOLS['verify_pdf'](pdf, source['pdfSha256'], source['pageCount'])
    costs = next(row['facts']['spellChargeCosts'] for row in base['units']
                 if row['key'] == 'staff-of-fire-selected')

    def witness(page, start, stop, markers):
        text = TOOLS['read_page'](pdf, page)
        line = TOOLS['section'](text, start, stop).strip()
        TOOLS['require_text'](line, markers)
        return {'url': f'{source["url"]}#page={page}', 'heading': start, 'nextHeading': stop,
                'normalizedSectionSha256': TOOLS['digest'](line.encode('utf-8'))}

    general = witness(207, 'Spells Some magic items allow', 'Charges Some magic items', [
        'lowest possible spell level', "doesn’t expend any of the user’s spell slots", 'requires no components',
        'unless the item’s description says otherwise', 'normal casting time, range, and duration',
        'must concentrate if the spell requires concentration',
        'more than one spellcasting ability, you choose which one to use with the item',
    ])
    staff = witness(243, 'Staff of Fire', 'Staff of Frost', [
        'While holding it, you can use an action', 'using your spell save DC',
        'burning hands (1 charge), fireball (3 charges), or wall of fire (4 charges)',
        'regains 1d6 + 4 expended charges daily at dawn', 'expend the last charge, roll a d20',
        'On a 1', 'is destroyed',
    ])
    options = []
    for file, slug, title, next_title, page, level, cost, concentration, (count, sides) in SPELLS:
        catalog_id = f'srd51:2014:spell:{slug}'
        entries = load(f'catalog/srd51-{file}.json')['entries']
        entry = next(row for row in entries if row['id'] == catalog_id)
        markers = [
            'Casting Time: 1 action', 'Dexterity saving throw',
            f'{count}d{sides} fire damage', 'half as much damage on a successful',
            'When you cast this spell using a spell slot',
            'Duration: Concentration, up to 1 minute' if concentration else 'Duration: Instantaneous',
            {1: 'foot cone)', 3: 'Range: 150 feet', 4: 'Range: 120 feet'}[level],
        ]
        if concentration:
            markers += ['ends its turn within 10 feet', 'enters the wall for the first time on a turn',
                        'The other side of the wall deals no damage']
        spell = witness(page, title, next_title, markers)
        if (entry['spell']['level'], entry['spell']['concentration'], entry['source']['url'], costs[slug]) != (
                level, concentration, spell['url'], cost):
            raise ValueError(f'{catalog_id} drifted from the verified spell or subject cost')
        options.append({
            'spellId': catalog_id, 'castLevel': level, 'chargeCost': cost, 'concentration': concentration,
            'initialSavingThrow': {'ability': 'dex', 'halfOnSuccess': True},
            'initialDamage': {'type': 'fire', 'count': count, 'sides': sides}, 'source': spell,
        })

    return {'schemaVersion': 1, 'status': 'public-source-evidence', 'acceptedForRuntime': False,
            'inputSha256': inputs, 'srdPdfSha256': sha256, 'itemSpellGeneral': general, 'staff': staff,
            'ordinaryCast': {'timing': 'action', 'ownSlotsExpended': 0, 'componentsRequired': False,
                             'chooseOwnSpellcastingAbilityWhenMultiple': True, 'usesOwnSpellSaveDC': True,
                             'upcastFromExtraCharges': False, 'options': options}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    print(json.dumps(build(parser.parse_args().pdf), indent=2))
