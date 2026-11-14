"""Read-only heading/page and spell-table audit of the pinned SRD 5.1.
Checks source locations, not the correctness/completeness of Russian summaries.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
SHA256='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
def normalized(value):
    return re.sub('[^a-z0-9]', '', value.lower())
def ordinal(n):
    return str(n)+('th' if 10 <= n % 100 <= 20 else {1:'st',2:'nd',3:'rd'}.get(n % 10,'th'))
def audit_reference(data,pages):
    errors=[];features=0;tables=0;links=0
    def page(number):
        if not isinstance(number,int) or number not in pages:
            raise ValueError('Missing source page: '+str(number))
        return normalized(pages[number])
    for subclass in data['subclasses']:
        if normalized(subclass['nameEn']) not in page(subclass['sourcePage']):
            errors.append('Subclass heading/page: '+subclass['id'])
        for feature in subclass['features']:
            features+=1
            if normalized(feature['key']) not in page(feature['sourcePage']):
                errors.append('Feature heading/page: '+subclass['id']+'/'+feature['key'])
        for table in subclass.get('spellTables',[]):
            tables+=1;body=page(table['sourcePage']);heading=normalized(table['sourceHeading'])
            if heading not in body:
                errors.append('Table heading/page: '+subclass['id']+'/'+table['name']);continue
            body=body.split(heading,1)[1]
            following=[body.find(normalized(other['sourceHeading'])) for other_subclass in data['subclasses'] for other in other_subclass.get('spellTables',[]) if other is not table and other['sourcePage']==table['sourcePage']]
            ends=[n for n in following if n>=0]
            if ends:body=body[:min(ends)]
            for row in table['rows']:
                names=[data['spellNames'][sid]['en'] for sid in row['spellIds']];links+=len(names)
                wanted=normalized(ordinal(row['level'])+''.join(names))
                if wanted not in body:
                    errors.append('Table row: '+subclass['id']+'/'+table['name']+'/'+str(row['level']))
    return {'subclasses':len(data['subclasses']),'featureHeadings':features,'spellTables':tables,'spellLinks':links,'errors':errors,
            'scope':'Heading locations and spell-table rows only; not automatic validation of translated rules.'}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('pdf',type=Path);parser.add_argument('--catalog',type=Path,default=Path(__file__).resolve().parents[1]/'catalog/srd51-subclass-reference.json');args=parser.parse_args()
    if hashlib.sha256(args.pdf.read_bytes()).hexdigest()!=SHA256:raise SystemExit('Unexpected SRD source hash')
    data=json.loads(args.catalog.read_text(encoding='utf-8-sig'))
    if data['source']['sha256']!=SHA256 or data['ruleset']!='5e-2014':raise SystemExit('Catalog source mismatch')
    from pypdf import PdfReader
    reader=PdfReader(args.pdf)
    needed={s['sourcePage'] for s in data['subclasses']}|{f['sourcePage'] for s in data['subclasses'] for f in s['features']}|{t['sourcePage'] for s in data['subclasses'] for t in s.get('spellTables',[])}
    report=audit_reference(data,{n:reader.pages[n-1].extract_text() for n in needed})
    print(json.dumps(report,ensure_ascii=True,indent=2))
    if report['errors']:raise SystemExit(1)
if __name__=='__main__':main()
