"""Selected publisher index metadata only: no stat blocks, translations or artwork."""
import argparse
import hashlib
import importlib.util
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse
spec=importlib.util.spec_from_file_location('skaz_toc',Path(__file__).with_name('extract-race-toc-evidence.py'))
shared=importlib.util.module_from_spec(spec);spec.loader.exec_module(shared)
BOOKS={'vgtm':('111',"Volo's Guide to Monsters"),'motm':('158','Mordenkainen Presents: Monsters of the Multiverse')}
def selected_groups(review):
 return [g for g in review['identityGroups'] if g['section']=='bestiary' and g['decision']=='define-separate-source-version-units' and len(g['members'])==2 and sorted(m['sourceIds'] for m in g['members'])==[['111'],['158']]]
def extract(raw,book,names):
 source_id,title=BOOKS[book];parser=shared.Toc();parser.feed(raw.decode('utf-8'));parser.close()
 if title not in parser.headings:raise ValueError('Missing exact book heading')
 records=[];missing=[]
 for name in names:
  matches=[(href,label) for href,label in parser.links if label.lower()==name]
  if len(matches)!=1:
   missing.append({'name':name,'reason':'missing-index-heading' if not matches else 'ambiguous-index-heading'});continue
  href,label=matches[0];url=urljoin('https://www.dndbeyond.com',href);parsed=urlparse(url)
  path=r'/(?:sources/(?:dnd/)?|compendium/rules/)'+book+r'/(?:bestiary(?:-[a-z]+)?|appendix-a-assorted-beasts|appendix-b-nonplayer-characters)/?'
  if parsed.scheme!='https' or parsed.netloc!='www.dndbeyond.com' or parsed.query or not parsed.fragment or not re.fullmatch(path,parsed.path):raise ValueError('Index target outside the selected book bestiary')
  records.append({'name':name,'heading':label,'targetUrl':url})
 return {'sourceId':source_id,'book':book,'title':title,'url':'https://www.dndbeyond.com/sources/dnd/'+book,'htmlSha256':hashlib.sha256(raw).hexdigest(),'records':records,'missing':missing}
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--directory',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
 review=json.loads(Path(__file__).resolve().parent.parent.joinpath('catalog/effective-m0-review-2014.json').read_text(encoding='utf-8'))
 names=sorted({g['comparisonKey'] for g in selected_groups(review)})
 result={'schemaVersion':1,'status':'bestiary-publication-index-evidence-not-full-rules','checkedOn':'2026-11-20','selectedNames':names,'sources':[extract(Path(args.directory,book+'.html').read_bytes(),book,names) for book in BOOKS],'limitations':['Exact headings establish publication presence only.','Missing or compound names remain unresolved; no automatic alias or transliteration.','No full stat blocks, exact errata version, translation or reuse permission is established.']}
 Path(args.output).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps({'selectedNames':len(names),'headings':sum(len(s['records']) for s in result['sources']),'missing':sum(len(s['missing']) for s in result['sources'])}))
