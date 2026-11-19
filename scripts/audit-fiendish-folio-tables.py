"""Audit the 18 printed Folio table rows; do not equate them to a digital denominator."""
import argparse,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def table(text,start,end):
    if text.count(start)!=1 or text.count(end)!=1:raise ValueError('Ambiguous table boundary')
    return text.split(start,1)[1].split(end,1)[0]
def parse_tables(text):
    # PDF text order places the tables after Credits/Introduction and before the sample watermark.
    text=re.sub(r'\s+',' ',text)
    contents=table(text,'ContentsContents ','Monsters by Challenge Rating')
    challenge=table(text,'Monsters by Challenge Rating Monster CR ','Sample file')
    def rows(value,pattern):
        out=[]
        while value.strip():
            m=re.match(pattern,value)
            if not m:raise ValueError('Unparsed table content: '+value[:70])
            out.append((m[1].strip(),m[2]));value=value[m.end():]
        if len(out)!=18 or len({r[0] for r in out})!=18:raise ValueError('Unexpected row set')
        return out
    c=rows(contents,r'\s*([A-Za-z, ]+?)\s*\.{2,}\s*(\d+)\s*')
    r=rows(challenge,r'\s*([A-Za-z, ]+?)\s*\.{2,}\s*(\d+(?:/\d+)?)\s*')
    if [x[0] for x in c]!=[x[0] for x in r]:raise ValueError('Table name/order mismatch')
    return [{'name':name,'printedPage':int(page),'challengeRating':cr} for (name,page),(_,cr) in zip(c,r)]
def audit(manifest,rows,inventory):
    if manifest['accepted'] or manifest['complete'] or manifest['approvedDenominator'] is not None:raise ValueError('Premature acceptance')
    if manifest['countEvidence']['printDigitalDifferenceResolved'] or manifest['countEvidence']['automaticDeletion']:raise ValueError('Unsupported resolution')
    if manifest['needleEvidence']['identityConfirmed'] or manifest['needleEvidence']['automaticRename']:raise ValueError('Unsupported identity')
    expected=manifest['printEvidence']['rows'];units=inventory['units']
    if len(expected)!=18 or len(units)!=18 or len(rows)!=18:raise ValueError('Invalid inventory count')
    for result,actual,unit in zip(expected,rows,units):
        if result['unitId']!=unit['id'] or result['name']!=unit['name'] or result['printedPage']!=unit['printedPage']:raise ValueError('Inventory identity changed')
        if {k:result[k] for k in actual}!=actual:raise ValueError('Source table mismatch')
    return len(rows)
def main():
    from pypdf import PdfReader
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pdf',type=Path);a=p.parse_args()
    d=json.loads((ROOT/'catalog/fiendish-folio-version-evidence-2014.json').read_text(encoding='utf-8-sig'))
    if hashlib.sha256(a.pdf.read_bytes()).hexdigest()!=d['printEvidence']['sha256']:raise ValueError('PDF changed')
    for path,sha in d['inputSha256'].items():
        if hashlib.sha256((ROOT/path).read_bytes().replace(b'\r\n',b'\n')).hexdigest()!=sha:raise ValueError('Input changed')
    inv=json.loads((ROOT/'catalog/fiendish-folio-inventory-2014.json').read_text(encoding='utf-8-sig'))
    print(str(audit(d,parse_tables(PdfReader(a.pdf).pages[0].extract_text()),inv))+'/18 Contents and CR rows match; digital count remains independently scoped')
if __name__=='__main__':main()
