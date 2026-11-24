"""Compare public 2014 Storm Giant source surfaces without copying their prose."""

import argparse
import hashlib
import html
import json
import re
import unicodedata
from pathlib import Path

import pypdfium2

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'catalog/skt-giant-source-boundaries-2014.json'
SOURCES = {
    'appendix-d.pdf': 'https://media.wizards.com/2016/dnd/downloads/SKT_AppD.pdf',
    'appendix-c.pdf': 'https://media.wizards.com/2016/dnd/downloads/SKT_GiantOptions.pdf',
    'srd51.pdf': 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf',
    'skt-errata.html': 'https://www.dndbeyond.com/sources/dnd/sae/storm-kings-thunder',
    'legacy-rules.html': 'https://www.dndbeyond.com/sources/dnd/basic-rules-2014/monster-stat-blocks-s',
    'legacy-card.html': 'https://www.dndbeyond.com/monsters/17026-storm-giant',
    'mm-errata.html': 'https://www.dndbeyond.com/sources/dnd/sae/monster-manual-2014',
}
INPUTS = {
    'options': 'catalog/skt-appendix-c-giant-options-2014.json',
    'composition': 'catalog/skt-appendix-d-npc-composition-2014.json',
    'base': 'catalog/srd51-giants.json',
}
SRD_SHA = '2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalize(value):
    value = unicodedata.normalize('NFKC', value).replace('\xad', '').replace('\ufffe', '')
    return ' '.join(value.split())


def between(value, start, stop):
    left = value.index(start)
    right = value.index(stop, left + len(start))
    return value[left:right]


def html_text(value):
    return normalize(html.unescape(re.sub(r'<[^>]*>', ' ', value)))


def page(path, number):
    with pypdfium2.PdfDocument(path) as pdf:
        return normalize(pdf[number - 1].get_textpage().get_text_range())


def read_combat(text, *, amendment=False):
    result = {
        'armorClass': None,
        'hitPoints': None,
        'challengeRating': None,
        'skillsInBlock': None,
        'listedAlignment': None,
        'lightningRecharge': None,
    }
    if not amendment:
        result['armorClass'] = int(re.search(r'\bArmor Class\s+(\d+)', text).group(1))
        result['hitPoints'] = int(re.search(r'\bHit Points\s+(\d+)', text).group(1))
        challenge = re.search(r'\bChallenge\s+(\d+)\s+\(', text)
        result['challengeRating'] = int(challenge.group(1)) if challenge else None
        result['skillsInBlock'] = bool(re.search(r'\bSkills\s+[A-Za-z]', text))
        alignment = re.search(r'\bHuge giant(?:,\s*([a-z ]+?))?\s+Armor Class', text, re.I).group(1)
        result['listedAlignment'] = alignment.casefold().replace(' ', '-') if alignment else None
        recharge = re.search(r'Lightning Strike\s*\(([^()]*)\)', text).group(1).casefold()
        if recharge == 'recharges after a short or long rest':
            result['lightningRecharge'] = {'kind': 'short-or-long-rest'}
        elif re.fullmatch(r'recharge 5[–-]6', recharge):
            result['lightningRecharge'] = {'kind': 'd6', 'successFaces': [5, 6]}
        else:
            raise ValueError('Unknown Lightning Strike recharge')
    if 'Innate Spellcasting.' in text:
        placement = 'innate-trait'
    elif re.search(r'\bSpellcasting\s*\.\s+The giant casts', text):
        placement = 'action'
    else:
        raise ValueError('Unknown spellcasting placement')
    at_will, maximum, weather_action = re.search(
        r'At will:\s*([a-z, ]+?)\s+(\d+)/day each:\s*control weather'
        r'\s*(\(cast as 1 action\))?\s*,\s*water breathing',
        text,
        re.I,
    ).groups()
    if not re.search(r'Charisma(?: as the spellcasting ability)?\s+\(spell save DC 17\)', text, re.I):
        raise ValueError('Unexpected spellcasting ability or DC')
    result['spellcasting'] = {
        'placement': placement,
        'ability': 'cha',
        'saveDC': 17,
        'atWill': [name.strip().lower().replace(' ', '-') for name in at_will.split(',')],
        'dailyEach': int(maximum),
        'dailySpells': ['control-weather', 'water-breathing'],
        'controlWeatherExplicitlyOneAction': True if weather_action else None,
    }
    return result


def build(evidence):
    content = {key: (evidence / key).read_bytes() for key in SOURCES}
    repo = {key: (ROOT / path).read_bytes() for key, path in INPUTS.items()}
    options, composition, base = (json.loads(repo[key]) for key in INPUTS)
    pdfs = {
        'appendix-d.pdf': composition['publisherAppendix']['sha256'],
        'appendix-c.pdf': options['publisherAppendix']['sha256'],
        'srd51.pdf': SRD_SHA,
    }
    if any(digest(content[key]) != expected for key, expected in pdfs.items()):
        raise ValueError('Publisher PDF hash differs from pinned artifact')

    def markup(name):
        return content[name].decode('utf-8')

    printed = page(evidence / 'appendix-d.pdf', 10).split('Storm Giant Huge giant', 1)[1]
    start_of_attachment = re.search(r'\b(?:Vaasha|Shaldoor|Nimir|Orlekto)\b', printed)
    printed = 'Storm Giant Huge giant' + printed[:start_of_attachment.start()]
    srd_base = between(page(evidence / 'srd51.pdf', 312), 'Cloud Giant', 'Fire Giant')
    srd_storm = (
        page(evidence / 'srd51.pdf', 313).split('Storm Giant Huge giant', 1)[1]
        + ' '
        + page(evidence / 'srd51.pdf', 314).split('Gibbering Mouther', 1)[0]
    )
    srd_storm = 'Storm Giant Huge giant' + srd_storm
    errata = between(markup('skt-errata.html'), 'Storm Giant (p. 256)</h3>', '</aside>')
    chapter = between(
        markup('legacy-rules.html'),
        'href="/monsters/17026-storm-giant"',
        'href="/monsters/17027-succubus"',
    )
    legacy = between(
        markup('legacy-card.html'),
        'mon-stat-block__name-link',
        'Basic Rules (2014), pg. 313',
    )
    if 'href="/monsters/17026-storm-giant"' not in legacy:
        raise ValueError('Legacy card link differs from chapter link')

    cloud = html_text(between(markup('mm-errata.html'), 'Cloud Giant (p. 154)</h3>', '<h3'))
    revised, original = map(int, re.search(r'Con \+(\d+)\s+\[was \+(\d+)\]', cloud).groups())
    if f'Con +{revised}' not in srd_base:
        raise ValueError('SRD sample does not match errata at the selected field')
    fragments = page(evidence / 'appendix-c.pdf', 1).split('Frost Giants', 1)[0]
    if any(name + '.' not in fragments for name in options['unassignedPageHeadings']):
        raise ValueError('Missing expected leading action heading on page 246')

    bases_by_name = {entry['name']['en']: entry for entry in base['entries']}
    variants = []
    for row in options['digitalVariants']:
        name = row['digitalName'].split(' (', 1)[0]
        baseline = bases_by_name[name]
        variants.append({
            'variantUrl': row['cardUrl'],
            'srdReferenceId': baseline['id'],
            'srdChallengeRating': baseline['monster']['challenge'],
            'digitalIndexChallengeRating': row['indexChallengeRating'],
            'printedHeading': row['printedHeading'],
            'knownOptionCount': len(row['actionHeadings']) if row['printedHeading'] else None,
            'variantFullBodyVerified': False,
            'automaticMerge': False,
            'canonicalId': None,
        })

    def surface(file, locator, record):
        return {'sourceFile': file, 'locator': locator, **record}

    sources = {
        key: {'url': SOURCES[key], 'bytes': len(raw), 'sha256': digest(raw)}
        for key, raw in content.items()
    }
    return {
        'schemaVersion': 1,
        'checkedOn': '2026-11-24',
        'ruleset': '5e-2014',
        'status': 'publisher-version-boundaries-observed',
        'accepted': False,
        'complete': False,
        'approvedDenominator': None,
        'automaticMerge': False,
        'reusePermissionForSktText': 'not-established',
        'monsterManualFullComparison': 'not-established',
        'inputSha256': {path: digest(repo[key]) for key, path in INPUTS.items()},
        'sources': sources,
        'stormGiantSurfaces': {
            'srdReference': surface('srd51.pdf', 'pp. 313–314', read_combat(srd_storm)),
            'printedNpcBlock': surface('appendix-d.pdf', 'PDF p. 10 / print p. 256', read_combat(printed)),
            'npcErrataAmendment': surface('skt-errata.html', 'Appendix D / Storm Giant (p. 256)', read_combat(html_text(errata), amendment=True)),
            'legacyCompendiumChapter': surface('legacy-rules.html', 'Storm Giant / link 17026', read_combat(html_text(chapter))),
            'legacyLinkedCard': surface('legacy-card.html', 'card 17026', read_combat(html_text(legacy))),
        },
        'printedNamedAttachments': {
            'sharedBlockRef': composition['sharedStatBlock']['localRef'],
            'cards': [row['name'] for row in composition['namedCards']],
        },
        'cloudGiantBaseCorrection': {
            'sourceFile': 'mm-errata.html',
            'locator': 'Cloud Giant (p. 154)',
            'field': 'constitution-saving-throw',
            'previous': original,
            'corrected': revised,
            'matchesSrdReferenceField': True,
            'sktVariantValue': None,
        },
        'appendixCVariants': variants,
        'unassignedPrintedOptions': options['unassignedPageHeadings'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('evidence', type=Path)
    parser.add_argument('--verify', action='store_true', help='Compare with the checked-in snapshot')
    args = parser.parse_args()
    snapshot = build(args.evidence)
    if args.verify:
        if snapshot != json.loads(REPORT.read_text(encoding='utf-8')):
            parser.exit(1, 'Evidence snapshot differs from the checked-in source boundary\n')
        print('Verified five Storm Giant surfaces, six variant links and seven source hashes.')
    else:
        print(json.dumps(snapshot, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
