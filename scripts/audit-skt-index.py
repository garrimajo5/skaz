"""Verify six public SKT index pages; preserve absent CR without inventing CR0."""
import argparse,json,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
parse=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))['parse_page']

def audit_pages(manifest,pages):
    if manifest['accepted'] or manifest['complete'] or manifest['historicalBookInventoryComplete'] or manifest['fullStatBlocksRead'] or manifest['approvedDenominator'] is not None:
        raise ValueError('Invalid evidence boundary')
    if not manifest['publicIndexTraversalComplete'] or not manifest['allowBlankChallengeRatings'] or manifest['blankChallengeRatingMeaning']!='not shown in public index; never infer zero':
        raise ValueError('Missing traversal or absent-CR scope')
    if len(pages)!=6 or len(manifest['pages'])!=6 or manifest['publicIndexPagesCaptured']!=6:
        raise ValueError('Incomplete page set')
    seen=set();counts={};blank=0
    for number,(html,expected) in enumerate(zip(pages,manifest['pages']),1):
        parsed=parse(html,'12','filter-source-storm-kings-thunder',allow_blank_cr=True)
        if expected['page']!=number or parsed['nextPage']!=(number+1 if number<6 else None) or parsed['nextPage']!=expected['nextPage']:
            raise ValueError('Broken pagination chain')
        if parsed['rows']!=expected['rows']:raise ValueError('Public metadata changed')
        for row in parsed['rows']:
            if row['cardUrl'] in seen:raise ValueError('Repeated card across pages')
            seen.add(row['cardUrl']);counts[row['displayedSource']]=counts.get(row['displayedSource'],0)+1
            blank+=row['challengeRating']==''
    if len(seen)!=manifest['summary']['digitalRows'] or blank!=manifest['summary']['blankChallengeRatingRows'] or counts!=manifest['summary']['displayedSourceCounts']:
        raise ValueError('Summary mismatch')
    return len(seen),blank

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pages',type=Path,nargs=6);a=p.parse_args()
    d=json.loads((ROOT/'catalog/skt-public-index-2014.json').read_text(encoding='utf-8-sig'))
    total,blank=audit_pages(d,[path.read_text(encoding='utf-8-sig') for path in a.pages])
    print(f'{total}/105 public index cards match; {blank} absent CR labels remain absent, not zero')
