"""Validate MM2014 errata correction units without treating every heading as a creature."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SPECIAL={'Gith':'lore-correction','Half-Dragon':'template-and-example-correction','Lycanthropes':'player-template-rule','Swarm of X':'stat-block-family','Vampire, Spellcaster':'named-stat-block-variant'}
def extract_units(pages):
    if len(pages)!=2:raise ValueError('Wrong PDF page count')
    rows=[]
    for page_no,text in enumerate(pages,1):
        text=' '.join(re.sub(r'-\s*\n\s*','',text).split())
        if page_no==1:
            anchor='Aarakocra (p. 12).'
            if text.count(anchor)!=1:raise ValueError('Missing unique first monster')
            text=text[text.index(anchor):]
        for m in re.finditer(r'(?:\[New\]\s*)?([A-Z][A-Za-z,\u2019\u2018\-\x27 ]+?) \(p\. ([0-9\u2013\-]+)\)\.',text):
            name=m[1].strip();rows.append({'primaryName':name,'bookPageLabel':m[2],'pdfPage':page_no,'unitKind':SPECIAL.get(name,'named-stat-block'),'accepted':False})
    if len(rows)!=80 or len({r['primaryName'] for r in rows})!=80:raise ValueError('Incomplete or repeated correction set')
    if {r['primaryName'] for r in rows if r['unitKind']!='named-stat-block'}!=set(SPECIAL):raise ValueError('Missing non-default unit kinds')
    return rows

def audit(data,rows):
    if data['rulesEdition']!='5e-2014' or data['sourceId']!='103' or data['accepted'] or data['completeBookInventory'] or data['approvedDenominator'] is not None:raise ValueError('Invalid inventory scope')
    if data['records']!=rows:raise ValueError('Primary heading inventory changed')
    actual={'correctionHeadings':len(rows),'namedStatBlockHeadings':sum(r['unitKind']=='named-stat-block' for r in rows),'namedVariantHeadings':sum(r['unitKind']=='named-stat-block-variant' for r in rows),'nonIndividualUnits':sum(r['unitKind'] not in ['named-stat-block','named-stat-block-variant'] for r in rows)}
    if data['summary']!=actual:raise ValueError('Wrong unit counts')
    return actual
if __name__=='__main__':
    from pypdf import PdfReader
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf',type=Path);a=p.parse_args()
    d=json.loads((ROOT/'catalog/mm-errata-unit-inventory-2014.json').read_text(encoding='utf-8'))
    if hashlib.sha256(a.pdf.read_bytes()).hexdigest()!=d['primaryEvidence']['sha256']:raise ValueError('PDF changed')
    print(json.dumps(audit(d,extract_units([p.extract_text() for p in PdfReader(a.pdf).pages]))))
