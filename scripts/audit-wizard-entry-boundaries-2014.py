"""Wizard HP/proficiency source scopes with first-class/multiclass separation."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
CLASS_SHA='5014af15fd61af05dde5bd29e19514b8fd87fe10ea60fbcd8a81f6574e2053c8'
SRD_SHA='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
BASIC_SHA='7a0c5d8bf52d15092f156d78418aa3d43307e271f810d2f06bf2f0258e9288a3'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def compact(s):return ' '.join(s.split())
def helper():
 spec=importlib.util.spec_from_file_location('entry_paragraphs',ROOT/'scripts/audit-wizard-candidate-concordance-2014.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


def span(text,start,stop):
 if text.count(start)!=1:raise ValueError('Missing/ambiguous complete selected start')
 begin=text.index(start);end=text.find(stop,begin+len(start))
 if end<0:raise ValueError('Missing complete selected stop')
 return text[begin:end].strip()


def source_sections(raw):
 if sha(raw)!=CLASS_SHA:raise ValueError('Changed retained Wizard snapshot')
 h=helper();text=raw.decode('utf-8');starts=list(re.finditer(r'<div\b[^>]*class="card__body new-article"[^>]*>',text))
 if len(starts)!=1:raise ValueError('Ambiguous article body')
 footer=text.find('<div class="card__footer',starts[0].end())
 if footer<0:raise ValueError('Missing article footer')
 article=text[starts[0].end():footer];heads=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',article,re.S));ordinal=0;out=[]
 expected={13:('МУЛЬТИКЛАССИРОВАНИЕ И ВОЛШЕБНИК',4),16:('ХИТЫ',3),17:('ВЛАДЕНИЕ',5)}
 for i,x in enumerate(heads):
  title=h.visible(x[2])
  if not title:continue
  ordinal+=1
  if ordinal not in expected:continue
  body=article[x.end():heads[i+1].start()];ps=h.Paragraphs().result(body)
  if (title,len(ps))!=expected[ordinal]:raise ValueError('Changed entry scope/title/paragraph count')
  indexes=[2] if ordinal==13 else list(range(len(ps)))
  out.append({'headingOrdinal':ordinal,'title':title,'wholeBodySha256':sha(h.visible(body).encode()),'originalParagraphCount':len(ps),'comparedParagraphIndexes':indexes,'comparedParagraphSha256':[sha(ps[i].encode()) for i in indexes],'completeHeadingProseCompared':ordinal!=13})
 if [r['headingOrdinal'] for r in out]!=[13,16,17]:raise ValueError('Missing entry source scope')
 return out


def primary_scopes(pages,basic):
 if set(pages)!={52,57}:raise ValueError('Both SRD context pages required')
 specs=[('wizard-hit-points',52,'Hit Points Hit Dice:','Proficiencies'),('wizard-starting-proficiencies',52,'Proficiencies','Equipment You start'),('multiclass-hit-points-and-dice',57,'Hit Points and Hit Dice','Proficiency Bonus'),('multiclass-proficiency-context',57,'Proficiencies When you gain your first level','Class Features'),('multiclass-no-generic-starting-equipment',57,'Class Features When you gain a new level','Channel Divinity If you already have')]
 out=[]
 for kind,n,start,stop in specs:
  text=span(pages[n],start,stop)
  out.append({'kind':kind,'source':'srd51','pdfPage':n,'start':start,'stop':stop,'selectedTextSha256':sha(text.encode()),'wordCount':len(text.split()),'otherClassTableRowsAccepted':False})
 hp=span(basic,'Each time you gain a level, you gain 1 additional Hit Die.','When your Constitution modifier increases')
 if '(minimum of 1)' not in hp:raise ValueError('Missing explicit Basic minimum1 carrier clause')
 out.append({'kind':'basic-hp-gain-minimum-context','source':'basic2018','pdfPage':12,'start':'Each time you gain a level, you gain 1 additional Hit Die.','stop':'When your Constitution modifier increases','selectedTextSha256':sha(hp.encode()),'wordCount':len(hp.split()),'constitutionalRetroactivityParagraphCompared':False})
 return out


def audit(class_raw,srd_raw,basic_raw,*,rendered_pages_checked=False):
 if not rendered_pages_checked or sha(srd_raw)!=SRD_SHA or sha(basic_raw)!=BASIC_SHA:raise ValueError('Inspect exact primary entry/context carriers')
 import pypdfium2 as p
 srd=p.PdfDocument(srd_raw);basic=p.PdfDocument(basic_raw)
 pages={n:compact(srd[n-1].get_textpage().get_text_range()) for n in [52,57]};bt=compact(basic[11].get_textpage().get_text_range());primary=primary_scopes(pages,bt)
 if 'Wizard — Class Features' not in pages[57]:raise ValueError('Missing exact Wizard no-proficiencies table row')
 hp=span(pages[52],'Hit Points Hit Dice:','Proficiencies')
 if 'minimum' in hp.lower():raise ValueError('SRD carrier changed; minimum comparison requires reassessment')
 sections=source_sections(class_raw)
 return {'schemaVersion':1,'status':'bounded-entry-concordance-not-full-class-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
  'sources':{'secondary':{'url':'https://dnd.su/class/105-wizard/','sha256':CLASS_SHA,'retainedSnapshotNotHistoricalCandidateSnapshot':True,'originalHttpReceiptUnavailable':True},'srd':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SRD_SHA,'selectedPdfPages':[52,57]},'basic':{'url':'https://media.wizards.com/2018/dnd/downloads/DnD_BasicRules_2018.pdf','sha256':BASIC_SHA,'selectedPdfPages':[12]},'renderedPagesInspected':True},
  'secondaryScopes':sections,'primaryScopes':primary,
  'ordinarySelectedFacts':{'wizardHitDie':'d6','wizardCharacterFirstLevelHpBase':6,'laterLevelWizardFixedGainBeforeCon':4,'rolledAlternative':'1d6','initialCharacterLevelAndNewWizardClassLevelNotInterchangeable':True,'minimum1ExplicitInSrdWizardClassParagraph':False,'minimum1ExplicitInBasicGenericRolledTotalSentence':True,'minimumMarkerNotSilentlyInsertedIntoSrdText':True,
   'startingArmorProficiencies':[],'startingWeaponProficiencies':['daggers','darts','slings','quarterstaffs','light crossbows'],'startingToolProficiencies':[],'startingSavingThrows':['Intelligence','Wisdom'],'startingSkillChoices':{'choose':2,'from':['Arcana','History','Insight','Investigation','Medicine','Religion']},
   'wizardMulticlassProficienciesGrantedBySelectedTableRow':[],'wizardStartingSavingThrowsAutomaticallyGrantedOnMulticlass':False,'wizardClassFirstLevelAutomaticallyGetsCharacterFirstLevel6Hp':False,'mixedHitDiceTypesKeptSeparate':True,'startingEquipmentAutomaticallyRegrantedFromGenericClassStartingList':False,'specificSpellbookFeatureGrantDecidedByThisContext':False,'currentHpManufacturedFromMaximum':False},
  'manualAssessments':[{'kind':'hp-three-paragraphs','secondaryHeadingOrdinal':16,'primaryClassFactsAgree':True,'minimum1RequiresSeparateBasicCarrierContext':True,'literalSourceEqualityClaimed':False}, {'kind':'starting-proficiencies-five-paragraphs','secondaryHeadingOrdinal':17,'selectedKindsAndSkillSetAgree':True,'skillOrderDiffers':True,'secondarySkillOrder':['History','Arcana','Medicine','Insight','Investigation','Religion'],'primarySkillOrder':['Arcana','History','Insight','Investigation','Medicine','Religion'],'allGrantedOnMulticlass':False}, {'kind':'wizard-multiclass-no-proficiencies','secondaryHeadingOrdinal':13,'paragraphIndexes':[2],'otherThreeParagraphsCompared':False,'allTwelvePrimaryTableRowsAccepted':False}],
  'holds':{'equipment18IncludingFourChoicesAndAlternateWealth':'not compared in this report; full original body retained outside Git','multiclass13PrerequisiteAndSpellSlotParagraphs':'not accepted from proficiency-only comparison','minimum1Scope':'Basic marks rolled total; literal placement across carriers retained, no generic runtime clamp introduced','fullClassSourceVersionAndRights':'not accepted'},
  'summary':{'completeSecondaryEntryScopes':2,'completeEntryParagraphs':8,'selectedMulticlassParagraphs':1,'primaryContextScopes':6,'canonicalUnitsAccepted':0},
  'implementationBoundaries':{'manualDeviationWarnAndAllow':True,'oldProficienciesOrHpOverwritten':False,'runtimeAccepted':False},
  'inputSha256':{},'upstreamParserSha256':{'scripts/audit-wizard-candidate-concordance-2014.py':sha((ROOT/'scripts/audit-wizard-candidate-concordance-2014.py').read_bytes().replace(b'\r\n',b'\n'))},'generator':{'path':'scripts/audit-wizard-entry-boundaries-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}


if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--class-html',type=Path,required=True);p.add_argument('--srd',type=Path,required=True);p.add_argument('--basic',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--rendered-primary-pages-checked',action='store_true');a=p.parse_args()
 d=audit(a.class_html.read_bytes(),a.srd.read_bytes(),a.basic.read_bytes(),rendered_pages_checked=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));print(json.dumps(d['summary']))
