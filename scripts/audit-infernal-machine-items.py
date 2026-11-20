"""Public item metadata and pagination only; a source filter is not a publication inventory."""
import argparse,json,runpy,re
from pathlib import Path
from urllib.parse import urlparse,parse_qs
ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
Tree,only,clean=shared['Tree'],shared['only'],shared['clean']
def parse_page(markup):
    t=Tree();t.feed(markup)
    option=only(t.root.find(lambda n:n.tag=='option' and n.attrs.get('id')=='filter-source-infernal-machine-rebuild'),'source option')
    if option.attrs.get('value')!='56' or 'selected' not in option.attrs:raise ValueError('Wrong source filter')
    listing=only(t.root.find(lambda n:n.tag=='ul' and n.has('rpgmagic-item-listing')),'item listing')
    next_pages=set()
    for a in t.root.find(lambda n:n.tag=='a' and (n.attrs.get('rel')=='next' or clean(n).lower()=='next')):
        u=urlparse(a.attrs.get('href',''));q=parse_qs(u.query)
        if u.scheme or u.netloc or u.path!='/magic-items' or q.get('filter-source')!=['56'] or len(q.get('page',[]))!=1 or not q['page'][0].isdigit():raise ValueError('Unexpected next URL')
        next_pages.add(int(q['page'][0]))
    if len(next_pages)>1:raise ValueError('Conflicting next pages')
    rows=[]
    for item in listing.find(lambda n:n.has('info') and n.attrs.get('data-type')=='magic-items'):
        name=only(item.find(lambda n:n.has('item-name')),'name')
        link=only(name.find(lambda n:n.tag=='a' and n.attrs.get('href','').startswith('/magic-items/')),'item URL')
        path=link.attrs['href']
        if not re.fullmatch(r'/magic-items/\d+-[a-z0-9-]+',path):raise ValueError('Invalid item URL')
        rows.append({'digitalName':clean(link),'cardUrl':'https://www.dndbeyond.com'+path,'rarityLabel':clean(only(name.find(lambda n:n.has('rarity')),'rarity')),'typeLabel':clean(only(item.find(lambda n:n.has('item-type')),'type')),'attunementLabel':clean(only(item.find(lambda n:n.has('requires-attunement')),'attunement')),'notesLabel':clean(only(item.find(lambda n:n.has('notes')),'notes'))})
    if not rows or len(rows)>20 or len({r['cardUrl'] for r in rows})!=len(rows) or any(not r['digitalName'] or not r['rarityLabel'] or not r['typeLabel'] or not r['attunementLabel'] for r in rows):raise ValueError('Invalid row set')
    return {'rows':rows,'nextPage':next(iter(next_pages),None)}
def audit(d,pages):
    if d['accepted'] or d['complete'] or d['approvedDenominator'] is not None or d['fullRulesVerified']:raise ValueError('Premature acceptance')
    if len(pages)!=2 or len(d['pages'])!=2:raise ValueError('Missing page')
    seen=set()
    for i,(markup,expected) in enumerate(zip(pages,d['pages']),1):
        actual=parse_page(markup)
        if expected['page']!=i or expected['nextPage']!=(2 if i==1 else None) or actual!={k:expected[k] for k in ['rows','nextPage']}:raise ValueError('Page mismatch')
        for row in actual['rows']:
            if row['cardUrl'] in seen:raise ValueError('Duplicate item across pages')
            seen.add(row['cardUrl'])
    if len(seen)!=d['digitalRowCount']:raise ValueError('Count mismatch')
    return len(seen)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('pages',type=Path,nargs=2);a=p.parse_args()
    d=json.loads((ROOT/'catalog/infernal-machine-item-index-2014.json').read_text(encoding='utf-8-sig'))
    print(str(audit(d,[p.read_text(encoding='utf-8-sig') for p in a.pages]))+'/25 public item rows match; displayed labels do not establish full rules or publication denominator')
