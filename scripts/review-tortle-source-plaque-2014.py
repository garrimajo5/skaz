"""Observe one secondary publication plaque without assigning a canonical source ID."""
import hashlib,json,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
URL='https://dnd.su/race/184-tortle/'
def review_plaque(raw,root,prior):
 tree=shared['Tree']();tree.feed(raw.decode('utf-8'));clean,only=shared['clean'],shared['only']
 meta=only(tree.root.find(lambda n:n.tag=='meta' and n.attrs.get('property')=='og:url'),'observation URL')
 if meta.attrs.get('content')!=URL:raise ValueError('Changed observation URL')
 body=only(tree.root.find(lambda n:n.has('card__body') and n.has('new-article')),'race article body')
 params=only((n for n in body.children if isinstance(n,shared['Node']) and n.tag=='ul' and n.has('params') and n.has('card__article-body') and any(clean(x)=='Источник:' for x in n.find(lambda x:x.tag=='strong'))),'race parameters')
 row=only(params.find(lambda n:n.tag=='li' and any(clean(x)=='Источник:' for x in n.find(lambda x:x.tag=='strong'))),'source plaque row')
 title=clean(only(row.find(lambda n:n.tag=='span'),'literal source title'))
 if title!='The Tortle Package':raise ValueError('Changed literal publication title')
 group=only((g for g in root['identityGroups'] if g['reviewId']=='name-review:b8549edf1349f76678ca'),'root tortle group')
 observed=only((m for m in group['members'] if m['id']=='dndsu:race:184'),'tortle observation')
 proposal=only((g for g in prior['groups'] if g['reviewId']==group['reviewId']),'prior tortle group')
 unit=only((u for u in proposal['units'] if u['observationId']==observed['id']),'prior tortle observation')
 if observed['sourceIds']!=[] or unit['sourceIds']!=[] or unit['missingReason']!='missing-source-attribution':raise ValueError('Changed prior attribution')
 return {'schemaVersion':1,'status':'secondary-literal-source-plaque-not-publication-acceptance','accepted':False,'complete':False,'approvedDenominator':None,'reviewId':group['reviewId'],'observationId':observed['id'],'observedSourceIds':[],'originalRouting':observed['routing'],'secondaryEvidence':{'url':URL,'htmlSha256':hashlib.sha256(raw).hexdigest(),'scope':'card__body.new-article > ul.params.card__article-body; source li/span','literalPublicationTitle':title,'primaryEvidence':False,'fullRulesRead':False},'proposedSourceId':None,'canonicalId':None,'automaticAttribution':False,'automaticCharacterMigration':False,'remaining':['Exact primary publication/version relation for this observation is unaccepted.','No numeric source ID is inferred from a secondary title or the other digital Tortle record.','Full rules, errata version, translation rights and canonical denominator remain unverified.']}
def build(path):
 paths=['catalog/effective-m0-review-2014.json','catalog/race-other-version-proposals-2014.json'];texts=[(ROOT/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in paths]
 r=review_plaque(path.read_bytes(),*[json.loads(s) for s in texts]);r['inputSha256']={p:hashlib.sha256(s.encode()).hexdigest() for p,s in zip(paths,texts)};return r
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--html',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 if a.html.resolve()==a.output.resolve():raise SystemExit('Cannot overwrite source HTML')
 a.output.write_text(json.dumps(build(a.html),ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
