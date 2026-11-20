"""Explicit, proposed literal spelling relations. Never normalizes the catalog."""
import argparse
import hashlib
import json
import runpy
from pathlib import Path
shared=runpy.run_path(str(Path(__file__).with_name('extract-monster-version-evidence.py')))
SPECS={"githyanki kith'rak":('githyanki kith’rak','apostrophe-style',['mtof','motm']),'deep rothe':('deep rothé','diacritic',['vgtm','motm'])}
POLICY_TITLES={'111':"Volo's guide to monsters",'113':"Mordenkainen's Tome of Foes",'158':'Mordenkainen Presents: Monsters of the Multiverse'}
def build(review,policy,raws):
 groups=[];seen=set()
 for observed,(published,reason,books) in SPECS.items():
  matches=[g for g in review['identityGroups'] if g['section']=='bestiary' and g['comparisonKey']==observed and g['decision']=='define-separate-source-version-units']
  if len(matches)!=1:raise ValueError('Missing or ambiguous original identity group')
  group=matches[0];expected=sorted([[shared['BOOKS'][book][0]] for book in books])
  if sorted(m['sourceIds'] for m in group['members'])!=expected:raise ValueError('Original source scope changed')
  units=[]
  for book in books:
   source_id=shared['BOOKS'][book][0];policies=[p for p in policy['records'] if p['sourceId']==source_id]
   if len(policies)!=1 or policies[0]['observedTitle']!=POLICY_TITLES[source_id] or policies[0]['disposition']!='eligible-publication-records-need-review':raise ValueError('Source policy changed')
   member=next(m for m in group['members'] if m['sourceIds']==[source_id])
   if member['id'] in seen or member['observedName'].strip().lower()!=observed:raise ValueError('Original observation changed or duplicated')
   seen.add(member['id']);source=shared['extract'](raws[book],book,[published]);records=source.pop('records');missing=source.pop('missing')
   witness=records[0] if records else None
   units.append({'observationId':member['id'],'observedName':member['observedName'],'sourceIds':list(member['sourceIds']),'source':source,'publishedSpellingEvidence':witness,'proposedAlias':{'observedKey':observed,'publishedKey':published,'reason':reason} if witness else None,'unresolvedReason':None if witness else 'literal-published-heading-missing','accepted':False,'automaticAlias':False,'canonicalId':None,'fullRules':'unverified','exactErrataVersion':'unverified','translationReusePermission':'not-established'})
  groups.append({'reviewId':group['reviewId'],'observedKey':observed,'units':units,'proposal':'review-explicit-literal-spelling-relation' if all(u['publishedSpellingEvidence'] for u in units) else 'retain-incomplete-spelling-evidence','accepted':False,'automaticMerge':False,'automaticCharacterMigration':False})
 complete=sum(all(u['publishedSpellingEvidence'] for u in g['units']) for g in groups)
 return {'schemaVersion':1,'status':'explicit-published-spelling-proposals-not-approved-aliases','accepted':False,'complete':False,'approvedDenominator':None,'summary':{'consideredGroups':len(groups),'preservedObservations':len(seen),'publishedSpellingWitnesses':sum(bool(u['publishedSpellingEvidence']) for g in groups for u in g['units']),'completeProposedRelations':complete,'incompleteGroups':len(groups)-complete,'acceptedAliases':0},'groups':groups,'limitations':['Only the two explicitly declared literal relations are proposed; no general punctuation, accent or transliteration normalization.','A same-name publication heading does not prove identical rules or exact errata.','The base Volo/MotM and MToF/MotM reports remain unchanged, with their unresolved statuses.','No runtime alias, canonical unit, source observation or character is modified.']}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--directory',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
 root=Path(__file__).resolve().parent.parent;files=['catalog/effective-m0-review-2014.json','catalog/numeric-source-scope-policy-2014.json']
 texts=[root.joinpath(file).read_text(encoding='utf-8') for file in files]
 result=build(*map(json.loads,texts),{book:Path(args.directory,book+'.html').read_bytes() for book in ['vgtm','mtof','motm']})
 result['inputSha256']={file:hashlib.sha256(text.replace('\r\n','\n').encode()).hexdigest() for file,text in zip(files,texts)}
 Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(result['summary']))
