"""Audit the13 container capacities and backpack note against pinned SRD69-70."""
import argparse
import hashlib
import json
import re
import runpy
from fractions import Fraction
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-srd-transport.py'))
normalize,SHA256=shared['normalize'],shared['SHA256']
LABELS=['Backpack','Barrel','Basket','Bottle','Bucket','Chest','Flask or tankard','Jug or pitcher','Pot, iron','Pouch','Sack','Vial','Waterskin']
ITEM_SUFFIXES=['backpack','barrel','basket','glass-bottle','bucket','chest','flask-or-tankard','jug-or-pitcher','iron-pot','pouch','sack','vial','waterskin']
EXPECTED_IDS=dict(zip(LABELS,['srd51:2014:item:'+value for value in ITEM_SUFFIXES]))
NUMBER=r'(?:\d+½|\d+/\d+|\d+)'

def number(value):
    if value.endswith('½'):return int(value[:-1])+0.5
    result=Fraction(value)
    return int(result) if result.denominator==1 else float(result)

def dimension(value,unit,content):
    return {'amount':number(value),'unit':unit,'content':content}

def parse_capacity(value):
    match=re.fullmatch('('+NUMBER+r') cubic (?:foot|feet)/('+NUMBER+r') pounds of gear',value)
    if match:return [dimension(match[1],'cubic-foot','gear'),dimension(match[2],'pound','gear')],'paired-volume-and-weight'
    match=re.fullmatch('('+NUMBER+r') gallons liquid, ('+NUMBER+r') cubic (?:foot|feet) solid',value)
    if match:return [dimension(match[1],'gallon','liquid'),dimension(match[2],'cubic-foot','solid')],'alternative-content'
    match=re.fullmatch('('+NUMBER+r') (pints?|gallons?|ounces) liquid',value)
    if match:
        unit={'pint':'pint','pints':'pint','gallon':'gallon','gallons':'gallon','ounces':'fluid-ounce'}[match[2]]
        return [dimension(match[1],unit,'liquid')],'single'
    raise ValueError('Unsupported capacity: '+value)

def parse_table(text):
    text=normalize(text)
    opening='Container Capacity Container Capacity'
    ending='Equipment Packs'
    if text.count(opening)!=1 or text.count(ending)!=1:raise ValueError('Missing or ambiguous capacity boundary')
    table=text.split(opening)[1].split(ending)[0].strip()
    note='* You can also strap items, such as a bedroll or a coil of rope, to the outside of a backpack.'
    if table.count(note)!=1:raise ValueError('Missing backpack exterior note')
    table=table.replace(note,'').strip()
    pattern=r'('+'|'.join(re.escape(label) for label in sorted(LABELS,key=len,reverse=True))+r')(\*)? '
    matches=list(re.finditer(pattern,table))
    if [m[1] for m in matches]!=LABELS or matches[0].start()!=0:raise ValueError('Missing, reordered or duplicate container')
    rows={}
    for i,m in enumerate(matches):
        if bool(m[2])!=(m[1]=='Backpack'):raise ValueError('Unexpected backpack footnote marker')
        capacity=table[m.end():matches[i+1].start() if i+1<len(matches) else len(table)].strip()
        dims,relationship=parse_capacity(capacity)
        rows[m[1]]={'sourceCapacity':capacity,'dimensions':dims,'relationship':relationship}
    return rows

def audit(manifest,rows,identities):
    if manifest['source']['sha256']!=SHA256 or manifest['ruleset']!='5e-2014' or manifest['accepted'] is not False or manifest['complete'] is not False or manifest['approvedDenominator'] is not None:raise ValueError('Invalid source/acceptance boundary')
    records=manifest['records'];links=[r['candidateItemId'] for r in records]
    if len(records)!=13 or set(r['nameEn'] for r in records)!=set(LABELS) or len(set(links))!=13:raise ValueError('Invalid container identities')
    known=[r['proposedCanonicalId'] for r in identities['records']]
    for r in records:
        if known.count(r['candidateItemId'])!=1:raise ValueError('Unknown item link')
        if r['candidateItemId']!=EXPECTED_IDS[r['nameEn']]:raise ValueError('Item name/identity mismatch')
        for key in ['sourceCapacity','dimensions','relationship']:
            if r[key]!=rows[r['nameEn']][key]:raise ValueError('Capacity mismatch: '+r['nameEn']+' / '+key)
        if r['accepted'] is not False or r['runtimeImported'] is not False:raise ValueError('Unexpected runtime acceptance')
    exterior=manifest['backpackExterior']
    if exterior['candidateItemId']!='srd51:2014:item:backpack' or exterior['additionalNumericCapacity'] is not None or exterior['itemsWeightless'] is not False:raise ValueError('Invalid exterior capacity inference')
    return len(records)

def main():
    from pypdf import PdfReader
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('pdf',type=Path);args=parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:raise ValueError('Unexpected SRD PDF hash')
    reader=PdfReader(args.pdf);rows=parse_table(' '.join(reader.pages[i].extract_text() for i in [68,69]))
    load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))
    count=audit(load('srd51-container-capacities-2014.json'),rows,load('equipment-identity-reconciliation.json'))
    print(f'{count}/13 container capacities and backpack note match pinned SRD69-70; no volume-to-weight conversion')
if __name__=='__main__':main()
