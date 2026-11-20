"""Verify exact name witnesses while keeping unresolved diagnostics and versions separate."""
import argparse,hashlib,json,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
s=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
Tree,only,clean=s['Tree'],s['only'],s['clean']
EXPECTED={'13077':('Cranium Rat Squeaker Swarm','supported-heading-proposal'),'568':('Nilbog','primary-name-supported-secondary-card-missing'),'6883':('Nilbog','supported-heading-proposal'),'6459':('Prehistoric Figurines of Wondrous Power','supported-heading-proposal'),'20456':(None,'needs-primary-name-and-publication')}
def tree(text):
 t=Tree();t.feed(text);return t.root
def audit(m,scope,diagnostics,html):
 if m['accepted'] is not False or m['complete'] is not False or m['approvedDenominator'] is not None:raise ValueError('Evidence promoted')
 pages={p['id']:p for p in scope['records']};ds={d['id']:d for d in diagnostics['scriptDiagnostics']}
 if len(m['records'])!=5 or {r['observationId'] for r in m['records']}!=set(ds):raise ValueError('Diagnostics lost or duplicated')
 supported=0
 for r in m['records']:
  ident=r['observationId'];key=ident.split(':')[-1];p=pages[ident]
  if (r['proposedEnglishName'],r['status'])!=EXPECTED[key]:raise ValueError('Unsupported name/status')
  if r['originalEnglishName']!=p['names']['en'] or r['originalEnglishName']!=ds[ident]['observedName'] or r['sourceIds']!=p['sourceIds'] or r['originalUrl']!=p['url']:raise ValueError('Original observation changed')
  if r['applied'] is not False or r['canonicalId'] is not None or r['identityAccepted'] is not False:raise ValueError('Name promoted to identity')
  secondary=tree(html[r['secondaryCapture']]);cards=list(secondary.find(lambda n:n.has('card') and n.attrs.get('data-id')==ident[6:]))
  if key=='568':
   if cards:raise ValueError('Missing-card limitation is stale')
   only(secondary.find(lambda n:n.has('card') and n.attrs.get('data-id')=='bestiary:6883'),'replacement card')
  else:
   card=only(cards,'exact secondary card');heading=clean(only(card.find(lambda n:n.tag=='h2' and n.has('card-title')),'heading'))
   expected=r['originalEnglishName'] if key in ['13077','20456'] else r['proposedEnglishName']
   if '['+expected+']' not in heading:raise ValueError('Secondary heading differs')
  if r['primaryCapture'] is None:
   if key!='20456' or r['primaryCardUrl'] is not None or r['primarySource'] is not None:raise ValueError('Fabricated primary witness')
   continue
  primary=tree(html[r['primaryCapture']])
  if key=='6459':
   only(primary.find(lambda n:n.tag=='h2' and clean(n)==r['proposedEnglishName']),'family heading')
  else:
   candidates=[]
   for n in primary.find(lambda n:n.has('monster-name')):
    links=list(n.find(lambda n:n.tag=='a' and n.attrs.get('href','').startswith('/monsters/')))
    if len(links)==1 and 'https://www.dndbeyond.com'+links[0].attrs['href']==r['primaryCardUrl']:candidates.append((n,links[0]))
   if len(candidates)!=1:raise ValueError('Exact primary card missing')
   n,a=candidates[0]
   if clean(a)!=r['proposedEnglishName'] or clean(only(n.find(lambda n:n.has('source')),'source'))!=r['primarySource']:raise ValueError('Primary name/version mismatch')
  supported+=1
 unit=m['figurineUnitProposal']
 if unit['accepted'] is not False or unit['canonicalIdsAssigned']!=0 or unit['fullRulesVerified'] is not False or unit['observationId']!='dndsu:items:6459':raise ValueError('Variant proposal promoted')
 expected=[('Carnelian Triceratops','Very Rare'),('Jasper Tyrannosaurus Rex','Legendary'),('Kyanite Pteranodon','Rare'),('Pyrite Plesiosaurus','Uncommon')]
 if [(r['name'],r['rarity']) for r in unit['variants']]!=expected:raise ValueError('Variant inventory changed')
 article=tree(html[unit['primaryCapture']])
 for name,rarity in expected:only(article.find(lambda n:n.tag=='li' and clean(n)==name+' ('+rarity+')'),'variant')
 return dict(diagnostics=5,primaryNames=supported,exactSecondaryHeadings=4,primarySupportedWithExactSecondaryHeading=3,pendingPrimaryNames=1,missingLegacySecondaryCards=1,proposedFigurineVariants=4,canonicalAccepted=0)
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path);a=p.parse_args()
 m=json.loads((ROOT/'catalog/mixed-script-name-evidence-2014.json').read_text(encoding='utf-8-sig'));raw=(ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8')
 if hashlib.sha256(raw.encode()).hexdigest()!=m['scopeSha256']:raise ValueError('Stale scope')
 html={}
 if len(m['captures'])!=8 or len({c['key'] for c in m['captures']})!=8:raise ValueError('Capture set changed')
 for c in m['captures']:
  data=(a.directory/(c['key']+'.html')).read_bytes()
  if hashlib.sha256(data).hexdigest()!=c['sha256']:raise ValueError('Capture hash mismatch')
  html[c['key']]=data.decode('utf-8')
 print(json.dumps(audit(m,json.loads(raw),json.loads((ROOT/'catalog/observed-name-review-2014.json').read_text(encoding='utf-8')),html)))
