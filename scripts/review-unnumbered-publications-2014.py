"""Correlate explicit non-numeric bibliographic references; never invent numeric IDs."""
import argparse,hashlib,json,runpy
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
index_parser=runpy.run_path(str(ROOT/'scripts/extract-race-index-evidence.py'))
FILES=['catalog/scope-register-2014.json','catalog/source-bibliography-evidence.json','catalog/race-other-version-proposals-2014.json','catalog/tortle-source-plaque-2014.json']
EXPECTED={'dndsu:race:169':('bibliography:one-grung-above','Grung','One Grung Above','302384-grung'),'dndsu:race:178':('bibliography:locathah-rising','Locathah','Locathah Rising','229754-locathah'),'dndsu:race:184':('bibliography:the-tortle-package','Tortle','The Tortle Package','41-tortle')}
def review(scope,bibliography,prior,plaque,raw):
 records=scope['records'];ids=[x['id'] for x in records]
 if len(set(ids))!=len(ids):raise ValueError('Duplicate reference ID')
 unnumbered=[r for r in records if not r['sourceIds']]
 linked=[r for r in unnumbered if r.get('bibliographyEvidenceId')]
 if {r['id'] for r in linked}!=set(EXPECTED):raise ValueError('Changed explicit bibliography selection')
 bibliography_by_id={r['id']:r for r in bibliography['records']}
 if len(bibliography_by_id)!=len(bibliography['records']):raise ValueError('Duplicate bibliography ID')
 primary=index_parser['extract'](raw.decode('utf-8'),['grung','locathah','tortle']);relations=[]
 for observed in linked:
  bid,name,title,slug=EXPECTED[observed['id']];book=bibliography_by_id.get(bid)
  if not book or observed['section']!='race' or observed['names']['en']!=name or observed['sourceTitle']!=title or observed['bibliographyEvidenceId']!=bid or observed['inclusion']!='needs-source-review':raise ValueError('Changed explicit reference attribution')
  if book['title']!=title or book['publisher']!='Wizards of the Coast' or book['numericDndsuSourceId'] is not None or book['reusePermission']!='not-established':raise ValueError('Changed bibliography basis')
  exact=[r for r in primary if r['name']==name and r['publication']==title and r['url']=='https://www.dndbeyond.com/species/'+slug]
  if len(exact)!=1:raise ValueError('Missing or ambiguous exact publisher identity')
  relations.append({'observationId':observed['id'],'referenceUrl':observed['url'],'observedSourceIds':list(observed['sourceIds']),'observedSourceTitle':title,'originalInclusion':observed['inclusion'],'bibliographyEvidenceId':bid,'proposedSourceReference':{'kind':'bibliography','id':bid},'publisherIdentity':exact[0],'basis':'explicit-reference-bibliography-id-and-title-plus-exact-publisher-listing','fullTextEquivalence':'unverified','exactErrataVersion':'unverified','textReusePermission':'not-established','translationReusePermission':'not-established','scopeDecision':book['scopeDecision'],'accepted':False,'canonicalId':None,'numericSourceId':None,'automaticAttribution':False,'automaticCharacterMigration':False})
 tortle=next(x for x in relations if x['observationId']=='dndsu:race:184')
 if plaque['observationId']!=tortle['observationId'] or plaque['observedSourceIds']!=[] or plaque['secondaryEvidence']['url']!=tortle['referenceUrl'] or plaque['secondaryEvidence']['literalPublicationTitle']!=tortle['observedSourceTitle'] or plaque['accepted'] is not False:raise ValueError('Changed literal Tortle plaque basis')
 old=next(g for g in prior['groups'] if g['name']=='tortle');old_unit=next(u for u in old['units'] if u['observationId']=='dndsu:race:184')
 if old_unit['sourceIds']!=[] or old_unit['missingReason']!='missing-source-attribution':raise ValueError('Changed historical numeric-only proposal')
 if len(unnumbered)!=75 or Counter(r['inclusion'] for r in unnumbered)!=Counter({'excluded-homebrew':72,'needs-source-review':3}):raise ValueError('Changed non-numeric scope boundary')
 return {'schemaVersion':1,'status':'explicit-unnumbered-publication-relations-not-canonical-acceptance','accepted':False,'complete':False,'approvedDenominator':None,'summary':{'unnumberedObservations':75,'preservedExcludedObservations':72,'explicitBibliographicRelations':3,'publisherIdentityRecords':len(primary),'acceptedCanonicalUnits':0,'inventedNumericSourceIds':0},'primaryIndex':{'url':'https://www.dndbeyond.com/species','htmlSha256':hashlib.sha256(raw).hexdigest(),'records':primary,'fullRulesAccepted':False},'relations':relations,'historicalDiagnostic':{'observationId':'dndsu:race:184','priorNumericOnlyMissingReason':old_unit['missingReason'],'explicitBibliographyWasAlreadyPresent':True,'priorReportChanged':False},'limitations':['Exact explicit bibliographic references are distinguished from numeric source IDs; no numeric IDs or canonical units are invented.','A publisher index corroborates name/publication identity, not the full text or exact errata of the secondary observation.','72 excluded observations stay excluded and are not mapped by fuzzy name or title.','The old numeric-only report and root source arrays are preserved; this separate layer does not approve scope, reuse, translation or migration.']}
def build(html):
 texts=[(ROOT/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in FILES];result=review(*[json.loads(s) for s in texts],html.read_bytes());result['inputSha256']={p:hashlib.sha256(s.encode()).hexdigest() for p,s in zip(FILES,texts)};return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--html',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 if a.output.resolve()==a.html.resolve():raise SystemExit('Cannot overwrite source HTML')
 result=build(a.html);a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result['summary']))
