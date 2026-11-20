"""Read-only selected EEPC/PotA source witnesses; no downloads or rule acceptance."""
import argparse
import hashlib
import json
import runpy
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--original',type=Path,required=True)
    p.add_argument('--alternate',type=Path,required=True)
    p.add_argument('--errata',type=Path,required=True)
    p.add_argument('--output',type=Path)
    a=p.parse_args()
    root=Path(__file__).resolve().parents[1]
    contract=json.loads((root/'catalog/ee-selected-spell-source-comparison-2014.json').read_text(encoding='utf-8'))
    paths={'ee2015':a.original,'ee2016':a.alternate,'potaErrata':a.errata}
    blobs={k:v.read_bytes() for k,v in paths.items()}
    for source in contract['sources']:
        if hashlib.sha256(blobs[source['id']]).hexdigest()!=source['sha256']:
            raise SystemExit('Source hash differs: '+source['id'])
    from pypdf import PdfReader
    readers={k:PdfReader(v) for k,v in paths.items()}
    pages={k:['']*len(v.pages) for k,v in readers.items()}
    for unit in contract['units']:
        k,i=unit['source'],unit['pdfPage']-1
        if not pages[k][i]:pages[k][i]=readers[k].pages[i].extract_text()
    shared=runpy.run_path(str(root/'scripts/audit-selected-rule-witnesses.py'))
    result=shared['audit'](contract,blobs,pages)
    text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if a.output:shared['write_new_report'](a.output,text)
    else:print(text,end='')


if __name__=='__main__':main()
