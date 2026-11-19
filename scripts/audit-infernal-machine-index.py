"""Verify all three captured public IMR index pages without accepting book completeness."""
import argparse,json,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
parse=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))['parse_page']
def audit_pages(manifest,html_pages):
    if not manifest['publicIndexTraversalComplete'] or manifest['historicalBookInventoryComplete'] or manifest['fullStatBlocksRead'] or manifest['accepted'] or manifest['complete'] or manifest['approvedDenominator'] is not None:raise ValueError('Invalid evidence boundary')
    if len(html_pages)!=3 or manifest['publicIndexPagesCaptured']!=3 or len(manifest['pages'])!=3:raise ValueError('Incomplete page set')
    seen=set();total=0;counts={}
    for i,(html,expected) in enumerate(zip(html_pages,manifest['pages']),1):
        parsed=parse(html,manifest['filterValue'],manifest['filterOptionId'])
        if expected['page']!=i or parsed['nextPage']!=(i+1 if i<3 else None) or parsed['nextPage']!=expected['nextPage']:raise ValueError('Pagination mismatch')
        if parsed['rows']!=expected['rows']:raise ValueError('Public metadata changed')
        for row in parsed['rows']:
            if row['cardUrl'] in seen:raise ValueError('Repeated card across pages')
            seen.add(row['cardUrl']);total+=1;counts[row['displayedSource']]=counts.get(row['displayedSource'],0)+1
    if total!=manifest['summary']['digitalRows'] or counts!=manifest['summary']['displayedSourceCounts']:raise ValueError('Summary mismatch')
    return total
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pages',type=Path,nargs=3);a=p.parse_args()
    d=json.loads((ROOT/'catalog/infernal-machine-public-index-2014.json').read_text(encoding='utf-8-sig'))
    print(str(audit_pages(d,[p.read_text(encoding='utf-8-sig') for p in a.pages]))+'/56 public index rows match across3 pages; not a historical book or runtime denominator')
