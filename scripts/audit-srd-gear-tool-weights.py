"""Audit weights of99 adventuring-gear and35 tool entries against pinned SRD69-70.

Weights apply to the whole listed entry, not each component of an ammunition pack.
Read-only; does not recalculate inventory, infer unknown weights or import content.
"""
import argparse
import hashlib
import json
import re
import runpy
from fractions import Fraction
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-srd-transport.py'))
SHA256=shared['SHA256']


def normalize(text):
    text=shared['normalize'](text)
    text=re.sub(r'-[\u00ad\u2010\u2011]+','-',text)
    return text.replace('’',"'")


def section(text,start,end):
    if text.count(start)!=1 or text.count(end)!=1:raise ValueError('Missing or ambiguous table boundary')
    return text.split(start)[1].split(end)[0].strip()


def parse_table(text,kind):
    text=normalize(text)
    if kind=='gear':
        table=section(text,'Item Cost Weight','Container Capacity Container Capacity')
        headings={'Ammunition':'Arrows (20)','Arcane focus':'Crystal','Druidic focus':'Sprig of mistletoe','Holy symbol':'Amulet'}
    elif kind=='tools':
        table=section(text,'Tools Item Cost Weight',"Artisan's Tools.")
        note='Vehicles (land or water) * * * See the “Mounts and Vehicles” section.'
        if not table.endswith(note):raise ValueError('Vehicle reference missing or changed')
        table=table[:-len(note)].strip()
        headings={"Artisan's tools":"Alchemist's supplies",'Gaming set':'Dice set','Musical instrument':'Bagpipes'}
    else:raise ValueError('Unknown table kind')
    for heading,first in headings.items():
        if table.count(heading)!=1 or heading+' '+first+' ' not in table:raise ValueError('Missing or misplaced category heading')
        table=table.replace(heading+' ','')
    # Bound each entire row by cost plus weight. Unconsumed text fails rather than becoming a new record.
    pattern=r"([^\d]+?(?:\([^)]*\))?[^\d]*?) ([\d,]+) (gp|sp|cp) (—|(?:\d+½|\d+/\d+|\d+) lb\.(?: \(full\))?)(?= |$)"
    rows={};pos=0
    for m in re.finditer(pattern,table):
        if table[pos:m.start()].strip():raise ValueError('Unparsed table text')
        name=m[1].strip()
        if name in rows:raise ValueError('Duplicate source row')
        notation=m[4]
        if notation=='—':weight=None
        else:
            value=notation.split(' ')[0]
            weight=float(int(value[:-1])+0.5) if value.endswith('½') else float(Fraction(value))
        rows[name]={'sourceName':name,'costCp':int(m[2].replace(',',''))*{'gp':100,'sp':10,'cp':1}[m[3]],'sourceWeight':notation,'weightLb':weight,'weightBasis':'entire-listed-entry','fillState':'full' if notation.endswith('(full)') else 'not-specified','sourcePage':69 if kind=='gear' else 70}
        pos=m.end()
    if table[pos:].strip() or not rows:raise ValueError('Unparsed table tail')
    if len(rows)!={'gear':99,'tools':35}[kind]:raise ValueError('Unexpected table row count')
    return rows


def audit(manifest,tables,identities):
    if manifest['source']['sha256']!=SHA256 or manifest['ruleset']!='5e-2014':raise ValueError('Invalid source')
    if manifest['accepted'] is not False or manifest['complete'] is not False or manifest['approvedDenominator'] is not None:raise ValueError('Acceptance boundary changed')
    expected_ids={};expected_names={}
    for kind,identity in identities.items():
        path=f'catalog/{kind}-canonical-proposal-2014.json'
        if manifest['inputSha256'][path]!=hashlib.sha256((ROOT/path).read_bytes()).hexdigest():raise ValueError('Identity input changed')
        by_name={normalize(r['nameEn']):r for r in identity['records']}
        if set(by_name)!=set(tables[kind]):raise ValueError('Source and identity names differ')
        for name,row in tables[kind].items():
            ident=by_name[name];key=ident['proposedCanonicalId']
            if key in expected_ids:raise ValueError('Identity collision')
            if row['costCp']!=ident['costCp']:raise ValueError('Existing price mismatch')
            expected_ids[key]={k:v for k,v in row.items() if k!='costCp'}
            expected_ids[key]['table']=kind
            expected_names[key]=ident['nameEn']
    records=manifest['records']
    if len(records)!=134 or len({r['candidateItemId'] for r in records})!=134 or set(r['candidateItemId'] for r in records)!=set(expected_ids):raise ValueError('Invalid record identities')
    for row in records:
        key=row['candidateItemId']
        if row['nameEn']!=expected_names[key]:raise ValueError('Identity/name mismatch')
        if row['accepted'] is not False or row['runtimeImported'] is not False:raise ValueError('Unexpected runtime acceptance')
        for field,value in expected_ids[key].items():
            if row.get(field)!=value:raise ValueError('Weight metadata mismatch: '+row['nameEn']+' / '+field)
    return len(records)


def load_inputs(pdf):
    from pypdf import PdfReader
    if hashlib.sha256(pdf.read_bytes()).hexdigest()!=SHA256:raise ValueError('Unexpected PDF hash')
    r=PdfReader(pdf)
    return {'gear':parse_table(r.pages[68].extract_text(),'gear'),'tools':parse_table(r.pages[69].extract_text(),'tools')}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf',type=Path);a=p.parse_args()
    tables=load_inputs(a.pdf)
    load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
    m=load('catalog/srd51-gear-tool-weights-2014.json')
    n=audit(m,tables,{kind:load(f'catalog/{kind}-canonical-proposal-2014.json') for kind in ['gear','tools']})
    print(f'{n}/134 weights match SRD69-70, including full-waterskin and whole-listed-unit scope; source dashes remain null')
if __name__=='__main__':main()
