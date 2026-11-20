"""Publication witnesses for multi-book observations; metadata only, no stat blocks."""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path
from urllib.parse import urljoin,urlparse
shared=runpy.run_path(str(Path(__file__).with_name('extract-monster-version-evidence.py')))
listing=runpy.run_path(str(Path(__file__).with_name('audit-fiendish-folio-index.py')))
BOOKS={**shared['BOOKS'],'oota':('129','Out of the Abyss'),'cm':('122','Candlekeep Mysteries'),'tftyp':('133','Tales from the Yawning Portal')}
ALTERNATES={"fraz-urb'luu":'fraz-urb\u2019luu',"graz'zt":'graz\u2019zt'}
FRAGMENTS={'meenlock':'Meenlock','baphomet':'Baphomet','demogorgon':'Demogorgon',"fraz-urb'luu":'FrazUrbluu','yeenoghu':'Yeenoghu','derro savant':'DerroSavant','deathlock wight':'DeathlockWight','duergar kavalrachni':'DuergarKavalrachni','derro':'Derro','female steeder':'FemaleSteeder','choker':'Choker','male steeder':'MaleSteeder',"graz'zt":'Grazzt'}

def selected_groups(review):
    return [g for g in review['identityGroups'] if g['section']=='bestiary' and g['decision']=='define-separate-source-version-units' and len(g['members'])>2 and all(len(m['sourceIds'])==1 for m in g['members'])]

def chapter(book,url):
    p=urlparse(url)
    if p.scheme!='https' or p.netloc!='www.dndbeyond.com' or p.query or not p.fragment:return False
    if book in shared['BOOKS']:
        prefix=r'/(?:sources/(?:dnd/)?|compendium/rules/)'+book+'/'
        return bool(re.fullmatch(prefix+r'(?:bestiary(?:-[a-z]+)?|appendix-a-assorted-beasts|appendix-b-nonplayer-characters)/?',p.path))
    paths={'oota':r'/(?:sources/(?:dnd/)?|compendium/adventures/)oota/(?:appendix-c-creatures|appendix-d-demon-lords)/?',
        'cm':r'/sources/(?:dnd/)?cm/a-deep-and-creeping-darkness/?',
        'tftyp':r'/sources/(?:dnd/)?tftyp/appendix-b-creatures/?'}
    return bool(re.fullmatch(paths[book],p.path))

def extract_book(raw,book,names):
    source_id,title=BOOKS[book];p=shared['shared'].Toc();p.feed(raw.decode('utf-8'));p.close()
    if title not in p.headings:raise ValueError('Missing exact publication heading')
    records=[];missing=[];alternates=[];anomalies=[]
    for name in names:
        exact=[]
        for href,label in p.links:
            if label.lower()!=name:continue
            url=urljoin('https://www.dndbeyond.com',href)
            if not chapter(book,url):raise ValueError('Selected heading outside specific creature chapter')
            exact.append({'name':name,'heading':label,'targetUrl':url})
        if len(exact)==1:
            row=exact[0];fragment=urlparse(row['targetUrl']).fragment
            if fragment==FRAGMENTS[name]:records.append(row);continue
            anomalies.append({**row,'observedFragment':fragment,'expectedFragment':FRAGMENTS[name],
                'reason':'publisher-label-fragment-mismatch'})
            missing.append({'name':name,'reason':'label-fragment-mismatch'})
        else:missing.append({'name':name,'reason':'missing-index-heading' if not exact else 'ambiguous-index-heading'})
        if exact or name not in ALTERNATES:continue
        possible=[]
        for href,label in p.links:
            if label.lower()!=ALTERNATES[name]:continue
            url=urljoin('https://www.dndbeyond.com',href)
            if not chapter(book,url) or urlparse(url).fragment!=FRAGMENTS[name]:raise ValueError('Alternative spelling outside its specific chapter or fragment')
            possible.append({'observedKey':name,'publishedKey':ALTERNATES[name],'heading':label,'targetUrl':url,'acceptedAlias':False})
        if len(possible)>1:raise ValueError('Ambiguous explicit spelling alternative')
        alternates.extend(possible)
    return {'sourceId':source_id,'book':book,'title':title,'url':'https://www.dndbeyond.com/sources/dnd/'+book,
        'htmlSha256':hashlib.sha256(raw).hexdigest(),'selectedNames':names,'records':records,'missing':missing,'alternateSpellings':alternates,'linkAnomalies':anomalies}

def extract_demogorgon(raw):
    Tree,only,clean=listing['Tree'],listing['only'],listing['clean']
    tree=Tree();tree.feed(raw.decode('utf-8'))
    if len(list(tree.root.find(lambda n:n.tag=='h1' and clean(n)=='Monsters')))!=1:raise ValueError('Missing publisher listing title')
    container=only(tree.root.find(lambda n:n.tag=='ul' and n.has('rpgmonster-listing')),'publisher monster listing')
    expected={('Demogorgon','Mordenkainen Presents: Monsters of the Multiverse'):'158',('Demogorgon','Out of the Abyss'):'129',('Demogorgon (Monstrosity)','Hunt for the Thessalhydra'):'123'}
    rows=[]
    for n in container.find(lambda n:n.has('info') and n.attrs.get('data-type')=='monsters'):
        named=only(n.find(lambda n:n.has('monster-name')),'name')
        a=only(named.find(lambda n:n.tag=='a' and n.attrs.get('href','').startswith('/monsters/')),'identity link')
        name=clean(a);source=clean(only(named.find(lambda n:n.has('source')),'publication'));key=(name,source)
        if key not in expected:continue
        href=a.attrs['href']
        if not re.fullmatch(r'/monsters/[0-9]+-[a-z0-9-]+',href):raise ValueError('Invalid primary identity URL')
        rows.append({'sourceId':expected[key],'digitalName':name,'displayedSource':source,'cardUrl':'https://www.dndbeyond.com'+href,
            'type':clean(only(n.find(lambda n:n.has('monster-type')),'type')),
            'size':clean(only(n.find(lambda n:n.has('monster-size')),'size')),
            'challenge':clean(only(n.find(lambda n:n.has('monster-challenge')),'challenge'))})
    if len(rows)!=3 or len({r['sourceId'] for r in rows})!=3 or len({r['cardUrl'] for r in rows})!=3:raise ValueError('Ambiguous or missing Demogorgon publication identity')
    return {'url':'https://www.dndbeyond.com/monsters?filter-search=Demogorgon','htmlSha256':hashlib.sha256(raw).hexdigest(),
        'records':sorted(rows,key=lambda r:r['sourceId']),
        'method':'Only three exact name/publication pairs; quoted Giant, Spawn, Echo and other names are not aliases.'}

def build(review,raws):
    groups=selected_groups(review)
    if len(groups)!=13 or sum(len(g['members']) for g in groups)!=40:raise ValueError('Multi-book scope changed')
    selected={book:sorted({g['comparisonKey'] for g in groups if any(m['sourceIds']==[source_id] for m in g['members'])}) for book,(source_id,_) in BOOKS.items()}
    return {'schemaVersion':1,'status':'multibook-bestiary-publication-metadata-not-full-rules','checkedOn':'2026-11-20',
        'selectedNames':sorted(g['comparisonKey'] for g in groups),
        'sources':[extract_book(raws[book],book,selected[book]) for book in BOOKS],
        'demogorgonDisambiguation':extract_demogorgon(raws['demogorgon-index']),
        'limitations':['Exact TOC headings prove publication presence only; absence is unresolved evidence, not proof of absent content.',
            'Literal punctuation alternatives remain unapproved and never fill an exact-heading gap.',
            'The source123 Monstrosity has a separate publisher label and is not automatically another demon-prince version.',
            'No stat blocks, translation, exact errata, accepted denominator or character migration is established.']}

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--directory',required=True);p.add_argument('--output',required=True);a=p.parse_args()
    root=Path(__file__).resolve().parents[1];review=json.loads((root/'catalog/effective-m0-review-2014.json').read_text(encoding='utf-8'))
    result=build(review,{book:Path(a.directory,book+'.html').read_bytes() for book in [*BOOKS,'demogorgon-index']})
    Path(a.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'exactHeadings':sum(len(s['records']) for s in result['sources']),'unresolvedHeadings':sum(len(s['missing']) for s in result['sources']),'unapprovedSpellingWitnesses':sum(len(s['alternateSpellings']) for s in result['sources']),'typedListingRows':len(result['demogorgonDisambiguation']['records']),'labelFragmentAnomalies':sum(len(s['linkAnomalies']) for s in result['sources'])}))
