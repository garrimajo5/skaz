"""Compare SRD70 pack prices and contents with existing observations and proposals.

Unknown quantities remain unknown; package units never expand into runtime inventory.
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


def parse_member(clause):
    clause=re.sub(r'^and ', '', clause.strip())
    clause=re.sub(r'lante\s+rn', 'lantern', clause)
    if clause in ('sealing wax','soap','vestments'):
        return {'sourceName':clause,'quantity':None,'unit':'unspecified'}
    patterns=[
        (r'a bag of ([\d,]+) ball bearings',lambda m:('ball bearings',1,'bag of '+m[0].replace(',',''))),
        (r'(\d+) feet of string',lambda m:('string',int(m[0]),'foot')),
        (r'(\d+) flasks of oil',lambda m:('oil',int(m[0]),'flask')),
        (r'(\d+) days (?:of )?rations',lambda m:('rations',int(m[0]),'day')),
        (r'(\d+) sheets of (paper|parchment)',lambda m:(m[1],int(m[0]),'sheet')),
        (r'(\d+) blocks of incense',lambda m:('incense',int(m[0]),'block')),
        (r'a set of fine clothes',lambda m:('fine clothes',1,'set')),
        (r'a bottle of ink',lambda m:('ink',1,'bottle')),
        (r'a vial of perfume',lambda m:('perfume',1,'vial')),
        (r'a little bag of sand',lambda m:('sand',1,'little bag')),
        (r'(?:a|an) ([a-z ]+)',lambda m:(m[0],1,'each')),
        (r'(\d+) ([a-z ]+)',lambda m:(m[1],int(m[0]),'each')),
    ]
    for pattern,convert in patterns:
        match=re.fullmatch(pattern,clause)
        if match:
            name,quantity,unit=convert(match.groups())
            return {'sourceName':name,'quantity':quantity,'unit':unit}
    raise ValueError('Unresolved pack clause: '+clause)


def parse_packs(text):
    text=normalize(text)
    body=section(text,'Equipment Packs The starting equipment','Tools A tool helps')
    heading=re.compile(r'([A-Za-z]+’s Pack) \((\d+) gp\)\. Includes ')
    starts=list(heading.finditer(body))
    if len(starts)!=7 or len({m[1] for m in starts})!=7:
        raise ValueError('Missing or duplicate pack heading')
    records=[]
    for i,head in enumerate(starts):
        content=body[head.end():starts[i+1].start() if i+1<len(starts) else len(body)].strip()
        rope=re.search(r' The pack also has (\d+) feet of hempen rope strapped to the side of it\.$',content)
        if rope:content=content[:rope.start()]
        if not content.endswith('.') or '.' in content[:-1]:raise ValueError('Unexpected pack sentence')
        # Thousands separators are not item delimiters.
        clauses=re.split(r', ',content[:-1])
        members=[parse_member(c) for c in clauses]
        if rope:members.append({'sourceName':'hempen rope','quantity':1,'unit':rope[1]+'-foot length'})
        if len({m['sourceName'] for m in members})!=len(members):raise ValueError('Duplicate pack member')
        records.append({'nameEn':head[1],'listedCostGp':int(head[2]),'contents':members})
    if sum(len(r['contents']) for r in records)!=66:raise ValueError('Missing or extra pack member')
    return records


def audit(source,observations,memberships,proposals):
    rows=memberships['records']
    if len(rows)!=7 or len({r['observationId'] for r in rows})!=7 or {r['nameEn'] for r in rows}!={r['nameEn'] for r in source}:
        raise ValueError('Missing or duplicate pack identity')
    expected={r['nameEn']:r for r in source}
    count=0
    for row in rows:
        src=expected[row['nameEn']]
        original=[r for r in observations['records'] if r['observationId']==row['observationId']]
        proposal=[r for r in proposals['records'] if r['observationId']==row['observationId']]
        if len(original)!=1 or len(proposal)!=1:raise ValueError('Unknown observation/proposal')
        original,proposal=original[0],proposal[0]
        price={'mode':'fixed','amount':src['listedCostGp'],'currency':'gp'}
        if row['sourcePage']!=70 or original['section']!='Equipment Packs' or original['nameEn']!=row['nameEn'] or proposal['nameEn']!=row['nameEn'] or original['pricing']!=price or proposal['pricing']!=price or row['listedCostGp']!=src['listedCostGp'] or row['proposedCanonicalId']!=proposal['proposedUnitId']:
            raise ValueError('Pack identity or listed price changed')
        projection=[{k:m[k] for k in ('sourceName','quantity','unit')} for m in row['contents']]
        if projection!=src['contents']:raise ValueError('Pack source contents changed')
        linked=[m for m in proposals['packMemberships'] if m['packObservationId']==row['observationId']]
        if [{k:m[k] for k in ('sourceName','quantity','unit')} for m in linked]!=projection:
            raise ValueError('Proposal lost package units or unknown quantities')
        for member in linked:
            if member['quantityStatus']!=('unspecified' if member['quantity'] is None else 'source-specified'):
                raise ValueError('Unknown quantity status changed')
        count+=len(projection)
    if len(proposals['packMemberships'])!=count:raise ValueError('Extra membership outside observed packs')
    return count


def main():
    from pypdf import PdfReader
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('pdf',type=Path);args=parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:raise ValueError('Unexpected SRD PDF hash')
    source=parse_packs(PdfReader(args.pdf).pages[69].extract_text())
    load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))
    audit(source,load('srd51-additional-equipment-discovery.json'),load('srd51-equipment-pack-memberships.json'),load('equipment-unit-proposals-2014.json'))
    print('7/7 pack prices and 66/66 contents match pinned SRD70; 3 unspecified quantities preserved')


if __name__=='__main__':main()
