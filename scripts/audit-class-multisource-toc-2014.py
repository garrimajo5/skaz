"""Bounded publisher TOC witnesses for four class source-claim families; not full text."""
import argparse
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin,urlsplit
import hashlib
import json
ROOT=Path(__file__).resolve().parents[1]
UNITS='catalog/class-unit-residual-review-2014.json'
BOOKS={
 'tcoe':{'file':'tcoe-index.html','sourceId':'117','url':'https://www.dndbeyond.com/sources/dnd/tcoe','title':'Tasha’s Cauldron of Everything','sha256':'91d36b9e84e825b1fa376ad5fb175d2544e042c96f47d616f4ec3f78744c86ee','links':{'bard':'/sources/tcoe/bard#CollegeofEloquence','cleric':'/sources/tcoe/cleric#OrderDomain','druid':'/sources/tcoe/druid#CircleofSpores','paladin':'/sources/tcoe/paladin#OathofGlory'}},
 'moot':{'file':'moot-index.html','sourceId':'121','url':'https://www.dndbeyond.com/sources/dnd/moot','title':'Mythic Odysseys of Theros','sha256':'9a19b978f2f22747a0b395c02132a02ed170d7dc91cb4cd474f0af9d1be09f95','links':{'bard':'/sources/moot/character-creation#BardCollegeofEloquence','paladin':'/sources/moot/character-creation#PaladinOathofGlory'}},
 'ggtr':{'file':'ggtr-index.html','sourceId':'112','url':'https://www.dndbeyond.com/sources/dnd/ggtr','title':"Guildmasters' Guide to Ravnica",'sha256':'fedaea3dc08b01c9bc7ed54745d85ec4e1a582995d1cd4120fed16f6f75c21f4','links':{'cleric':'https://www.dndbeyond.com/compendium/rules/ggtr/character-creation#ClericOrderDomain','druid':'https://www.dndbeyond.com/compendium/rules/ggtr/character-creation#DruidCircleofSpores'}}}
LABELS={'bard':{'tcoe':'College of Eloquence','moot':'Bard: College of Eloquence'},'cleric':{'tcoe':'Order Domain','ggtr':'Cleric: Order Domain'},'druid':{'tcoe':'Circle of Spores','ggtr':'Druid: Circle of Spores'},'paladin':{'tcoe':'Oath of Glory','moot':'Paladin: Oath of Glory'}}
SIDEKICKS={'Expert':'https://dnd.su/class/197-expert-sidekick/','Spellcaster':'https://dnd.su/class/198-spellcaster-sidekick/','Warrior':'https://dnd.su/class/199-warrior-sidekick/'}
def sha(raw):return hashlib.sha256(raw).hexdigest()
def compact(s):return ' '.join(s.split())
class Toc(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.stack=[];self.roots=0;self.links=[];self.active=None;self.h1=[];self.heading=None
 def handle_starttag(self,tag,attrs):
  a=dict(attrs);scope='compendium-toc-full-text' in a.get('class','').split()
  if scope:self.roots+=1
  self.stack.append((tag,scope)) if tag not in {'br','img','meta','link','hr','input','source','wbr'} else None
  if tag=='h1':self.heading=[]
  if tag=='a' and any(s for _,s in self.stack):
   if self.active is not None:raise ValueError('Nested TOC link')
   self.active={'href':a.get('href'),'text':[]}
 def handle_endtag(self,tag):
  if tag=='a' and self.active is not None:self.links.append({'href':self.active['href'],'label':compact(''.join(self.active['text']))});self.active=None
  if tag=='h1' and self.heading is not None:self.h1.append(compact(''.join(self.heading)));self.heading=None
  if any(t==tag for t,_ in self.stack):
   i=max(i for i,(t,_) in enumerate(self.stack) if t==tag);self.stack=self.stack[:i]
 def handle_data(self,data):
  if self.active is not None:self.active['text'].append(data)
  if self.heading is not None:self.heading.append(data)
def parse_toc(raw,key):
 book=BOOKS[key];p=Toc();p.feed(raw.decode('utf-8'));p.close()
 if p.roots!=1 or p.h1!=[book['title']]*(2 if key=='tcoe' else 1):raise ValueError('Exact retained publisher heading count and bounded TOC required')
 out=[]
 for slug,href in book['links'].items():
  found=[x for x in p.links if x['href']==href]
  if len(found)!=1 or found[0]['label']!=LABELS[slug][key]:raise ValueError('Missing, repeated or altered selected publisher TOC link')
  resolved=urljoin(book['url'],href);u=urlsplit(resolved)
  if u.scheme!='https' or u.hostname!='www.dndbeyond.com' or not u.fragment:raise ValueError('Foreign publisher reference')
  out.append({'classSlug':slug,'sourceId':book['sourceId'],'label':found[0]['label'],'observedHref':href,'resolvedUrl':resolved,'completeSubclassBodyCompared':False})
 if key=='tcoe':
  for label,url in SIDEKICKS.items():
   href='/sources/tcoe/dungeon-masters-tools#'+label;found=[x for x in p.links if x['href']==href]
   if len(found)!=1 or found[0]['label']!=label:raise ValueError('Missing or changed selected Sidekick TOC link')
   out.append({'sidekickLabel':label,'secondaryClassUrl':url,'sourceId':'117','label':label,'observedHref':href,'resolvedUrl':urljoin(book['url'],href),'completeSidekickBodyCompared':False})
 return out

def verified_receipt(receipt,raw,key):
 book=BOOKS[key]
 if receipt.get('requestedUrl')!=book['url'] or receipt.get('finalUrl')!=book['url'] or receipt.get('outcome')!='complete' or receipt.get('status')!=200 or receipt.get('retried') is not False or receipt.get('sha256')!=sha(raw) or receipt.get('bytes')!=len(raw) or sha(raw)!=book['sha256']:raise ValueError('Exact complete anonymous publisher capture required')
 return {k:receipt.get(k) for k in ['requestedUrl','finalUrl','status','capturedAt','bytes','sha256','outcome','retried']}

def chapter_boundary(receipt,requested,final):
 if receipt.get('requestedUrl')!=requested or receipt.get('finalUrl')!=final or receipt.get('status')!=200 or receipt.get('outcome')!='capture-error' or receipt.get('errorType')!='TimeoutError' or receipt.get('bodyFile') is not None or receipt.get('sha256') is not None or receipt.get('bytes') is not None or receipt.get('retried') is not False:raise ValueError('Chapter attempt cannot be silently promoted to a retained rule body')
 return {**{k:receipt.get(k) for k in ['requestedUrl','finalUrl','status','capturedAt','outcome','errorType','retried']},'headersObserved':True,'fullBodyRetained':False,'primarySubclassRulesCompared':False,'accessBarrierProvedToBePaywall':False}

def build(folder,root=ROOT):
 units=json.loads((root/UNITS).read_text(encoding='utf-8'));capture=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources=[];links=[]
 for key,book in BOOKS.items():
  raw=(folder/book['file']).read_bytes();receipt=verified_receipt(capture[book['file']],raw,key);selected=parse_toc(raw,key);links.extend(selected);sources.append({'bookKey':key,'sourceId':book['sourceId'],'title':book['title'],'capture':receipt,'tocBoundary':'one div.compendium-toc-full-text','selectedLinks':selected})
 groups=[]
 for group in units['versionDecisionGroups']:
  witnesses=[x for x in links if x.get('classSlug')==group['classSlug']]
  if set(x['sourceId'] for x in witnesses)!=set(group['sourceIds']) or len(witnesses)!=2:raise ValueError('Exact paired source-claim family required')
  groups.append({'classSlug':group['classSlug'],'parentToken':group['parentToken'],'memberObservationIds':list(group['memberObservationIds']),'originalSourceIdsPreserved':list(group['sourceIds']),'primaryIndexPresenceForBothSources':True,'selectedPublisherLinks':witnesses,'fullRuleEqualityAccepted':False,'printedVersionEqualityAccepted':False,'canonicalVersionCount':None,'canonicalAliasAccepted':False})
 sidekick_witnesses=[]
 for original in units['discoveryBoundary']['sidekickReferences']:
  found=[x for x in links if x.get('secondaryClassUrl')==original['url']]
  if len(found)!=1:raise ValueError('Missing exact sidekick discovery-to-publisher reference')
  sidekick_witnesses.append({'originalDiscoveryObservation':original,'publisherTocLink':found[0],'referencePresenceVerified':True,'playerClassAutomaticallyAdded':False,'fullRulesOrCanonicalUnitAccepted':False})
 attempts=[chapter_boundary(capture['tcoe-bard.html'],'https://www.dndbeyond.com/sources/tcoe/bard','https://marketplace.dndbeyond.com/all-rulebooks/tashas-cauldron-of-everything'),chapter_boundary(capture['moot-character.html'],'https://www.dndbeyond.com/sources/moot/character-creation','https://marketplace.dndbeyond.com/settings/mythic-odysseys-of-theros')]
 if len(groups)!=4 or sum(len(g['memberObservationIds']) for g in groups)!=28 or capture['captureBatch']['resourceCount']!=5 or capture['captureBatch']['automaticRetries'] is not False:raise ValueError('Changed bounded family/capture scope')
 return {'schemaVersion':1,'status':'four-family-publisher-toc-witnesses-not-rule-or-version-equivalence','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
  'summary':{'publisherIndices':3,'selectedClassFamilyTocLinks':8,'selectedSidekickTocLinks':3,'pairedFamilies':4,'preservedObservationIds':28,'chapterAttemptsWithObservedMarketplaceRedirect':2,'chapterBodiesRetained':0,'completeSubclassComparisons':0,'canonicalUnitsAccepted':0},'sources':sources,'familyWitnesses':groups,'sidekickReferenceWitnesses':sidekick_witnesses,'chapterAttempts':attempts,
  'limits':['Selected TOC links establish publication presence only, not whole text/version/translation equality or usage rights.','The two chapter responses exposed marketplace final URLs/status200 before body-read timeout; no complete body was retained.','A marketplace redirect and timeout are not a proven paywall, permanent denial, authentication permission or license to bypass access.','Raw publisher HTML and individual receipts remain outside Git; numeric source namespaces/order and all28observations are preserved.','No automatic version expansion, aliases, runtime or character changes; manual game exceptions remain allowed.'],
  'nextWorkItem':{'role':'content','phase':'exact-eloquence-version-body-access','action':'Obtain an authorized exact TCE/MOoT subclass body/version witness before comparing the6Eloquence observations; do not repeat successful index captures. Without it, keep only this body criterion on hold and continue independent D01/D06/D07 evidence.','firstFamily':'bard:college.eloquence'},
  'inputSha256':{UNITS:sha((root/UNITS).read_bytes().replace(b'\r\n',b'\n'))},'upstreamCaptureToolSha256':{'scripts/capture-publication-witnesses.py':capture['captureBatch']['captureToolSha256']},'generator':{'path':'scripts/audit-class-multisource-toc-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--captures',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();d=build(a.captures);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
