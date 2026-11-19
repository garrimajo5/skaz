"""Audit factual Spellcasting action parameters in the pinned SKT errata PDF.

No network requests, inferred spell slots, canonical merges, or full-stat-block claims.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTORS = {
    'Zephyros': (1, 33), 'Klauth': (1, 95),
    'Claugiyliamatar': (2, 96), 'Turlang': (2, 107),
    'Storvald': (2, 165), 'Sansuri': (2, 192), 'Slarkrethel': (2, 224),
    'Iymrith': (3, 241), 'Maegera': (3, 241), 'The shaman': (3, 243),
    'Naxene': (4, 252), 'Othovir': (4, 255), 'The giant': (4, 256),
}

def normalize(text):
    # Remove hyphens directly at PDF line breaks; the pinned-source audit checks resulting names.
    text = re.sub(r'([A-Za-z])\s*-\s*\n\s*([a-z])', r'\1\2', text)
    return re.sub(r'\s+', ' ', text).strip()

def spell(value):
    value = value.strip()
    override = None
    if value.endswith('(cast as 1 action)'):
        value = value[:-len('(cast as 1 action)')].strip()
        override = {'castingTime': '1 action'}
    elif value.endswith('(1d10 fire damage)'):
        value = value[:-len('(1d10 fire damage)')].strip()
        override = {'damage': {'dice': '1d10', 'type': 'fire'}}
    if not re.fullmatch(r'[A-Za-z]+(?:[ ’\'-][A-Za-z]+)*', value):
        raise ValueError('Unparsed spell token: ' + value)
    return {'name': value, 'override': override}

def parse_actions(pages):
    if len(pages) != 4:
        raise ValueError('Expected four errata pages')
    rows = []
    seen = set()
    pattern = r'\bSpellcasting(?P<bundle> \(Requires a Sacred Bundle\))?\.\s+(?P<actor>[A-Z][A-Za-z ]+?) casts '
    for page_number, raw in enumerate(pages, 1):
        text = normalize(raw)
        for match in re.finditer(pattern, text):
            actor = match['actor']
            if actor not in ACTORS or actor in seen or ACTORS[actor][0] != page_number:
                raise ValueError('Unexpected or repeated actor: ' + actor)
            seen.add(actor)
            tail = text[match.end():]
            end = re.search(r'\[New\]|Chapter \d|Appendix [A-D]|The first paragraph|Storm King.s Thunder', tail)
            block = tail[:end.start()] if end else tail
            ability = re.search(r'using (Intelligence|Wisdom|Charisma) as the spellcasting ability', block)
            if not ability:
                raise ValueError('Missing spellcasting ability: ' + actor)
            dc = re.findall(r'spell save DC (\d+)', block)
            attack = re.findall(r'\+(\d+) to hit with spell attacks', block)
            if len(dc) > 1 or len(attack) > 1:
                raise ValueError('Ambiguous numeric fields')
            if re.search(r'requiring no material (?:spell )?components', block):
                waiver = 'material-only'
            elif 'requiring no spell components' in block:
                waiver = 'all-components'
            else:
                waiver = 'not-stated'
            frequencies = list(re.finditer(r'(At will|[12]/day each):\s*', block))
            groups = []
            if frequencies:
                if not block[:frequencies[0].start()].rstrip().endswith(':'):
                    raise ValueError('Missing action/list boundary')
                for i, frequency in enumerate(frequencies):
                    stop = frequencies[i + 1].start() if i + 1 < len(frequencies) else len(block)
                    tokens = block[frequency.end():stop].strip().split(',')
                    groups.append({'frequency': frequency[1], 'spells': [spell(x) for x in tokens]})
            else:
                if actor != 'Maegera' or not re.fullmatch(r'fireball \(spell save DC 19\), requiring no material components and using Charisma as the spellcasting ability\.', block.strip()):
                    raise ValueError('Unrecognized action without frequency list')
                groups = [{'frequency': 'not-stated', 'spells': [spell('fireball')]}]
            names = [s['name'] for g in groups for s in g['spells']]
            if len(names) != len(set(names)) or len(groups) != len({g['frequency'] for g in groups}):
                raise ValueError('Duplicate spell or frequency')
            rows.append({'actor': actor, 'pdfPage': page_number, 'bookPage': ACTORS[actor][1],
                         'ability': ability[1].lower(), 'saveDc': int(dc[0]) if dc else None,
                         'spellAttackBonus': int(attack[0]) if attack else None,
                         'componentWaiver': waiver, 'requiresSacredBundle': bool(match['bundle']),
                         'groups': groups})
    if set(ACTORS) != seen:
        raise ValueError('Incomplete action set')
    return rows

def audit(manifest, rows):
    if manifest['accepted'] or manifest['fullRulesVerified'] or manifest['automaticPatch']:
        raise ValueError('Unsupported acceptance or automatic patch')
    if manifest['approvedDenominator'] is not None:
        raise ValueError('Actions are not a catalog denominator')
    expected = manifest['actions']
    if len(expected) != len(rows):
        raise ValueError('Action count mismatch')
    for wanted, actual in zip(expected, rows):
        if {key: wanted[key] for key in actual} != actual:
            raise ValueError('Primary action mismatch: ' + actual['actor'])
    return sum(len(g['spells']) for r in rows for g in r['groups'])

def audit_comparisons(manifest, comparisons):
    by_observation = {r['observationCandidate']['id']: r for r in manifest['actions'] if r['observationCandidate']}
    checked = 0
    for comparison in comparisons:
        for previous in comparison['records']:
            if 'Spellcasting' not in previous['comparedBlock']:
                continue
            primary = by_observation[previous['observationId']]
            matches = previous['selectedMatches']
            for key in ('ability', 'saveDc', 'spellAttackBonus', 'requiresSacredBundle'):
                if key in matches and matches[key] != primary[key]:
                    raise ValueError('Selected comparison differs from primary: ' + key)
            if matches.get('noMaterialComponents') and primary['componentWaiver'] not in ('material-only', 'all-components'):
                raise ValueError('Unsupported material waiver')
            if 'componentRequirement' in matches:
                expected = {'none': 'all-components', 'no-material-components': 'material-only'}[matches['componentRequirement']]
                if primary['componentWaiver'] != expected:
                    raise ValueError('Component waiver scope changed')
            action_spells = [s['name'] for g in primary['groups'] for s in g['spells'] if s['override'] == {'castingTime': '1 action'}]
            if 'oneActionSpells' in matches and sorted(matches['oneActionSpells']) != sorted(action_spells):
                raise ValueError('Casting-time override changed')
            if matches.get('frequencyNotStated') and any(g['frequency'] != 'not-stated' for g in primary['groups']):
                raise ValueError('Frequency is explicitly stated')
            for difference in previous.get('differences', []):
                field = difference['field']
                if field in ('ability', 'saveDc', 'spellAttackBonus') and difference['primary'] != primary[field]:
                    raise ValueError('Finding misquotes primary: ' + field)
            checked += 1
    if checked != 10:
        raise ValueError('Expected ten previously compared casting actions')
    return checked


def main():
    from pypdf import PdfReader
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    args = parser.parse_args()
    manifest = json.loads((ROOT/'catalog/skt-spellcasting-action-evidence-2014.json').read_text(encoding='utf-8-sig'))
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != manifest['primaryEvidence']['sha256']:
        raise ValueError('Primary PDF changed')
    for path, expected in manifest['inputSha256'].items():
        if hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n', b'\n')).hexdigest() != expected:
            raise ValueError('Pinned input changed: ' + path)
    rows = parse_actions([page.extract_text() for page in PdfReader(args.pdf).pages])
    count = audit(manifest, rows)
    comparisons = [json.loads((ROOT/p).read_text(encoding='utf-8-sig')) for p in ('catalog/skt-selected-errata-comparison-2014.json', 'catalog/skt-appendix-errata-comparison-2014.json')]
    audit_comparisons(manifest, comparisons)
    print(f'{len(rows)}/13 primary Spellcasting actions; {count} scoped spell entries match')

if __name__ == '__main__':
    main()
