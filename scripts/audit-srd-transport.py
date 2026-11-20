"""Audit transport proposal parameters against the pinned CC-BY SRD5.1 PDF.

Read-only. Checks source tables, parameter units, preserved IDs/prices and provenance.
Russian rule summaries still require independent content review; no runtime acceptance.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHA256 = '2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'


def normalize(text):
    text = re.sub(r'System\s+Reference\s+Document\s+5\.1\s+\d+', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def section(text, start, end):
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError('Missing or ambiguous source table boundary')
    return text.split(start)[1].split(end)[0].strip()


def rows(text, pattern):
    found = list(re.finditer(pattern, text))
    remainder = re.sub(pattern, '', text).strip()
    if not found or remainder:
        raise ValueError('Unsupported or unparsed table content: ' + remainder[:80])
    return [m.groups() for m in found]


def parse_tables(text):
    text = normalize(text)
    mounts = section(text, 'Mounts and Other Animals Item Cost Speed Carrying Capacity', 'Tack, Harness, and Drawn Vehicles')
    tack = section(text, 'Tack, Harness, and Drawn Vehicles Item Cost Weight', 'Waterborne Vehicles')
    water = section(text, 'Waterborne Vehicles Item Cost Speed', 'Trade Goods Most wealth')
    result = {}
    def add(name, values):
        if name in result:
            raise ValueError('Duplicate source row: ' + name)
        result[name] = values
    number = lambda value: int(value.replace(',', ''))
    for name, cost, speed, capacity in rows(mounts, r'\s*([A-Za-z, ]+?) (\d[\d,]*) gp (\d+) ft\. (\d[\d,]*) lb\.\s*'):
        add(name.strip(), {'pricing': {'mode': 'fixed', 'amount': number(cost), 'currency': 'gp'}, 'parameters': {'speed': {'value': number(speed), 'unit': 'ft'}, 'baseCarryingCapacity': {'value': number(capacity), 'unit': 'lb'}}})
    if len(result) != 8:
        raise ValueError('Expected eight animal rows')
    barding = re.findall(r'^Barding ×(\d+) ×(\d+)', tack)
    if len(barding) != 1:
        raise ValueError('Missing barding multipliers')
    add('Barding', {'pricing': {'mode': 'multiplier', 'factor': int(barding[0][0]), 'base': 'equivalent-armor-for-humanoids'}, 'parameters': {'weightMultiplier': int(barding[0][1]), 'base': 'equivalent-armor-for-humanoids'}})
    tack = re.sub(r'^Barding ×\d+ ×\d+', '', tack).replace(' Saddle ', ' ')
    for name, cost, currency, weight in rows(tack, r'\s*([A-Za-z(), ]+?) (\d+) (gp|sp|cp) (\d+ lb\.|—)\s*'):
        name = name.strip()
        if name in ['Exotic', 'Military', 'Pack', 'Riding']:
            name = 'Saddle, ' + name.lower()
        value = {'value': None, 'unit': 'lb', 'sourceNotation': '—', 'meaning': 'not-a-numeric-weight'} if weight == '—' else {'value': int(weight.split()[0]), 'unit': 'lb'}
        add(name, {'pricing': {'mode': 'fixed', 'amount': int(cost), 'currency': currency}, 'parameters': {'weight': value}})
    if len(result) != 22:
        raise ValueError('Expected fourteen tack rows')
    for name, cost, speed in rows(water, r'\s*([A-Za-z ]+?) (\d[\d,]*) gp (\d+½?) mph\s*'):
        speed_value = int(speed.rstrip('½')) + (0.5 if speed.endswith('½') else 0)
        parameters = {'speed': {'value': speed_value, 'unit': 'mph'}}
        if name.strip() == 'Rowboat':
            weight = re.findall(r'A rowboat weighs (\d+) pounds', text)
            if len(weight) != 1:
                raise ValueError('Missing rowboat prose weight')
            parameters['weight'] = {'value': int(weight[0]), 'unit': 'lb', 'sourcePage': 71, 'sourceLocator': 'Rowed Vessels paragraph'}
        add(name.strip(), {'pricing': {'mode': 'fixed', 'amount': number(cost), 'currency': 'gp'}, 'parameters': parameters})
    if len(result) != 28:
        raise ValueError('Expected six waterborne rows')
    return result


def audit(manifest, source_rows, observations, proposals):
    if manifest.get('ruleset') != '5e-2014' or manifest.get('complete') is not False or manifest.get('approvedDenominator') is not None or manifest['source'].get('sha256') != SHA256:
        raise ValueError('Invalid edition or source/acceptance boundary')
    ids = [r['observationId'] for r in manifest['records']]
    names = [r['nameEn'] for r in manifest['records']]
    if len(ids) != 28 or len(set(ids)) != 28 or len(set(names)) != 28 or set(names) != set(source_rows):
        raise ValueError('Missing or duplicate transport rows')
    for row in manifest['records']:
        observation = [r for r in observations['records'] if r['observationId'] == row['observationId']]
        proposal = [r for r in proposals['records'] if r['observationId'] == row['observationId']]
        if len(observation) != 1 or len(proposal) != 1:
            raise ValueError('Unknown or duplicate observation/proposal')
        observation, proposal = observation[0], proposal[0]
        if row['nameEn'] != observation['nameEn'] or row['sourceSection'] != observation['section'] or row['sourcePage'] != observation['sourcePage'] or row['proposedUnitId'] != proposal['proposedUnitId'] or row['unitKind'] != proposal['unitKind']:
            raise ValueError('Changed observation identity')
        if row['pricing'] != observation['pricing'] or row['pricing'] != proposal['pricing'] or row['pricing'] != source_rows[row['nameEn']]['pricing'] or row['parameters'] != source_rows[row['nameEn']]['parameters']:
            raise ValueError('Source parameter mismatch: ' + row['nameEn'])
        if row.get('accepted') is not False or row.get('runtimeImported') is not False:
            raise ValueError('Unreviewed runtime acceptance')
    return len(ids)


def main():
    from pypdf import PdfReader
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=Path)
    args = parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest() != SHA256:
        raise ValueError('Unexpected SRD PDF hash')
    document = PdfReader(args.pdf)
    source_rows = parse_tables(' '.join(document.pages[i].extract_text() for i in [70, 71]))
    load = lambda path: json.loads((ROOT / path).read_text(encoding='utf-8-sig'))
    manifest = load('catalog/srd51-transport-parameters-2014.json')
    for path, expected in manifest['inputSha256'].items():
        raw = (ROOT / path).read_text(encoding='utf-8-sig').replace('\r\n', '\n')
        if hashlib.sha256(raw.encode()).hexdigest() != expected:
            raise ValueError('Changed input SHA: ' + path)
    count = audit(manifest, source_rows, load('catalog/srd51-additional-equipment-discovery.json'), load('catalog/equipment-unit-proposals-2014.json'))
    print(f'{count}/28 transport rows match pinned SRD tables and existing identities; rule prose requires independent review')


if __name__ == '__main__':
    main()
