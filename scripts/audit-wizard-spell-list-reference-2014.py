"""Bounded Wizard list membership witnesses, not full spell rules or canonical acceptance."""
import argparse
from collections import Counter
import hashlib
from html.parser import HTMLParser
import importlib.metadata
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlsplit

SRD_SHA = '2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
CLASS_SHA = '5014af15fd61af05dde5bd29e19514b8fd87fe10ea60fbcd8a81f6574e2053c8'
COUNTS = [14,27,31,28,23,23,19,15,12,12]
SECONDARY_SHAS = {1: '77aefb980879d54a2541913946f8b712c5017e9a0d4c0225bcf2c8d123b985ea', 2: '0dc0f5d67dbc22db6473ebd907454cefa1daeaabedbb5d2acca16ba79c6569b6', 3: '721b93c621466cb122b3e13958f7cae67de14c25d29405b006be2f07b2907567', 4: 'ff081e6371ea787bbf6daf6612b80257e013131c8cd69efea88283672dd8a4f5', 5: 'b94e63841763bec824ddd18946bbfdd1fe7f124860589783ee68e2b33144c998', 6: '32db91444dd4eff40708ad8518037bc82dd823446b939afe9936732bf4c98237', 7: '58c284ab1fece078694c60483a43b3b64c7ccfcf8470e2496d5d98bc9b54d480', 8: 'cec0b31d831c157b5b847b83efb86261f1adaf39805c0a062d9a2a8efbc77536', 9: 'df359aff7516572394777c95e07cb98ae2081930257ba827b59ce7b906cc34f5', 10: 'e2ee47f14163e085a5da1619c534852219994fdb7e90182ac97e99ee56b98898', 11: '1404acc9d67d63fac9c1c502fa0d2c61b432bdfaf156351df9fefc5adfab7edc', 12: 'cb5a7b2b096f6dd720d38341f82a55bdd140497d892edc7b3c3b853050249e1b', 13: 'e23b943d2083e5b71837c3f2fce4e80d02f8f8d2c6a0a09552810827b7a6f1e4', 14: 'e27d5715abcda58d49222e5bd910f5b0cdd4e26b074f59f6882f98dc47336cfe'}
CONTROL_SHAS = {'augury-on.html': 'be5813d7dc3019c833d7efbffbe47f5841eb75a332957d0afc2a83aadc5d023f', 'augury-off.html': 'f647245a85ebe8675d6f141a524cb18f4acba164945a17df46169095d7c3b31e', 'search-find-familiar.html': '2e61745fc6d22beec56e88d7ddcc4b422b0881c98c93cf253ea2e4cbd309867e', 'search-blur.html': '263aadbaeb9725bbd540e933d025de36d187f185215e0971fa30222083b85b4b', 'search-invisibility.html': '6717cb66bec663e8f5c3274df79cfc972de40caa9504b5d5b744a47d5d987e1d', 'search-circle-of-death.html': '6798ffeb84a0d0b3805d3f19b32d8c779cb45cc6bbbfdca6d06e8aeb96f56d42', 'search-true-seeing.html': '7ea13a70348d4b8ed99667480df64176fb49ff03b98b3dd568de5b2eabd5a8ea', 'search-plane-shift.html': 'be84a14b54982e5cd2dd655adb3889a529af5bc02fdb70d326af8e3de4488e1f'}
# Selected name correspondences only. They do not establish equality of full texts/versions.
NAME_CORRESPONDENCES = {
 'Acid Arrow': "Melf's Acid Arrow", 'Black Tentacles': "Evard's Black Tentacles", 'Arcanist’s Magic Aura': "Nystul's Magic Aura",
 'Arcane Hand': "Bigby's Hand", 'Arcane Sword': "Mordenkainen's Sword",
 'Faithful Hound': "Mordenkainen's Faithful Hound", 'Floating Disk': "Tenser's Floating Disk",
 'Freezing Sphere': "Otiluke's Freezing Sphere", 'Hideous Laughter': "Tasha's Hideous Laughter",
 'Instant Summons': "Drawmij's Instant Summons", 'Irresistible Dance': "Otto's Irresistible Dance",
 'Magnificent Mansion': "Mordenkainen's Magnificent Mansion", 'Private Sanctum': "Mordenkainen's Private Sanctum",
 'Resilient Sphere': "Otiluke's Resilient Sphere", 'Secret Chest': "Leomund's Secret Chest",
 'Telepathic Bond': "Rary's Telepathic Bond", 'Tiny Hut': "Leomund's Tiny Hut",
}

def sha(raw): return hashlib.sha256(raw).hexdigest()
def compact(text): return ' '.join(text.split())
def key(text): return compact(text).replace('’', "'").casefold()


def primary_list(pages):
 if set(pages)!={111,112,113,114}: raise ValueError('All three list pages and next-page boundary required')
 rows=[]
 for page in [111,112,113,114]:
  lines=[compact(line) for line in pages[page].split('\n') if line.strip()]
  if not lines or lines[0]!=f'System Reference Document 5.1 {page}': raise ValueError('Unexpected primary page/header')
  if page==114:
   if lines[1:3]!=['Spell Descriptions','Acid Arrow']: raise ValueError('Changed next-page stop boundary')
  else: rows.extend((page,line) for line in lines[1:])
 starts=[i for i,(_,line) in enumerate(rows) if line=='Wizard Spells']
 if len(starts)!=1: raise ValueError('Missing/ambiguous Wizard boundary')
 rows=rows[starts[0]+1:]
 # This isolated terminal character is a visually verified PDF113 layout split.
 repairs=[i for i,(_,line) in enumerate(rows) if line=='Control Weathe']
 if len(repairs)!=1 or rows[repairs[0]+1]!=(113,'r'): raise ValueError('Changed Control Weather split; reassess')
 i=repairs[0]; rows[i:i+2]=[(113,'Control Weather')]
 if rows[-1]!=(113,'Wish'): raise ValueError('Missing final Wizard list entry')
 result=[]; headings=[]; level=None
 for page,line in rows:
  match=re.fullmatch(r'(?:Cantrips \(0 Level\)|([1-9])(?:st|nd|rd|th) Level)',line)
  if match:
   level=int(match[1] or 0); headings.append(level)
  else:
   if level is None or not line or len(line)<3: raise ValueError('Unassigned/partial primary name')
   result.append({'name':line,'spellLevel':level,'pdfPage':page})
 if headings!=list(range(10)) or [sum(r['spellLevel']==n for r in result) for n in range(10)]!=COUNTS: raise ValueError('Changed complete list levels/counts')
 if len({key(r['name']) for r in result})!=204: raise ValueError('Duplicate primary name')
 return result


class Page(HTMLParser):
 """Read exact card div boundaries, filter inputs and pagination, never description prose."""
 def __init__(self,html):
  super().__init__(convert_charrefs=True);self.html=html;self.offsets=[0]
  for match in re.finditer('\n',html):self.offsets.append(match.end())
  self.depth=0;self.active=None;self.cards=[];self.inputs={};self.page_links=[];self.current_page=None;self.pagination=0;self.current_li=False
 def source_offset(self):
  line,col=self.getpos();return self.offsets[line-1]+col
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='input' and a.get('name') in {'class','search','disableTasha'}:
   if a['name'] in self.inputs: raise ValueError('Duplicate filter input')
   self.inputs[a['name']]={'value':a.get('value',''),'checked':'checked' in a,'title':a.get('title'), 'options':json.loads(a['data-list']) if 'data-list' in a else None}
  if tag=='ul' and 'pagination' in a.get('class','').split():self.pagination=1
  elif self.pagination and tag=='ul':self.pagination+=1
  if self.pagination and tag=='li':self.current_li='current' in a.get('class','').split()
  if self.pagination and tag=='a':
   self.page_links.append(a.get('href'))
   if self.current_li:self.current_page=int(parse_qs(urlsplit(a['href']).query)['page'][0])
  if tag=='div':
   self.depth+=1
   if 'data-cardlink' in a:
    if self.active is not None:raise ValueError('Nested list card')
    self.active=(self.depth,self.source_offset(),a)
 def handle_endtag(self,tag):
  if tag=='ul' and self.pagination:self.pagination-=1
  if tag=='li':self.current_li=False
  if tag=='div':
   if self.active is not None and self.active[0]==self.depth:
    _,begin,attrs=self.active;end=self.html.find('>',self.source_offset())+1
    self.cards.append((attrs,self.html[begin:end]));self.active=None
   self.depth-=1
 def result(self):
  self.feed(self.html);self.close()
  if self.active is not None:raise ValueError('Truncated list card')
  return self


class Card(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True);self.title=None;self.links=[];self.sources=[];self.lis=[];self.capture=None;self.parts=[];self.sup=0;self.events=[];self.classes_events=[];self.in_title=False;self.plaque=None;self.level=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag=='h2' and 'card-title' in a.get('class','').split():self.in_title=True
  if self.in_title and tag=='a' and 'item-link' in a.get('class','').split():self.capture='title';self.parts=[];self.links.append(a.get('href'))
  if self.in_title and 'source-plaque' in a.get('class','').split():self.plaque={'tag':tag,'title':a.get('title'),'href':a.get('href'),'text':''}
  if tag=='li' and self.capture is None:self.capture='li';self.parts=[];self.events=[]
  if self.capture=='li' and tag=='sup':self.sup+=1
 def handle_data(self,data):
  if self.capture:self.parts.append(data)
  if self.capture=='li':self.events.append({'text':data,'sup':self.sup>0})
  if self.plaque:self.plaque['text']+=data
 def handle_endtag(self,tag):
  if self.plaque and tag==self.plaque['tag']:
   self.plaque['text']=compact(self.plaque['text']);self.sources.append(self.plaque);self.plaque=None
  if tag=='a' and self.capture=='title':self.title=compact(''.join(self.parts));self.capture=None
  if tag=='h2':self.in_title=False
  if tag=='sup' and self.sup:self.sup-=1
  if tag=='li' and self.capture=='li':
   text=compact(''.join(self.parts));self.lis.append(text)
   if text.startswith('Классы:'):self.classes_events=list(self.events)
   self.capture=None


def class_segments(events):
 # Superscript belongs to the immediately preceding class, not every class in the row.
 parts=[{'text':'','markers':[]}]
 for event in events:
  if event['sup']:
   marker=compact(event['text'])
   if marker:parts[-1]['markers'].append(marker)
  else:
   chunks=event['text'].split(',')
   parts[-1]['text']+=chunks[0]
   for chunk in chunks[1:]:parts.append({'text':chunk,'markers':[]})
 for p in parts:p['text']=compact(p['text']).removeprefix('Классы:').strip()
 return parts


def card_record(attrs,raw,page):
 p=Card();p.feed(raw);p.close()
 if len(p.links)!=1 or p.links[0]!=attrs.get('data-cardlink'):raise ValueError('Ambiguous/mismatched card identity')
 match=re.fullmatch(r'/spells/(\d+)-[^/]+/',p.links[0])
 if not match or attrs.get('data-id')!='spells:'+match[1]:raise ValueError('Foreign namespace or mismatched spell ID')
 title=re.fullmatch(r'(.+?) \[(.+)\]',p.title or '')
 if not title:raise ValueError('Missing bilingual list title')
 level=None
 for li in p.lis:
  if li.startswith('Заговор,'):level=0;break
  m=re.match(r'([1-9]) уровень,',li)
  if m:level=int(m[1]);break
 if level is None:raise ValueError('Missing spell level')
 classes=class_segments(p.classes_events);wizard=[c for c in classes if c['text']=='волшебник']
 if len(wizard)!=1:raise ValueError('Missing/ambiguous exact Wizard membership; reassess subclass scope')
 legacy=[s for s in p.sources if s['tag']=='span' and not s['href']]
 if not legacy:raise ValueError('Missing legacy book plaque')
 return {'sourceObservationId':attrs['data-id'],'href':p.links[0],'titleRu':title[1],'nameEn':title[2], 'spellLevel':level,
         'listPage':page,'cardHtmlSha256':sha(raw.encode()),'legacySourcePlaques':legacy,
         'adjacentOtherVersionLinks':[s for s in p.sources if s['href']], 'classes':classes,
         'wizardMarkers':wizard[0]['markers'],'wholeSpellRulesCompared':False,'canonicalCatalogId':None}


def list_page(raw,page,expected_search='',disable=False):
 s=raw.decode('utf-8');p=Page(s).result()
 if p.inputs.get('class',{}).get('value')!='["21"]' or p.inputs.get('search',{}).get('value')!=expected_search:raise ValueError('Wrong reflected filter inputs')
 if p.inputs.get('disableTasha',{}).get('checked')!=disable:raise ValueError('Wrong TCE filter state')
 options=[o for group in p.inputs['class']['options'] for o in group['list']]
 if [o['title'] for o in options if o['value']==21]!=['Волшебник']:raise ValueError('Provider class21 is not verified as Wizard')
 if expected_search=='':
  if p.current_page!=page:raise ValueError('Wrong current pagination page')
  for href in p.page_links:
   u=urlsplit(href);q=parse_qs(u.query,keep_blank_values=True)
   if u.scheme or u.netloc or u.fragment or u.path!='/spells/' or q.get('class')!=['21'] or q.get('search')!=[''] or set(q)!={'class','search','page'} or not q['page'][0].isdigit():raise ValueError('Pagination changed query/namespace')
  last=max(int(parse_qs(urlsplit(href).query)['page'][0]) for href in p.page_links)
  if last!=14:raise ValueError('Changed terminal pagination')
 return [card_record(a,body,page) for a,body in p.cards],p.inputs


def compare(primary,secondary):
 by_name={}
 for r in secondary:by_name.setdefault(key(r['nameEn']),[]).append(r)
 links=[];missing=[]
 for r in primary:
  expected=NAME_CORRESPONDENCES.get(r['name'],r['name']);matches=by_name.get(key(expected),[])
  if len(matches)>1:raise ValueError('Duplicate English observation needs explicit identity review')
  if not matches:missing.append(r);continue
  match=matches[0]
  if match['spellLevel']!=r['spellLevel']:raise ValueError('Spell-circle discrepancy requires review')
  links.append({'primaryName':r['name'],'spellLevel':r['spellLevel'],'secondaryObservationId':match['sourceObservationId'],
                'comparisonKind':'selected-eponym-name-correspondence-only' if r['name'] in NAME_CORRESPONDENCES else 'same-English-name-and-level-only',
                'secondaryWizardMarkers':match['wizardMarkers'],'fullRulesEquivalent':False})
 used={r['secondaryObservationId'] for r in links}
 return {'matches':links,'primaryNamesNotObserved':missing,'secondaryBeyondSelectedSrd':[r['sourceObservationId'] for r in secondary if r['sourceObservationId'] not in used]}


def control_capture(folder,name,search,disable=False):
 raw=(folder/name).read_bytes();receipt=json.loads((folder/(name+'.capture.json')).read_text(encoding='utf-8'))
 from urllib.parse import quote
 expected='https://dnd.su/spells/?search='+quote(search,safe='')+'&class=21'+('&disableTasha=1' if disable else '')
 if sha(raw)!=CONTROL_SHAS[name] or receipt.get('requestedUrl')!=expected or receipt.get('finalUrl')!=expected or receipt.get('status')!=200 or receipt.get('outcome')!='complete' or receipt.get('sha256')!=sha(raw) or receipt.get('bytes')!=len(raw) or receipt.get('retried') is not False:raise ValueError('Changed/missing exact control capture')
 rows,_=list_page(raw,1,search,disable)
 return rows,{'bodyFile':name,**receipt}


def controls(folder,missing):
 result=[]
 for primary in missing:
  search=primary['name'][0]+primary['name'][1:].lower()
  name='search-'+primary['name'].lower().replace(' ','-')+'.html'
  rows,receipt=control_capture(folder,name,search)
  matches=[r for r in rows if key(r['nameEn'])==key(primary['name'])]
  if len(matches)!=1 or matches[0]['spellLevel']!=primary['spellLevel']:raise ValueError('Targeted exact name/level not found unambiguously')
  result.append({'primaryName':primary['name'],'spellLevel':primary['spellLevel'],'notObservedInPaginatedSnapshot':True,'capture':receipt,
                 'exactMatchedObservation':matches[0],'otherReturnedObservationIds':[r['sourceObservationId'] for r in rows if r is not matches[0]],
                 'searchCanMatchDescriptionOrOtherNames':True,'wholeSpellRulesCompared':False})
 on,on_receipt=control_capture(folder,'augury-on.html','Augury')
 off,off_receipt=control_capture(folder,'augury-off.html','Augury',True)
 if len(on)!=1 or on[0]['sourceObservationId']!='spells:40' or on[0]['wizardMarkers']!=['TCE'] or any(r['sourceObservationId']=='spells:40' for r in off):raise ValueError('Changed Augury optional class control')
 return {'targetedPaginationAbsences':result,'auguryTceControl':{'enabledCapture':on_receipt,'disabledCapture':off_receipt,'enabledObservation':on[0],
          'disabledReturnedObservationIds':[r['sourceObservationId'] for r in off],'provesOnlyObservedSecondaryFilterBehavior':True,'primaryTceFullRuleVerified':False},
         'paginationIsNotFullClassListProof':True,'missingNamesAreNotProvenMissingCatalogEntries':True}


def audit(srd_raw,class_raw,folder,*,rendered_pages_checked=False):
 if sha(srd_raw)!=SRD_SHA or sha(class_raw)!=CLASS_SHA:raise ValueError('Changed retained primary/class snapshot')
 if not rendered_pages_checked:raise ValueError('Inspect primary list pages before accepting layout repair')
 import pypdfium2
 pdf=pypdfium2.PdfDocument(srd_raw)
 pages={n:pdf[n-1].get_textpage().get_text_range() for n in [111,112,113,114]};primary=primary_list(pages)
 if b'/spells/?search=&amp;class=21' not in class_raw:raise ValueError('Missing retained Wizard list reference')
 records=[];captures=[];filters=[]
 for page in range(1,15):
  name='wizard-spells.html' if page==1 else f'page-{page}.html';raw=(folder/name).read_bytes()
  receipt=json.loads((folder/('capture.json' if page==1 else name+'.capture.json')).read_text(encoding='utf-8'))
  q=f'https://dnd.su/spells/?search=&class=21'+('' if page==1 else f'&page={page}')
  if receipt.get('requestedUrl')!=q or receipt.get('finalUrl')!=q or receipt.get('status')!=200 or receipt.get('outcome')!='complete' or receipt.get('sha256')!=sha(raw) or receipt.get('bytes')!=len(raw) or receipt.get('retried') is not False:raise ValueError('Missing/wrong exact public capture receipt')
  rows,inputs=list_page(raw,page)
  if sha(raw)!=SECONDARY_SHAS[page]:raise ValueError('Changed manually reviewed secondary page; reassess snapshot')
  if not rows or len(rows)>25:raise ValueError('Unexpected observed list-page size')
  records.extend(rows);captures.append({'listPage':page,'bodyFile':name,**receipt});filters.append({'listPage':page,'classValue':inputs['class']['value'],'search':inputs['search']['value'],'disableTasha':inputs['disableTasha']['checked']})
 ids=[r['sourceObservationId'] for r in records]
 if len(set(ids))!=len(ids):raise ValueError('Duplicate spell across pagination; not a coherent complete snapshot')
 result=compare(primary,records);control=controls(folder,result['primaryNamesNotObserved'])
 return {'schemaVersion':1,'status':'bounded-spell-list-reference-witness-not-full-spell-rules','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
  'sources':{'srd':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SRD_SHA,'pdfPages':[111,112,113],'nextPageStopGuard':114,'textExtractor':'pypdfium2','extractorVersion':importlib.metadata.version('pypdfium2'),'renderedPagesChecked':True},
   'retainedWizardClass':{'url':'https://dnd.su/class/105-wizard/','sha256':CLASS_SHA,'referenceHref':'/spells/?search=&class=21','historicalIdentityNotReplaced':True,'sourceBookClaimNotAssignedToDestination':True},'secondaryListCaptures':captures},
  'primaryScope':{'heading':'Wizard Spells','startPdfPage':111,'endPdfPage':113,'stopBefore':'Spell Descriptions / Acid Arrow on PDF114','countsBySpellLevel':COUNTS,'entries':primary,'verifiedLayoutRepairs':[{'page':113,'from':['Control Weathe','r'],'to':'Control Weather','visuallyChecked':True}],'selectedListScopeComplete':True,'wholeSrdCompared':False},
  'secondaryScope':{'reflectedFilters':filters,'entries':records,'allObservedPaginationPagesCaptured':True,'completeSecondaryClassListAccepted':False,'queryProviderClassId':21,'queryProviderClassLabel':'Волшебник','observedPageCounts':[sum(r['listPage']==n for r in records) for n in range(1,15)],'sourceAndSubclassFiltersNotApplied':True,'fullClassEligibilityOrFullRulesAccepted':False},
  'nameComparison':{'scope':'captured14-page-paginated-result-only',**result},'targetedControlEvidence':control,'summary':{'primaryEntries':len(primary),'secondaryObservations':len(records),'nameLevelCorrespondences':len(result['matches']),'primaryNamesNotObserved':len(result['primaryNamesNotObserved']),'secondaryBeyondSelectedSrd':len(result['secondaryBeyondSelectedSrd']),'selectedNameCorrespondences':sum(r['comparisonKind'].startswith('selected-eponym') for r in result['matches']),'wizardTceMarked':sum('TCE' in r['wizardMarkers'] for r in records),'primaryNamesAccountedForWithTargetedControls':len(result['matches'])+len(control['targetedPaginationAbsences']),'primaryGapsCorroboratedByTargetedSearch':len(control['targetedPaginationAbsences']),'completeSecondaryClassListAccepted':False,'canonicalUnitsAccepted':0},
  'limits':['A selected SRD list is not the full official WotC2014 catalog or a denominator.','Name/level correspondence is not full text, translation, version, rights or character eligibility acceptance.','Legacy plaques and adjacent PH24 links remain separate. TCE markers belong to individual class segments.','No spells automatically learned/prepared/granted; manual exceptions remain available.','Exact PHB/TCE publication/version and subclass applicability require their own primary witnesses.','All14 pages were captured, but six SRD names only appeared in targeted exact-match search controls; do not claim a complete secondary class list.'],
  'generator':{'path':'scripts/audit-wizard-spell-list-reference-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}


if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--srd',type=Path,required=True);p.add_argument('--class-html',type=Path,required=True);p.add_argument('--secondary-dir',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--rendered-primary-pages-checked',action='store_true');a=p.parse_args()
 d=audit(a.srd.read_bytes(),a.class_html.read_bytes(),a.secondary_dir,rendered_pages_checked=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));print(json.dumps(d['summary']))
