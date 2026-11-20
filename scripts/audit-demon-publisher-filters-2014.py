"""Verify selected publisher book filters and digital-record reuse, not printed-rule identity."""
import argparse,hashlib,json,re,runpy
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1];h=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
FILES=['catalog/numeric-source-scope-policy-2014.json','catalog/demon-source-attribution-2014.json']
BOOKS={'oota':('9','129','filter-source-out-of-the-abyss','Out of the Abyss','Out of the Abyss'),'mtof':('33','113','filter-source-mordenkainens-tome-of-foes','Mordenkainen’s Tome of Foes',"Mordenkainen's Tome of Foes"),'motm':('85','158','filter-source-mordenkainen-presents-monsters-of-the-multiverse','Mordenkainen Presents: Monsters of the Multiverse','Mordenkainen Presents: Monsters of the Multiverse')}
NAMES=['Juiblex','Zuggtmoy']
def extract(raw,name,book):
 value,source_id,option_id,label,policy_title=BOOKS[book];t=h['Tree']();t.feed(raw.decode('utf-8'));root=t.root
 select=h['only'](root.find(lambda n:n.tag=='select' and n.attrs.get('id')=='filter-source' and n.attrs.get('name')=='filter-source'),'source selector')
 chosen=list(select.find(lambda n:n.tag=='option' and 'selected' in n.attrs))
 option=h['only'](chosen,'selected book option')
 if option.attrs.get('value')!=value or option.attrs.get('id')!=option_id or h['clean'](option)!=label:raise ValueError('Selected book filter not verified')
 listing=h['only'](root.find(lambda n:n.tag=='ul' and n.has('rpgmonster-listing')),'monster listing');rows=[]
 for node in listing.find(lambda n:n.has('monster-name')):
  links=list(node.find(lambda n:n.tag=='a' and re.fullmatch(r'/monsters/[0-9]+-[a-z0-9-]+',n.attrs.get('href',''))))
  if len(links)==1 and h['clean'](links[0])==name:
   rows.append({'name':name,'cardUrl':'https://www.dndbeyond.com'+links[0].attrs['href'],'displayedSource':h['clean'](h['only'](node.find(lambda n:n.has('source')),'displayed source'))})
 row=h['only'](rows,'exact-name filtered digital record')
 if not row['displayedSource']:raise ValueError('Missing displayed source')
 return {'publisherFilterValue':value,'referenceSourceId':source_id,'selectedPublisherLabel':label,'filterAppliedVerified':True,'record':row}
def audit(policy,prior,manifest,raws):
 expected={(name,key) for name in NAMES for key in BOOKS};bykey={(r['name'],r['bookKey']):r for r in manifest}
 if set(bykey)!=expected or len(manifest)!=6 or set(raws)!=expected:raise ValueError('Missing/duplicate six-filter scope')
 if prior['accepted'] is not False or prior['complete'] is not False or prior['approvedDenominator'] is not None:raise ValueError('Prior source witness promoted')
 captures=[]
 for name,book in sorted(expected):
  value,source_id,option_id,label,title=BOOKS[book];rule=h['only']((r for r in policy['records'] if r['sourceId']==source_id),'reference publication')
  if rule['observedTitle']!=title or rule['disposition']!='eligible-publication-records-need-review':raise ValueError('Changed reference source policy')
  r=bykey[name,book];raw=raws[name,book];url='https://www.dndbeyond.com/monsters?'+urlencode({'filter-search':name,'filter-source':value})
  if r['requestedUrl']!=url or r.get('resolvedUrl')!=url or r.get('status')!=200 or r['publisherFilterValue']!=value or hashlib.sha256(raw).hexdigest()!=r['sha256']:raise ValueError('Changed filter capture attribution')
  captures.append({'name':name,'bookKey':book,'requestedUrl':url,'resolvedUrl':url,'htmlSha256':r['sha256'],**extract(raw,name,book)})
 groups=[]
 for name in NAMES:
  rows={r['bookKey']:r for r in captures if r['name']==name};old=h['only']((g for g in prior['groups'] if g['name']==name),'prior demon group');candidates={r['sourceIdOfPrimaryListing']:r for r in old['rows']}
  if set(candidates)!={'129','158'} or len(old['rows'])!=2:raise ValueError('Changed digital candidate scope')
  for key,source in [('oota','129'),('motm','158')]:
   current,earlier=rows[key]['record'],candidates[source]
   if current['cardUrl']!=earlier['cardUrl'] or current['displayedSource']!=earlier['displayedSource']:raise ValueError('Changed prior digital candidate; review separately')
  legacy,mtf,motm=[rows[k]['record']['cardUrl'] for k in ['oota','mtof','motm']]
  groups.append({'name':name,'legacyOotaDigitalRecord':legacy,'mtofFilteredDigitalRecord':mtf,'motmFilteredDigitalRecord':motm,'sameDigitalRecordObservedUnderOotaAndMtof':legacy==mtf,'motmDigitalRecordDistinctFromBoth':motm not in [legacy,mtf],'filteredRecordOccurrences':3,'uniqueDigitalRecordsInSelectedFilters':len({legacy,mtf,motm}),'originalPrintedRulesCompared':False,'fullPrimaryStatBlocksRead':False,'originalPrintingEquivalenceAccepted':False,'modernSecondaryOotaPlaqueValidated':False,'automaticSourceRemoval':False,'automaticMerge':False,'canonicalUnitCountApproved':None})
 return {'schemaVersion':1,'checkedOn':'2026-11-21','status':'publisher-filter-membership-and-record-reuse-not-printed-rule-equivalence','accepted':False,'complete':False,'approvedDenominator':None,'summary':{'names':2,'verifiedFilterCaptures':6,'verifiedBookFilterValues':3,'filteredRecordOccurrences':6,'uniqueDigitalRecordsInSelectedFilters':len({r['record']['cardUrl'] for r in captures}),'groupsWithSharedLegacyDigitalRecord':sum(g['sameDigitalRecordObservedUnderOotaAndMtof'] for g in groups),'groupsWithDistinctMotmDigitalRecord':sum(g['motmDigitalRecordDistinctFromBoth'] for g in groups),'acceptedCanonicalUnits':0},'captures':captures,'groups':groups,'referenceSourceIdsChanged':False,'runtimeChanged':False,'limitations':['Publisher filter values9/33/85 and reference source IDs129/113/158 belong to different namespaces and are never substituted.','An exact row under a verified book filter demonstrates current publisher-index membership, not equality of original printed text, errata or licensed wording.','The MToF-filtered row may display Out of the Abyss; the displayed label is preserved rather than overwritten with the selected filter label.','Reuse of one digital record across two selected legacy book filters does not approve canonical merging or removing secondary source plaques.','A separate MotM digital record does not prove that an observed OotA plaque on a secondary MotM card is wrong or that all publications were exhaustively queried.','No primary rule body, translation right, character migration, runtime change or catalog denominator is accepted.']}
def build(directory):
 texts=[(ROOT/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in FILES];manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
 for r in manifest:
  if r.get('name') not in NAMES or r.get('bookKey') not in BOOKS or r.get('file')!=r['name'].lower()+'-'+r['bookKey']+'.html':raise ValueError('Invalid capture filename or selection')
 result=audit(*map(json.loads,texts),manifest,{(r['name'],r['bookKey']):(directory/r['file']).read_bytes() for r in manifest});result['inputSha256']={p:hashlib.sha256(t.encode()).hexdigest() for p,t in zip(FILES,texts)};return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 if a.output.resolve() in {p.resolve() for p in a.directory.iterdir()}:raise SystemExit('Cannot overwrite capture')
 r=build(a.directory);a.output.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(r['summary']))
