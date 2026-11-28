"""Verify the bounded SRD item clauses used in the public #78 comparison."""

import argparse
import json
from pathlib import Path
import runpy

import pypdfium2

ROOT = Path(__file__).resolve().parents[1]
HELPER = runpy.run_path(str(ROOT / 'scripts/audit-skt-linked-adventure-boundaries-2014.py'))
digest = HELPER['digest']
require_text = HELPER['require_text']
section = HELPER['section']
read_page = HELPER['read_page']

SRD = 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf'
ERRATA = 'https://media.wizards.com/2020/dnd/downloads/ERftLW-Errata.pdf'
INPUTS = (
    'catalog/srd51-travel-items.json',
    'catalog/srd51-wands.json',
    'catalog/artificer-errata-scopes-2014.json',
)


def verify_pdf(path, sha256, pages):
    if digest(path.read_bytes()) != sha256:
        raise ValueError(f'{path.name}: unexpected official PDF SHA-256')
    with pypdfium2.PdfDocument(path) as pdf:
        if len(pdf) != pages:
            raise ValueError(f'{path.name}: expected {pages} PDF pages')
    return sha256


def build(folder):
    srd = folder / 'srd51.pdf'
    errata = folder / 'eberron-errata.pdf'
    srd_sha = verify_pdf(srd, '2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0', 403)
    errata_sha = verify_pdf(errata, '94f194059290862f626f883fac83866e665655c7b4987405e17d71a9d4b4026d', 2)
    errata_page = read_page(errata, 1)
    require_text(errata_page, ['Version 2.0', 'Wizards of the Coast'])

    candidates = [
        (srd, 249, 'Wand of Secrets', 'Wand of the War Mage', [
            'The wand has 3 charges', 'use an action to expend 1',
            'a secret door or trap is within 30 feet of you',
            'points at the one nearest to you', 'regains 1d3 expended charges daily at dawn',
        ]),
        (srd, 210, 'Bag of Holding', 'Bag of Tricks', [
            '500 pounds, not exceeding a volume of 64 cubic feet', 'weighs 15 pounds',
            'Retrieving an item from the bag requires an action',
            'overloaded, pierced, or torn, it ruptures and is destroyed',
            'its contents are scattered in the Astral Plane',
            'turned inside out, its contents spill forth, unharmed',
            'put right before it can be used again', '10 divided by the number of creatures (minimum 1 minute)',
            'they begin to suffocate',
            'inside an extradimensional space created by a handy haversack, portable hole, or similar item',
            'instantly destroys both items', 'Any creature within 10 feet', 'a random location on the Astral Plane',
            'The gate then closes', 'way only', 'be reopened',
        ]),
        (errata, 1, 'Infusing an Item (p. 57).', 'The Right Tool for the Job (p. 57).', [
            'If an infusion ends on an item that contains other things',
            'like a bag of holding', 'its contents harmlessly appear in and around its space',
        ]),
    ]
    witnesses = []
    for path, page, start, stop, anchors in candidates:
        selected = section(read_page(path, page), start, stop).strip()
        require_text(selected, anchors)
        if start == 'Wand of Secrets' and 'last charge' in selected:
            raise ValueError('Unexpected last-charge clause in Wand of Secrets')
        witnesses.append({
            'url': f'{SRD if path == srd else ERRATA}#page={page}',
            'pdfSha256': srd_sha if path == srd else errata_sha,
            'startHeading': start, 'nextHeading': stop,
            'normalizedSectionSha256': digest(selected.encode('utf-8')),
        })

    inputs = {name: (ROOT / name).read_text(encoding='utf-8') for name in INPUTS}
    bag = next(row for row in json.loads(inputs[INPUTS[0]])['entries']
               if row['id'] == 'srd51:2014:item:bag-of-holding')
    wand = next(row for row in json.loads(inputs[INPUTS[1]])['entries']
                if row['id'] == 'srd51:2014:item:wand-of-secrets')
    for entry, witness in zip((wand, bag), witnesses[:2], strict=True):
        if entry['source']['url'] != witness['url']:
            raise ValueError(f'{entry["id"]}: item source moved')
    if wand['item']['charges']['max'] != 3:
        raise ValueError('Wand charge capacity drifted from SRD')
    infusion = next(row for row in json.loads(inputs[INPUTS[2]])['records']
                    if row['key'] == 'infused-container-contents')
    if (infusion['sourceFile'], infusion['startHeading'], infusion['historicalBookSourceId']) != (
            errata.name, witnesses[2]['startHeading'], '119'):
        raise ValueError('Eberron erratum scope changed')

    return {
        'schemaVersion': 1,
        'status': 'public-source-evidence',
        'acceptedForRuntime': False,
        'inputSha256': {name: digest(raw.encode('utf-8')) for name, raw in inputs.items()},
        'wandOfSecrets': {
            'id': wand['id'], 'source': witnesses[0],
            'activation': {'holding': True, 'economy': 'action', 'charges': 1, 'radiusFt': 30,
                           'revealsNearest': ['secret-door', 'trap'], 'chargesStillSpentWithoutTarget': True},
            'recovery': {'trigger': 'dawn', 'dice': '1d3', 'expendedOnly': True},
            'lastChargeDestructionClause': False,
        },
        'bagOfHolding': {
            'id': bag['id'], 'source': witnesses[1],
            'capacity': {'pounds': 500, 'cubicFeet': 64, 'itemWeightPounds': 15},
            'retrieveEconomy': 'action',
            'breathing': {'minutesDividedByCreatures': 10, 'minimumMinutes': 1, 'after': 'suffocation'},
            'events': [
                {'trigger': ['overload', 'piercing', 'tearing'],
                 'bag': 'destroyed', 'contents': 'scattered-in-astral-plane'},
                {'trigger': 'turn-inside-out', 'bag': 'right-before-reuse', 'contents': 'spill-out-unharmed'},
                {'trigger': 'place-bag-inside-comparable-extradimensional-space', 'itemsDestroyed': 2,
                 'creatureRadiusFt': 10, 'creatures': 'random-astral-destination', 'gate': 'one-way-then-closes',
                 'looseContentsOutcome': None},
                {'trigger': 'infusion-ends-on-container', 'source': witnesses[2], 'bookSourceId': '119',
                 'contents': 'appear-unharmed-in-and-around-container-space'},
            ],
        },
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.folder), indent=2))
