"""Audit version identity witnesses without treating shared source tags as equality."""
import argparse,hashlib,json,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
s=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
Tree,only,clean=s['Tree'],s['only'],s['clean']
def primary_rows(markup,name):
 t=Tree();t.feed(markup);listing=only(t.root.find(lambda n:n.tag=='ul' and n.has('rpgmonster-listing')),'listing');rows=[]
 for n in listing.find(lambda n:n.has('info') and n.attrs.get('data-type')=='monsters'):
  named=only(n.find(lambda n:n.has('monster-name')),'name')
  a=only(named.find(lambda n:n.tag=='a' and n.attrs.get('href','').startswith('/monsters/')),'card link')
  if clean(a)!=name:continue
  rows.append({'digitalName':clean(a),'cardUrl':'https://www.dndbeyond.com'+a.attrs['href'],'displayedSource':clean(only(named.find(lambda n:n.has('source')),'source')),'legacyBadge':any(n.attrs.get('aria-label')=='legacy' for n in named.find(lambda n:n.has('badge-label')))})
 if len(rows)!=2 or len({r['cardUrl'] for r in rows})!=2:raise ValueError('Expected two distinct exact-name version rows')
 return sorted(rows,key=lambda r:r['cardUrl'])
def audit(manifest,scope,html):
 if manifest['accepted'] is not False or manifest['complete'] is not False or manifest['automaticMerge'] is not False or manifest['approvedDenominator'] is not None:raise ValueError('Evidence promoted')
 if len(manifest['groups'])!=2 or {g['name'] for g in manifest['groups']}!={'Juiblex','Zuggtmoy'}:raise ValueError('Group changed')
 pages={p['id']:p for p in scope['records']};seen=set()
 for g in manifest['groups']:
  keys=['digitalName','cardUrl','displayedSource','legacyBadge']
  expected=sorted([{k:r[k] for k in keys} for r in g['rows']],key=lambda r:r['cardUrl'])
  if primary_rows(html[g['indexCapture']],g['name'])!=expected:raise ValueError('Primary listing differs')
  if {r['sourceIdOfPrimaryListing'] for r in g['rows']}!={'129','158'}:raise ValueError('Version source lost')
  for r in g['rows']:
   legacy=r['sourceIdOfPrimaryListing']=='129'
   title='Out of the Abyss' if legacy else 'Mordenkainen Presents: Monsters of the Multiverse'
   if r['legacyBadge'] is not legacy or r['displayedSource']!=title or r['observedSourceIds']!=(['113','129'] if legacy else ['158','129']):raise ValueError('Version family/source mapping differs')
   ident=r['candidateObservationId'];p=pages.get(ident)
   if not p or ident in seen or p['names']['en']!=g['name'] or p['sourceIds']!=r['observedSourceIds'] or p['url']!=r['originalUrl']:raise ValueError('Observation attribution changed')
   seen.add(ident)
   if r['canonicalId'] is not None or r['identityAccepted'] is not False or r['fullPrimaryStatBlockRead'] is not False:raise ValueError('Unsupported primary acceptance')
   t=Tree();t.feed(html[ident.split(':')[-1]])
   card=only(t.root.find(lambda n:n.has('card') and n.attrs.get('data-id')==ident[6:]),'exact secondary card')
   if card.attrs.get('data-cardlink')!=r['readUrl'].replace('https://dnd.su',''):raise ValueError('Wrong secondary path')
   heading=only(card.find(lambda n:n.tag=='h2' and n.has('card-title')),'heading')
   if '['+g['name']+']' not in clean(heading):raise ValueError('Wrong secondary name')
   plaques=[n.attrs.get('title') for n in heading.find(lambda n:n.has('source-plaque'))]
   if plaques!=r['observedSourcePlaques']:raise ValueError('Secondary sources differ')
 return {'groups':2,'primaryVersionRows':4,'secondaryObservations':len(seen),'canonicalAccepted':0}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',type=Path);a=p.parse_args()
 m=json.loads((ROOT/'catalog/demon-source-attribution-2014.json').read_text(encoding='utf-8-sig'))
 expected={'juiblex-index','zuggtmoy-index','1752','4910','6594','6595'}
 if len(m['captures'])!=6 or {r['key'] for r in m['captures']}!=expected:raise ValueError('Incomplete capture set')
 html={}
 for r in m['captures']:
  b=(a.directory/(r['key']+'.html')).read_bytes()
  if hashlib.sha256(b).hexdigest()!=r['sha256']:raise ValueError('Capture changed')
  html[r['key']]=b.decode('utf-8')
 scope=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8-sig'))
 print(json.dumps(audit(m,scope,html)))
