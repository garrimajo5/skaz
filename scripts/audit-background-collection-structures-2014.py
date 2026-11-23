"""Reproduce five secondary collection-page structures, without copying rule bodies."""
import argparse,hashlib,json,re,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];h=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
FILES=['catalog/scope-register-2014.json','catalog/background-adaptation-page-review-2014.json','catalog/background-collection-structure-selection-2014.json']
IDS={'dndsu:backgrounds:845','dndsu:backgrounds:846','dndsu:backgrounds:847','dndsu:backgrounds:848','dndsu:backgrounds:856'}
def headings(node):
 for child in node.children:
  if not isinstance(child,h['Node']):continue
  if child.tag in ['script','style'] or child.attrs.get('id')=='comments' or child.has('comments'):continue
  if child.tag in ['h2','h3','h4']:yield {'level':child.tag,'text':h['clean'](child)}
  else:yield from headings(child)
def extract(raw,ident,url):
 t=h['Tree']();t.feed(raw.decode('utf-8'));root=t.root
 meta=h['only'](root.find(lambda n:n.tag=='meta' and n.attrs.get('property')=='og:url'),'observation URL')
 if meta.attrs.get('content')!=url:raise ValueError('Changed observation URL')
 card=h['only'](root.find(lambda n:n.has('card') and n.attrs.get('data-id')==ident.removeprefix('dndsu:')),'exact observation card')
 body=h['only'](card.find(lambda n:n.has('card__body') and n.has('new-article')),'article body')
 return list(headings(body))
def audit(scope,prior,selection,manifest,raws):
 if selection['accepted'] is not False or selection['complete'] is not False or selection['approvedDenominator'] is not None:raise ValueError('Selection cannot promote acceptance')
 selected={r['observationId']:r for r in selection['records']};props={r['observationId']:r for r in prior['records']};captures={r['observationId']:r for r in manifest};pages={p['id']:p for p in scope['records']}
 if any(set(rows)!=IDS or len(source)!=5 for rows,source in [(selected,selection['records']),(props,prior['records']),(captures,manifest)]) or set(raws)!=IDS:raise ValueError('Changed five-page scope or duplicate identity')
 records=[]
 for ident in sorted(IDS):
  page,p,s,c=pages[ident],props[ident],selected[ident],captures[ident];url=p['referenceEvidence']['url'];raw=raws[ident]
  if page['section']!='backgrounds' or page['url']!=url or page['sourceIds']!=[p['sourceId']] or page['names']['en']!='' or p['observedEnglishName']!='' or p['observedName']!=page['names']['ru']:raise ValueError('Changed original page attribution')
  if p['accepted'] is not False or p['canonicalId'] is not None or p['automaticProfileChange'] is not False or p['fullRulesVerified'] is not False:raise ValueError('Prior page-kind proposal promoted')
  if c['requestedUrl']!=url or c.get('resolvedUrl')!=url or c.get('status')!=200 or c['file']!=ident.split(':')[-1]+'.html' or hashlib.sha256(raw).hexdigest()!=c['sha256']:raise ValueError('Changed or unavailable capture')
  observed=extract(raw,ident,url)
  if observed!=s['expectedHeadings'] or len(observed)<2:raise ValueError('Changed selected collection structure')
  records.append({'observationId':ident,'sourceIds':list(page['sourceIds']),'observedName':page['names']['ru'],'observedEnglishName':'','referenceUrl':url,'htmlSha256':c['sha256'],'proposedPageKind':p['proposedPageKind'],'headings':observed,'structureReproduced':True,'semanticPageKindReview':'awaiting-independent-review','standaloneBackgroundAccepted':False,'componentCountAccepted':False,'fullPrimarySectionRead':False,'canonicalId':None,'accepted':False,'automaticProfileChange':False})
 return {'schemaVersion':1,'status':'secondary-background-collection-structures-not-canonical-units','accepted':False,'complete':False,'approvedDenominator':None,'summary':{'referencePages':5,'reproducedStructures':5,'selectedHeadings':sum(len(r['headings']) for r in records),'inventedEnglishNames':0,'acceptedStandaloneBackgrounds':0,'acceptedCanonicalUnits':0},'records':records,'limitations':['Five adaptation/option-collection reference pages are not five accepted standalone backgrounds.','Curated headings corroborate the reference page-kind proposal; count of headings alone is not proof of every component or primary-rule equivalence.','Empty observed English names stay empty; source IDs, historical page-kind proposals and raw snapshots are preserved.','Primary section references in the earlier proposal remain contents-only; this audit does not claim access to those full sections.','No features, bonus feats, proficiencies or bonds are granted automatically; personal manual choices remain available.']}
def build(directory):
 texts=[(ROOT/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in FILES];manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
 if any(not re.fullmatch(r'[0-9]+\.html',r.get('file','')) for r in manifest):raise ValueError('Invalid capture filename')
 result=audit(*map(json.loads,texts),manifest,{r['observationId']:(directory/r['file']).read_bytes() for r in manifest});result['inputSha256']={p:hashlib.sha256(t.encode()).hexdigest() for p,t in zip(FILES,texts)};return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 if a.output.resolve() in {p.resolve() for p in a.directory.iterdir()}:raise SystemExit('Cannot overwrite capture')
 r=build(a.directory);a.output.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(r['summary']))
