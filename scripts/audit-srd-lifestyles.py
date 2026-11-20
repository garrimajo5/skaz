"""Audit seven lifestyle rates and billing qualifiers against SRD 5.1 pages72-73.

Russian descriptions and narrative conditions need independent semantic review.
"""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
shared = runpy.run_path(str(ROOT/'scripts/audit-srd-transport.py'))
normalize, SHA256 = shared['normalize'], shared['SHA256']


def parse_lifestyles(text):
    text = normalize(text)
    start, end = 'Lifestyle Expenses Lifestyle Price/Day', 'Wretched.'
    if text.count(start) != 1 or text.count(end) != 1:
        raise ValueError('Missing or ambiguous lifestyle table')
    table = text.split(start)[1].split(end)[0].strip()
    rows = {}
    pattern = r'(Wretched|Squalid|Poor|Modest|Comfortable|Wealthy|Aristocratic) (—|\d+ (?:sp|gp)(?: minimum)?)(?: |$)'
    while table:
        match = re.match(pattern, table)
        if not match:
            raise ValueError('Unexpected lifestyle row: ' + table[:80])
        name, cost = match.groups()
        if name in rows:
            raise ValueError('Duplicate lifestyle row')
        if cost == '—':
            pricing = {'mode':'not-priced','sourceValue':'—'}
        else:
            parts = cost.split()
            pricing = {'mode':'minimum' if len(parts)==3 else 'fixed','amount':int(parts[0]),'currency':parts[1]}
        rows[name] = pricing
        table = table[match.end():].strip()
    if len(rows) != 7:
        raise ValueError('Missing lifestyle row')
    qualifiers = ['At the start of each week or month', 'The prices listed are per day', 'multiply the listed price by 30', 'These prices are included in your total lifestyle expenses.', 'cost of maintaining your equipment', 'Self-Sufficiency', 'doesn’t require you to spend any coin', 'practicing a profession', 'Proficiency in the Survival skill lets you live at the equivalent of a comfortable lifestyle.']
    if any(part not in text for part in qualifiers):
        raise ValueError('Missing lifestyle billing or self-sufficiency qualifier')
    if not re.search(r'equivalent of a po\s*or lifestyle', text):
        raise ValueError('Missing ordinary self-sufficiency equivalent')
    return rows


def audit(manifest, source_rows, observations):
    if manifest.get('accepted') is not False or manifest.get('complete') is not False or manifest.get('approvedDenominator') is not None or manifest.get('ruleset') != '5e-2014' or manifest['source'].get('sha256') != SHA256:
        raise ValueError('Invalid source or acceptance boundary')
    records = manifest['records']
    if len(records) != 7 or len({r['observationId'] for r in records}) != 7 or {r['nameEn'] for r in records} != set(source_rows):
        raise ValueError('Missing or duplicate lifestyle identity')
    for row in records:
        originals = [r for r in observations['records'] if r['observationId']==row['observationId']]
        if len(originals)!=1 or originals[0]['section']!='Lifestyle Expenses' or originals[0]['nameEn']!=row['nameEn'] or originals[0]['sourcePage']!=row['sourcePage']:
            raise ValueError('Changed lifestyle identity')
        if row['pricing']!=source_rows[row['nameEn']] or row['pricing']!=originals[0]['pricing'] or row['pricingPeriod']!='day':
            raise ValueError('Lifestyle price/period mismatch')
        if row.get('accepted') is not False or row.get('runtimeImported') is not False:
            raise ValueError('Unreviewed runtime acceptance')
    billing = manifest['billing']
    if billing['ratePeriod']!='day' or billing['chooseAtStartOf']!=['week','month'] or billing['canChangeEachPeriod'] is not True or set(billing['includes'])!={'accommodation','food','drink','other-necessities','equipment-maintenance'} or billing['doNotDoubleChargeIncludedExpenses'] is not True or billing['example']!={'days':30,'multiplier':30,'fixedCalendarMonthLength':False} or billing['automaticDebit'] is not False:
        raise ValueError('Lifestyle billing boundaries changed')
    suff = manifest['selfSufficiency']
    expected = {'scope':'time-between-adventures','coinExpense':0,'timeRequired':True,'timeDuration':None,'ordinaryEquivalent':'Poor','ordinaryCondition':'spend downtime practicing a profession','survivalProficiencyEquivalent':'Comfortable','automaticIncome':False,'automaticLifestyleChange':False}
    if any(suff.get(k)!=v for k,v in expected.items()):
        raise ValueError('Self-sufficiency changed into automatic income or free instant benefit')
    boundary = manifest['applicationBoundary']
    if boundary!={'ruleDeviation':'warn-and-allow-manual-override','automaticConditions':False,'automaticSocialBonuses':False,'personalExceptions':'do-not-rewrite-reference'}:
        raise ValueError('Narrative rules cannot become gameplay locks or automatic conditions')
    return 7


def main():
    from pypdf import PdfReader
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf',type=Path)
    args=parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:
        raise ValueError('Unexpected SRD PDF hash')
    pdf=PdfReader(args.pdf)
    source=parse_lifestyles(' '.join(pdf.pages[i].extract_text() for i in (71,72)))
    load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
    manifest=load('catalog/srd51-lifestyle-conditions-2014.json')
    for path,expected in manifest['inputSha256'].items():
        raw=(ROOT/path).read_text(encoding='utf-8-sig').replace('\r\n','\n')
        if hashlib.sha256(raw.encode()).hexdigest()!=expected:
            raise ValueError('Changed input SHA: '+path)
    audit(manifest,source,load('catalog/srd51-additional-equipment-discovery.json'))
    print('7/7 lifestyle rates and billing qualifiers match pinned SRD72-73; narrative semantics require review')


if __name__=='__main__':main()
