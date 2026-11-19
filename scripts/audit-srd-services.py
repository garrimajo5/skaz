"""Verify service prices and illustrative spellcasting quote against SRD74.

No purchasing or limits are implemented. Semantic Russian summaries require review.
"""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-srd-transport.py'))
normalize,SHA256=shared['normalize'],shared['SHA256']


def parse_services(text):
    text=normalize(text)
    start='Services Service Pay'
    end='Skilled hirelings include'
    if text.count(start)!=1 or text.count(end)!=1:
        raise ValueError('Missing or ambiguous service table')
    table=text.split(start)[1].split(end)[0].strip()
    labels=[('Coach cab Between towns','Coach cab, between towns'),('Within a city','Coach cab, within a city'),('Hireling Skilled','Hireling, skilled'),('Untrained','Hireling, untrained'),('Messenger','Messenger'),('Road or gate toll','Road or gate toll'),('Ship’s passage','Ship’s passage')]
    rates={}
    for label,name in labels:
        match=re.match(re.escape(label)+r' (\d+) (cp|sp|gp)(?: per (mile|day))?(?: |$)',table)
        if not match:
            raise ValueError('Missing or malformed service row: '+label)
        amount,currency,period=match.groups()
        rates[name]={'pricing':{'mode':'fixed','amount':int(amount),'currency':currency},'pricedUnit':period or 'not-specified-in-table'}
        table=table[match.end():].strip()
    if table:
        raise ValueError('Unexpected extra service row')
    prose=text.split(end)[1]
    if not re.search(r'The pay shown is a minimum; some expert hirelings require m\s*ore pay',prose):
        raise ValueError('Missing skilled hireling minimum qualifier')
    rates['Hireling, skilled']['pricing']['mode']='minimum'
    quote=re.findall(r'spell of (\d+)st or (\d+)nd level,.*?cost (\d+) to (\d+) gold pieces',prose)
    if len(quote)!=1 or 'no established pay rates exist' not in prose or '(plus the cost of any expensive material components)' not in prose:
        raise ValueError('Missing or ambiguous spellcasting quote boundaries')
    a,b,low,high=map(int,quote[0])
    return {'rates':rates,'quote':{'spellLevels':[a,b],'low':low,'high':high,'currency':'gp'}}


def audit(manifest,source,observations):
    if manifest.get('accepted') is not False or manifest.get('complete') is not False or manifest.get('approvedDenominator') is not None or manifest.get('ruleset')!='5e-2014' or manifest['source'].get('sha256')!=SHA256:
        raise ValueError('Invalid source or acceptance boundary')
    rows=manifest['services']
    if len(rows)!=7 or len({r['observationId'] for r in rows})!=7 or {r['nameEn'] for r in rows}!=set(source['rates']):
        raise ValueError('Missing or duplicate service identity')
    for row in rows:
        original=[r for r in observations['records'] if r['observationId']==row['observationId']]
        if len(original)!=1 or original[0]['section']!='Services' or original[0]['nameEn']!=row['nameEn']:
            raise ValueError('Unknown service identity')
        expected=source['rates'][row['nameEn']]
        if row['pricing']!=expected['pricing'] or row['pricedUnit']!=expected['pricedUnit'] or row['pricing']!=original[0]['pricing']:
            raise ValueError('Service price/period mismatch')
    spell=manifest['spellcastingServices'];quote=spell['illustrativeQuote']
    for key,value in source['quote'].items():
        if quote.get(key)!=value:
            raise ValueError('Spellcasting source quote mismatch')
    if spell.get('normalRate') is not None or spell.get('ordinaryHirelingRateApplies') is not False or spell.get('automaticPurchase') is not False or spell.get('accepted') is not False or quote.get('commonSpellsOnly') is not True or quote.get('bindingMinimum') is not False or quote.get('bindingMaximum') is not False or quote.get('expensiveMaterialComponents')!='additional':
        raise ValueError('Illustrative price cannot become a fixed rate or gameplay limit')
    return 7


def main():
    from pypdf import PdfReader
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('pdf',type=Path);args=parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:
        raise ValueError('Unexpected SRD PDF hash')
    source=parse_services(PdfReader(args.pdf).pages[73].extract_text())
    load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))
    audit(load('srd51-service-conditions-2014.json'),source,load('srd51-additional-equipment-discovery.json'))
    print('7/7 service rates and illustrative spellcasting quote match pinned SRD74; no fixed spellcasting tariff')


if __name__=='__main__':
    main()
