"""Selected Wizard tradition/ASI translation scopes with optional-feat context, not runtime."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
SOURCE_SHA='5014af15fd61af05dde5bd29e19514b8fd87fe10ea60fbcd8a81f6574e2053c8'
SRD_SHA='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
MATRIX='catalog/wizard-artificer-source-scopes-2014.json'
REUSED='catalog/rest-spellcasting-source-comparison-2014.json'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def module(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/name);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


def secondary_sections(raw):
 if sha(raw)!=SOURCE_SHA:raise ValueError('Changed retained Wizard snapshot')
 h=module('audit-wizard-candidate-concordance-2014.py');text=raw.decode('utf-8')
 start=list(re.finditer(r'<div\b[^>]*class="card__body new-article"[^>]*>',text))
 if len(start)!=1:raise ValueError('Ambiguous article body')
 footer=text.find('<div class="card__footer',start[0].end())
 if footer<0:raise ValueError('Missing article footer')
 article=text[start[0].end():footer];headings=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',article,re.S));ordinal=0;out=[]
 for i,x in enumerate(headings):
  title=h.visible(x[2])
  if not title:continue
  ordinal+=1
  if ordinal not in [30,32]:continue
  body=article[x.end():headings[i+1].start()];paragraphs=h.Paragraphs().result(body)
  if title!={30:'МАГИЧЕСКИЕ ТРАДИЦИИ',32:'УВЕЛИЧЕНИЕ ХАРАКТЕРИСТИК'}[ordinal] or len(paragraphs)!=3:raise ValueError('Changed complete selected heading/paragraph boundary')
  out.append({'headingOrdinal':ordinal,'title':title,'bodySha256':sha(h.visible(body).encode()),'paragraphSha256':[sha(p.encode()) for p in paragraphs], 'paragraphCountIncludingLevelLabel':3,'firstParagraphKind':'level-and-feature-label','remainingParagraphCount':2})
 if [r['headingOrdinal'] for r in out]!=[30,32]:raise ValueError('Missing selected core scope')
 return out


def selected_primary(pages):
 h=module('audit-general-casting-clauses-2014.py')
 if set(pages)!={53,75}:raise ValueError('Both primary context pages required')
 specs=[('tradition',[53],'Arcane Tradition','Ability Score Improvement'),('asi-reused',[53],'Ability Score Improvement','Spell Mastery'),('optional-feats-context',[75],'Feats','Grappler Prerequisite: Strength 13 or higher')]
 out=[]
 for kind,numbers,start,stop in specs:
  text=h.selected_span(pages,numbers,start,stop)
  out.append({'kind':kind,'pdfPages':numbers,'start':start,'stop':stop,'textSha256':sha(text.encode()),'wordCount':len(text.split()),'wholeFollowingFeatureIncluded':False})
 return out


def audit(class_raw,srd_raw,*,rendered_pages_checked=False):
 if not rendered_pages_checked or sha(srd_raw)!=SRD_SHA:raise ValueError('Inspect exact primary source pages')
 h=module('audit-general-casting-clauses-2014.py');pages=h.primary_pages(srd_raw,SRD_SHA,[53,75]);primary=selected_primary(pages);secondary=secondary_sections(class_raw)
 matrix=json.loads((ROOT/MATRIX).read_text(encoding='utf-8'));reused=json.loads((ROOT/REUSED).read_text(encoding='utf-8'))
 unit=next(r for r in reused['units'] if r['key']=='wizard-asi-levels')
 if unit['facts']!={'wizardClassLevels':[4,8,12,16,19],'ordinaryOptions':{'oneAbilityIncrease':2,'twoAbilityIncreasesEach':1},'ordinaryAbilityCap':20}:raise ValueError('Reused primary ASI context changed; reassess')
 selected=[]
 for suffix,section in zip(['feature.arcane-tradition','feature.ASI'],secondary):
  original=next(r['candidateReference'] for r in matrix['candidateRows'] if r['candidateReference']['id']=='scope:wizard:class-features:'+suffix)
  if original['headingOrdinal']!=section['headingOrdinal'] or original['sourceIds']!=['102']:raise ValueError('Original candidate identity/source claims changed')
  selected.append({'originalCandidateReferencePreserved':original,'secondaryWitness':section,'primaryEvidenceKind':'tradition' if suffix.endswith('tradition') else 'asi-reused',
                   'candidateFullClassOrOriginalPublicationAccepted':False,'automationAccepted':False})
 inputs=[MATRIX,REUSED,'scripts/audit-wizard-candidate-concordance-2014.py','scripts/audit-general-casting-clauses-2014.py']
 return {'schemaVersion':1,'status':'bounded-core-choice-concordance-not-full-class-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
  'sources':{'secondary':{'url':'https://dnd.su/class/105-wizard/','sha256':SOURCE_SHA,'historicalCandidateSnapshotSha256':'f226111ed72d4f8be34c2cf3ecb0bba2f6486d2b3679187eeb4ec96e1e5ca9b1','sameAsHistoricalCandidateSnapshot':False,'receiptBasis':'retained public HTML; original HTTP receipt unavailable'},'srd':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SRD_SHA,'renderedPagesChecked':[53,75]}},
  'primaryScopes':primary,'primaryAsiContextReused':{'path':REUSED,'unitKey':'wizard-asi-levels','sourceFacts':unit['facts'],'newPrimaryAsiDiscoveryClaimed':False},'secondaryScopes':selected,
  'manualAssessments':[{'key':'tradition-progression','secondaryHeadingOrdinal':30,'paragraphIndexes':[0,1,2],'classification':'same-entry-and-progression-levels-with-source-specific-description','ordinaryWizardClassLevels':[2,6,10,14], 'primaryEightSchoolsAndEvocationExampleNotRepeatedLiterally':True,'secondaryNavigationToClassEndNotVerifiedAsOfficialSubclassCatalog':True,'allSchoolsAutomaticallyGranted':False},
   {'key':'asi-core','secondaryHeadingOrdinal':32,'paragraphIndexes':[0,1],'classification':'same-selected-levels-options-and-feature-local-cap','ordinaryWizardClassLevels':[4,8,12,16,19],'abilityOptions':{'oneAbilityBy':2,'twoDistinctAbilitiesEachBy':1},'ordinaryCapUsingThisFeature':20,'capIsUniversalForEveryItemBuffOrManualProfile':False,'characterTotalLevelsUsedInsteadOfWizardLevels':False,'importedAsiAppliedAgain':False},
   {'key':'asi-optional-feat-insert','secondaryHeadingOrdinal':32,'paragraphIndexes':[2],'classification':'optional-rule-context-outside-primary-class-asi-paragraph','primaryContext':'optional-feats-context','inLieuOfAsiNotAnAdditionalAsi':True,'ordinaryFeatRepeatAndPrerequisitesComeFromFeatContext':True,'wholeFeatContextTranslatedByThisSingleParagraph':False,'grapplerBenefitsOrAllFeatsAccepted':False}],
  'implementationBoundaries':{'ordinaryGameDeviationsWarnAndAllowManual':True,'gmAgreementCheckboxRequired':False,'technicalIntegrityChecksUnchanged':True,'automaticClassChoiceMade':False,'automaticCapabilityAccepted':False},
  'syntheticDecisionCases':[{'wizardClassLevel':3,'otherClassLevel':1,'totalLevel':4,'ordinaryWizardAsiDueAtThisWizardLevel':False}, {'wizardClassLevel':4,'otherClassLevel':3,'totalLevel':7,'ordinaryWizardAsiDueAtThisWizardLevel':True,'choiceRequired':True,'alreadyImportedImprovementReapplied':False}, {'wizardClassLevel':4,'manualAbilityScore':21,'ordinaryCapWarning':True,'manualSaveAllowed':True,'automaticIncreaseWithoutChoice':False}],
  'summary':{'selectedCandidateScopes':2,'secondaryParagraphsIncludingLevelLabels':6,'secondaryRuleProseParagraphs':4,'separateLevelLabels':2,'newSelectedPrimaryScopes':2,'reusedAsiPrimaryScopes':1,'manualAssessments':3,'canonicalUnitsAccepted':0},
  'limits':['Selected translation comparison does not validate historical PHB source/version or a full Wizard class.','Cantrip Formulas/TCE31 remains separate and unverified; no inheritance from neighboring feature.','Feature-local cap/ordinary optional-feat prerequisites are warnings for deviations, not technical profile locks.','No subclass catalogs, all feat texts, runtime or canonical denominator accepted.'],
  'inputSha256':{path:sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')) for path in inputs if path.startswith('catalog/')},'upstreamParserSha256':{path:sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')) for path in inputs if path.startswith('scripts/')}, 'generator':{'path':'scripts/audit-wizard-core-choices-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}


if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--class-html',type=Path,required=True);p.add_argument('--srd',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--rendered-primary-pages-checked',action='store_true');a=p.parse_args()
 d=audit(a.class_html.read_bytes(),a.srd.read_bytes(),rendered_pages_checked=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));print(json.dumps(d['summary']))
