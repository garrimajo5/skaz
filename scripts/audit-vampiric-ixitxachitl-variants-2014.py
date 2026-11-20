"""Compare two exact secondary observation regions, not primary rule identity."""
import argparse,hashlib,json,re,runpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];h=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))
FILES=['catalog/scope-register-2014.json','catalog/effective-m0-review-2014.json','catalog/numeric-source-scope-policy-2014.json']
IDS=['dndsu:bestiary:5830','dndsu:bestiary:5832'];NAME='Vampiric Ixitxachitl';SPELL='Использование заклинаний.'
def normalize(text):return ' '.join(text.split())
def digest(text):return hashlib.sha256(text.encode()).hexdigest()
def tokens(node):
 for c in node.children:
  if isinstance(c,h['Node']):
   if c.tag in ['script','style'] or c.attrs.get('id')=='comments' or c.has('comments'):continue
   if c.tag in ['h2','h3','h4'] and h['clean'](c)=='Описание':yield None;return
   block=c.tag in ['p','div','li','ul','ol','h2','h3','h4']
   if block:yield ' '
   yield from tokens(c)
   if block:yield ' '
  else:yield c

def extract(raw,ident,url):
 t=h['Tree']();t.feed(raw.decode('utf-8'));card=h['only'](t.root.find(lambda n:n.has('card') and n.attrs.get('data-id')==ident.removeprefix('dndsu:')),'exact secondary card')
 if card.attrs.get('data-cardlink')!=url.removeprefix('https://dnd.su'):raise ValueError('Changed secondary card path')
 title=h['only'](card.find(lambda n:n.tag=='h2' and n.has('card-title')),'card title')
 if '['+NAME+']' not in h['clean'](title):raise ValueError('Changed English heading')
 plaque=h['only'](title.find(lambda n:n.has('source-plaque')),'source plaque')
 if plaque.attrs.get('title')!='Out of the Abyss':raise ValueError('Changed source plaque')
 params=h['only'](card.find(lambda n:n.tag=='ul' and n.has('params') and n.has('card__article-body')),'parameters')
 rows=[h['clean'](n) for n in params.children if isinstance(n,h['Node']) and n.tag=='li']
 def match(pattern,label):
  matches=[m for text in rows if (m:=re.fullmatch(pattern,text))]
  return h['only'](matches,label)
 ac=int(match(r'Класс Доспеха (\d+) \(природный доспех\)','AC')[1]);hp=match(r'Хиты (\d+) \(([^)]+)\)','HP');cr=match(r'Опасность (\d+) \((\d+) опыта\)','CR')
 ability_rows=[r for r in rows if r.startswith('Сил')]
 abilities=re.findall(r'(Сил|Лов|Тел|Инт|Мдр|Хар)\s*(\d+)',h['only'](ability_rows,'abilities'))
 if len(abilities)!=6 or len(dict(abilities))!=6:raise ValueError('Missing ability values')
 fields={'armorClass':ac,'hitPoints':int(hp[1]),'hitDice':normalize(hp[2]).replace('к','d'),'challengeRating':int(cr[1]),'experience':int(cr[2]),'abilities':{k:int(v) for k,v in abilities}}
 body=h['only'](card.find(lambda n:n.has('card__body') and n.has('new-article')),'article body');parts=[];stopped=False
 for p in tokens(body):
  if p is None:stopped=True;break
  parts.append(p)
 if not stopped:raise ValueError('Missing mechanical-region end before description')
 text=normalize(''.join(parts))
 if text.count('Действия')!=1:raise ValueError('Ambiguous actions boundary')
 return fields,text

def primary_rows(raw):
 t=h['Tree']();t.feed(raw.decode('utf-8'));listing=h['only'](t.root.find(lambda n:n.tag=='ul' and n.has('rpgmonster-listing')),'primary listing');rows=[]
 for n in listing.find(lambda n:n.has('monster-name')):
  links=list(n.find(lambda n:n.tag=='a' and re.fullmatch(r'/monsters/[0-9]+-[a-z0-9-]+',n.attrs.get('href',''))))
  if len(links)!=1 or h['clean'](links[0])!=NAME:continue
  rows.append({'name':NAME,'cardUrl':'https://www.dndbeyond.com'+links[0].attrs['href'],'publication':h['clean'](h['only'](n.find(lambda n:n.has('source')),'primary publication')),'assignedToSecondaryObservation':False})
 if len(rows)!=1 or rows[0]['publication']!='Out of the Abyss' or rows[0]['cardUrl']!='https://www.dndbeyond.com/monsters/17381-vampiric-ixitxachitl':raise ValueError('Changed exact publisher index witness')
 return rows

def audit(scope,root,policy,manifest,raws,primary_manifest,primary_raw,detail):
 pages={p['id']:p for p in scope['records']};group=h['only']((g for g in root['identityGroups'] if g['reviewId']=='name-review:33a60c9b712e1ff852ad'),'same-source review group')
 if group['decision']!='resolve-duplicate-or-variant-unit' or {m['id'] for m in group['members']}!=set(IDS) or len(group['members'])!=2:raise ValueError('Changed D03 group')
 publication=h['only']((p for p in policy['records'] if p['sourceId']=='129'),'source129')
 if publication['observedTitle']!='Out of the Abyss' or publication['disposition']!='eligible-publication-records-need-review':raise ValueError('Changed source policy')
 captures={r['observationId']:r for r in manifest}
 if set(captures)!=set(IDS) or len(manifest)!=2 or set(raws)!=set(IDS):raise ValueError('Changed secondary capture set')
 records=[];texts=[]
 for ident in IDS:
  p,c=pages[ident],captures[ident];url=p['url'];raw=raws[ident]
  if p['sourceIds']!=['129'] or p['names']['en']!=NAME or c['requestedUrl']!=url or c.get('resolvedUrl')!=url or c.get('status')!=200 or c['sha256']!=hashlib.sha256(raw).hexdigest():raise ValueError('Changed observation/capture attribution')
  fields,text=extract(raw,ident,url);texts.append(text);records.append({'observationId':ident,'originalSourceIds':['129'],'referenceUrl':url,'htmlSha256':c['sha256'],'selectedSecondaryFields':fields,'mechanicalRegionSha256':digest(text),'spellcastingSectionPresent':SPELL in text,'accepted':False,'canonicalId':None})
 base,variant=texts
 if base.count(SPELL)!=0 or variant.count(SPELL)!=1:raise ValueError('Changed selected spellcasting distinction')
 start=variant.index(SPELL);stop=variant.index('Действия',start);selected=variant[start:stop];outside=normalize(variant[:start]+variant[stop:])
 index_url='https://www.dndbeyond.com/monsters?filter-search=Vampiric%20Ixitxachitl'
 if primary_manifest['requestedUrl']!=index_url or primary_manifest.get('resolvedUrl')!=index_url or primary_manifest.get('status')!=200 or primary_manifest['sha256']!=hashlib.sha256(primary_raw).hexdigest():raise ValueError('Changed primary capture')
 rows=primary_rows(primary_raw)
 if detail['requestedUrl']!=rows[0]['cardUrl'] or detail['fullPrimaryRulesCompared'] is not False or 'error' not in detail:raise ValueError('Changed exact-detail access limitation; review before updating')
 return {'schemaVersion':1,'status':'secondary-spellcasting-distinction-not-canonical-unit-acceptance','accepted':False,'complete':False,'approvedDenominator':None,'reviewId':group['reviewId'],'records':records,'comparison':{'selectedNumericFieldsEqual':records[0]['selectedSecondaryFields']==records[1]['selectedSecondaryFields'],'normalizedSecondaryRegionsEqual':base==variant,'textOutsideSelectedSpellcastingEqual':base==outside,'selectedSpellcastingSectionSha256':digest(selected),'primaryRulesCompared':False,'automaticMergeApproved':False,'duplicateDeletionApproved':False},'primaryIndex':{'url':index_url,'htmlSha256':primary_manifest['sha256'],'records':rows,'fullPrimaryStatBlockRead':False},'primaryDetailAccess':{k:v for k,v in detail.items() if k in ['requestedUrl','resolvedUrl','status','error','fullPrimaryRulesCompared']},'referenceRelationshipProposal':'retain-base-and-spellcasting-view-distinction','proposedCanonicalEntityCount':None,'canonicalUnitsAccepted':0,'automaticCharacterMigration':False,'limitations':['Equal numeric fields do not establish identical mechanics: the selected secondary variant contains a spellcasting section.','Equality outside the selected normalized secondary region is not proof of complete or primary-rule equivalence.','One publisher index record is not assigned to both observations and does not prove duplicate identity or canonical granularity.','Full primary base/variant rules, exact version and reuse rights remain unverified; the detail timeout is recorded, not bypassed.','Original names, IDs, source arrays, snapshots and runtime remain unchanged.']}
def build(directory):
 text=[(ROOT/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in FILES];manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'));primary=json.loads((directory/'primary-manifest.json').read_text(encoding='utf-8'));detail=json.loads((directory/'primary-detail-manifest.json').read_text(encoding='utf-8'))
 result=audit(*map(json.loads,text),manifest,{i:(directory/(i.split(':')[-1]+'.html')).read_bytes() for i in IDS},primary,(directory/'primary-index.html').read_bytes(),detail);result['inputSha256']={p:hashlib.sha256(s.encode()).hexdigest() for p,s in zip(FILES,text)};return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 if a.output.resolve() in {p.resolve() for p in a.directory.iterdir()}:raise SystemExit('Cannot overwrite capture')
 r=build(a.directory);a.output.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(r['comparison']))
