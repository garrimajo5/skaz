"""Re-read SRD72-74 trade and food tables; preserve alternatives and billing units.

This checks existing proposals, not permission to publish or import runtime content.
"""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-srd-transport.py'))
normalize,section,SHA256=shared['normalize'],shared['section'],shared['SHA256']


def parse_trade(text):
    table=section(normalize(text),'Trade Goods Cost Goods','Expenses When')
    result=[]
    while table:
        match=re.match(r'(\d+) (cp|sp|gp) (.*?)(?= \d+ (?:cp|sp|gp) |$)',table)
        if not match:raise ValueError('Malformed trade goods row')
        amount,currency,goods=match.groups()
        alternatives=[]
        inherited=None
        for raw in re.split(r',? or ',goods):
            raw=raw.strip().rstrip(',')
            measured=re.fullmatch(r'(\d+) (lb\.|sq\. yd\.) of ([A-Za-z ]+)',raw)
            animal=re.fullmatch(r'one (chicken|goat|sheep|pig|cow|ox)',raw)
            if measured:
                quantity,unit,name=measured.groups()
                unit='lb' if unit=='lb.' else 'square-yard'
                quantity=int(quantity)
                inherited=(quantity,unit)
            elif animal:
                name=animal.group(1);quantity=1;unit='animal';inherited=None
            elif raw=='pepper' and inherited==(1,'lb'):
                # The printed row says "1 lb. of cinnamon or pepper, or one sheep".
                name=raw;quantity,unit=inherited
            else:raise ValueError('Unresolved trade quantity/unit: '+raw)
            alternatives.append({'nameEn':name.capitalize(),'quantity':quantity,'unit':unit})
        names=[a['nameEn'] for a in alternatives]
        if len(set(names))!=len(names):raise ValueError('Duplicate trade alternative')
        result.append({'nameEn':' or '.join(names),'pricing':{'mode':'fixed','amount':int(amount),'currency':currency},'alternatives':alternatives})
        table=table[match.end():].strip()
    if len(result)!=13 or len({r['nameEn'] for r in result})!=13 or sum(len(r['alternatives']) for r in result)!=23:
        raise ValueError('Missing or duplicate trade rows/alternatives')
    return result


def parse_food(text):
    text=normalize(text)
    table=section(text,'Food, Drink, and Lodging Item Cost','Services Adventurers can pay')
    labels=[('Ale Gallon','Ale, gallon','gallon'),('Mug','Ale, mug','mug'),('Banquet (per person)','Banquet','person'),('Bread, loaf','Bread, loaf','loaf'),('Cheese, hunk','Cheese, hunk','hunk')]
    tiers=['Squalid','Poor','Modest','Comfortable','Wealthy','Aristocratic']
    labels += [('Inn stay (per day) '+t if i==0 else t,'Inn stay, '+t,'day') for i,t in enumerate(tiers)]
    labels += [('Meals (per day) '+t if i==0 else t,'Meals, '+t,'day') for i,t in enumerate(tiers)]
    labels += [('Meat, chunk','Meat, chunk','chunk'),('Wine Common (pitcher)','Wine, common','pitcher'),('Fine (bottle)','Wine, fine','bottle')]
    result=[]
    for label,name,unit in labels:
        match=re.match(re.escape(label)+r' (\d+) (cp|sp|gp)(?: |$)',table)
        if not match:raise ValueError('Missing or malformed food row: '+label)
        amount,currency=match.groups()
        result.append({'nameEn':name,'pricing':{'mode':'fixed','amount':int(amount),'currency':currency},'pricedUnit':unit})
        table=table[match.end():].strip()
    if table:raise ValueError('Extra food table content')
    if 'These prices are included in your total lifestyle expenses.' not in text:
        raise ValueError('Missing included-expenses qualifier')
    return result


def audit(observations,proposals,trade,food):
    count=0
    for section_name,source_rows in [('Trade Goods',trade),('Food, Drink, and Lodging',food)]:
        records=[r for r in observations['records'] if r['section']==section_name]
        if len(records)!=len(source_rows) or len({r['observationId'] for r in records})!=len(records) or {r['nameEn'] for r in records}!={r['nameEn'] for r in source_rows}:
            raise ValueError('Missing or duplicate household identity')
        byname={r['nameEn']:r for r in source_rows}
        for row in records:
            expected=byname[row['nameEn']]
            if any(row.get(k)!=v for k,v in expected.items()):raise ValueError('Source household table mismatch: '+row['nameEn'])
            if section_name=='Trade Goods' and row.get('alternativesAre')!='one-of-not-a-bundle':raise ValueError('Alternatives cannot become a bundle')
            if section_name=='Food, Drink, and Lodging' and row.get('includedInLifestyleExpenses') is not True:raise ValueError('Included expense lost')
            candidates=[p for p in proposals['records'] if p['observationId']==row['observationId']]
            if len(candidates)!=1 or candidates[0]['nameEn']!=row['nameEn'] or candidates[0]['pricing']!=row['pricing']:
                raise ValueError('Missing or changed proposal identity/price')
            proposal=candidates[0]
            if 'alternatives' in row:
                projected=[{k:a.get(k) for k in ('nameEn','quantity','unit')} for a in proposal.get('alternatives',[])]
                if projected!=row['alternatives']:raise ValueError('Proposal changed trade alternatives')
            for key in ('alternativesAre','pricedUnit','includedInLifestyleExpenses'):
                if key in row and proposal.get(key)!=row[key]:raise ValueError('Proposal changed source units/alternatives')
            count+=1
    return count


def main():
    from pypdf import PdfReader
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('pdf',type=Path);args=parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:raise ValueError('Unexpected SRD PDF hash')
    document=PdfReader(args.pdf)
    trade=parse_trade(document.pages[71].extract_text())
    food=parse_food(' '.join(document.pages[i].extract_text() for i in (72,73)))
    load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))
    audit(load('srd51-additional-equipment-discovery.json'),load('equipment-unit-proposals-2014.json'),trade,food)
    print('33/33 existing trade/food rows match pinned SRD: 13 rows/23 alternatives, 20 food/lodging prices and units')


if __name__=='__main__':main()
