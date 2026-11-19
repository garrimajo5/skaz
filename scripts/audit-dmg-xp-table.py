"""Check the complete ten-row XP correction table, not complete monster stat blocks."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def parse_table(text):
    if text.count('Monster XP')!=1:raise ValueError('Missing unique table header')
    tail=' '.join(text.split('Monster XP',1)[1].split());rows=[]
    while tail:
        match=re.match(r'Ancient ([A-Za-z]+) Dragon ([0-9]{1,3}(?:,[0-9]{3})+) \[was ([0-9]{1,3}(?:,[0-9]{3})+)\](?:\s+|$)',tail)
        if not match:raise ValueError('Unparsed table content')
        rows.append({'primaryName':'Ancient '+match[1]+' Dragon','primaryPreviousTableXp':int(match[3].replace(',','')),'primaryCorrectedTableXp':int(match[2].replace(',',''))});tail=tail[match.end():]
    if len(rows)!=10 or len({r['primaryName'] for r in rows})!=10:raise ValueError('Wrong row set')
    return rows

def audit(manifest,rows):
    if manifest['accepted'] or manifest['complete'] or manifest['automaticPatch'] or manifest['approvedDenominator'] is not None:raise ValueError('Unsupported acceptance')
    if len(manifest['records'])!=10 or len(rows)!=10:raise ValueError('Missing comparison')
    for expected,actual in zip(manifest['records'],rows):
        if {k:expected[k] for k in actual}!=actual:raise ValueError('Primary table mismatch')
        if expected['observedCurrentXp']!=actual['primaryCorrectedTableXp']:raise ValueError('Secondary XP no longer matches')
        if expected['fullStatBlockCompared'] or expected['automaticPatch'] or expected['canonicalId'] is not None:raise ValueError('Unverified identity promoted')
    return len(rows)

if __name__=='__main__':
    from pypdf import PdfReader
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf',type=Path);a=p.parse_args()
    d=json.loads((ROOT/'catalog/dmg-appendix-xp-comparison-2014.json').read_text(encoding='utf-8-sig'))
    if hashlib.sha256(a.pdf.read_bytes()).hexdigest()!=d['primaryEvidence']['sha256']:raise ValueError('PDF changed')
    for path,sha in d['inputSha256'].items():
        if hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()!=sha:raise ValueError('Input changed')
    print(str(audit(d,parse_table(PdfReader(a.pdf).pages[1].extract_text())))+'/10 XP correction rows match; source attribution and challenge ratings are not changed')
