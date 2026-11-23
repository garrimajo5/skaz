"""Complete selected Wizard starting equipment, with the alternate-wealth rule separate."""
import argparse
from html.parser import HTMLParser
import hashlib
import importlib.util
import json
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
CLASS_SHA='5014af15fd61af05dde5bd29e19514b8fd87fe10ea60fbcd8a81f6574e2053c8'
SRD_SHA='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
BASIC_SHA='7a0c5d8bf52d15092f156d78418aa3d43307e271f810d2f06bf2f0258e9288a3'
ENTRY='catalog/wizard-entry-boundaries-2014.json'
def sha(b):return hashlib.sha256(b).hexdigest()
def compact(t):return ' '.join(t.split())
def module(name):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/name);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

class EquipmentParts(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.active=None;self.parts=[];self.result_parts=[]
 def handle_starttag(self,tag,attrs):
  if tag not in {'div','p','ul','li','a','strong','em','b','i','span','br'}:raise ValueError('Unknown semantic equipment element')
  if tag in {'p','li'}:
   if self.active is not None:raise ValueError('Nested paragraph/list item')
   self.active=tag;self.parts=[]
 def handle_data(self,data):
  if self.active:self.parts.append(data)
  elif compact(data):raise ValueError('Visible equipment prose outside compared pieces')
 def handle_endtag(self,tag):
  if tag in {'p','li'}:
   if self.active!=tag:raise ValueError('Unbalanced equipment piece')
   self.result_parts.append({'kind':tag,'text':compact(' '.join(self.parts))});self.active=None
 def result(self,raw):
  self.feed(raw);self.close()
  if self.active is not None or [p['kind'] for p in self.result_parts]!=['p','li','li','li','li','p']:raise ValueError('Complete equipment requires intro/four choices/wealth paragraph')
  visible=module('audit-wizard-candidate-concordance-2014.py').visible(raw)
  if compact(' '.join(p['text'] for p in self.result_parts))!=visible:raise ValueError('Lost equipment content')
  return self.result_parts


def secondary(raw):
 if sha(raw)!=CLASS_SHA:raise ValueError('Changed retained Wizard')
 h=module('audit-wizard-candidate-concordance-2014.py');text=raw.decode('utf-8');starts=list(re.finditer(r'<div\b[^>]*class="card__body new-article"[^>]*>',text))
 if len(starts)!=1:raise ValueError('Ambiguous class body')
 end=text.find('<div class="card__footer',starts[0].end())
 if end<0:raise ValueError('Missing class footer')
 article=text[starts[0].end():end];heads=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',article,re.S));ordinal=0
 for i,x in enumerate(heads):
  if not h.visible(x[2]):continue
  ordinal+=1
  if ordinal==18:
   if h.visible(x[2])!='СНАРЯЖЕНИЕ':raise ValueError('Changed Equipment heading')
   body=article[x.end():heads[i+1].start()];parts=EquipmentParts().result(body)
   return {'headingOrdinal':18,'title':'СНАРЯЖЕНИЕ','bodySha256':sha(h.visible(body).encode()),'parts':[{'kind':p['kind'],'textSha256':sha(p['text'].encode())} for p in parts],'completeSelectedHeadingPartsCompared':True}
 raise ValueError('Missing Equipment18')


def audit(class_raw,srd_raw,basic_raw,*,rendered_pages_checked=False):
 if not rendered_pages_checked or sha(srd_raw)!=SRD_SHA or sha(basic_raw)!=BASIC_SHA:raise ValueError('Inspect exact equipment/wealth carriers')
 import pypdfium2 as p
 h=module('audit-wizard-entry-boundaries-2014.py');srd=p.PdfDocument(srd_raw);basic=p.PdfDocument(basic_raw)
 s=compact(srd[51].get_textpage().get_text_range());b=compact(basic[44].get_textpage().get_text_range())
 equipment=h.span(s,'Equipment You start with the following equipment','The Wizard Proficiency');wealth=h.span(b,'Starting Equipment When you create your character','Wealth Wealth appears')
 if 'Wizard 4d4 × 10 gp' not in wealth:raise ValueError('Missing exact Wizard wealth row')
 entry=json.loads((ROOT/ENTRY).read_text(encoding='utf-8'))
 if entry['ordinarySelectedFacts']['startingEquipmentAutomaticallyRegrantedFromGenericClassStartingList']:raise ValueError('Changed multiclass equipment boundary')
 return {'schemaVersion':1,'status':'complete-selected-equipment-scope-not-full-class-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
  'sources':{'secondary':{'url':'https://dnd.su/class/105-wizard/','sha256':CLASS_SHA,'historicalSnapshotNotReplaced':True,'originalHttpReceiptUnavailable':True},'srd':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SRD_SHA,'pdfPage':52},'basic':{'url':'https://media.wizards.com/2018/dnd/downloads/DnD_BasicRules_2018.pdf','sha256':BASIC_SHA,'pdfPage':45},'renderedPagesInspected':True},
  'secondaryScope':secondary(class_raw),'primaryScopes':[{'kind':'complete-selected-wizard-equipment','source':'srd51','pdfPage':52,'textSha256':sha(equipment.encode()),'wordCount':len(equipment.split())},{'kind':'starting-equipment-context-and-selected-wizard-wealth-row','source':'basic2018','pdfPage':45,'textSha256':sha(wealth.encode()),'wordCount':len(wealth.split()),'otherClassWealthRowsAccepted':False}],
  'ordinarySelectedFacts':{'standardStartingSetAddsToBackgroundEquipment':True,'firstChoice':['quarterstaff','dagger'],'secondChoice':['component pouch','arcane focus'],'thirdChoice':["scholar’s pack","explorer’s pack"],'unconditionalStandardSetItem':'spellbook','alternateWealth':{'diceCount':4,'dieSides':4,'multiplier':10,'currency':'gp','replacesBothClassAndBackgroundStartingEquipment':True,'isAdditionalFreeGoldAlongWithBothEquipmentSets':False},'standardAndWealthOptionsSimultaneouslyGranted':False,'equipmentRegrantedOnMulticlass':False,'specificSpellbookFeatureGrantSettled':False,'automaticChoiceOrGoldRollMade':False},
  'manualAssessments':[{'secondaryPartIndexes':[0,1,2,3,4],'primary':'srd51PDF52','classification':'same-selected-standard-intro-and-four-items-or-choices'}, {'secondaryPartIndexes':[5],'primary':'basic2018PDF45','classification':'separate-alternate-wealth-context-and-Wizard-row-not-in-selected-SRD-class-paragraph'}],
  'limits':['Selected full Equipment18 scope is not full Wizard/PHB version or publication-rights acceptance.','Wizard wealth row only; no other class amounts, inventory contents inside packs, prices or automatic grants accepted.','Ordinary mutually exclusive choices warn on deviations but do not block manual profile exceptions.','Generic multiclass equipment boundary is reused; specific feature/Spellbook-grant questions remain separate.'],
  'implementationBoundaries':{'manualDeviationsWarnAndAllow':True,'requiresMandatoryGmCheckbox':False,'runtimeOrInventoryMutationPerformed':False},
  'summary':{'selectedSecondaryHeadings':1,'secondaryProseParagraphs':2,'secondaryListItems':4,'primaryScopes':2,'canonicalUnitsAccepted':0},
  'inputSha256':{ENTRY:sha((ROOT/ENTRY).read_bytes().replace(b'\r\n',b'\n'))},'upstreamParserSha256':{name:sha((ROOT/name).read_bytes().replace(b'\r\n',b'\n')) for name in ['scripts/audit-wizard-candidate-concordance-2014.py','scripts/audit-wizard-entry-boundaries-2014.py']},'generator':{'path':'scripts/audit-wizard-equipment-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--class-html',type=Path,required=True);p.add_argument('--srd',type=Path,required=True);p.add_argument('--basic',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--rendered-primary-pages-checked',action='store_true');a=p.parse_args()
 d=audit(a.class_html.read_bytes(),a.srd.read_bytes(),a.basic.read_bytes(),rendered_pages_checked=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));print(json.dumps(d['summary']))
