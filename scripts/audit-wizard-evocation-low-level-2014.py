"""Level2/6 Evocation selected source clauses, without higher-level/subclass/runtime acceptance."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
CLASS_SHA='5014af15fd61af05dde5bd29e19514b8fd87fe10ea60fbcd8a81f6574e2053c8'
SRD_SHA='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
MATRIX='catalog/wizard-artificer-source-scopes-2014.json'
def sha(raw):return hashlib.sha256(raw).hexdigest()
def compact(text):return ' '.join(text.split())
def module(name):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/name);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def secondary(raw,matrix):
 if sha(raw)!=CLASS_SHA:raise ValueError('Changed retained Wizard source')
 h=module('audit-wizard-candidate-concordance-2014.py');text=raw.decode('utf-8');start=list(re.finditer(r'<div\b[^>]*class="card__body new-article"[^>]*>',text))
 if len(start)!=1:raise ValueError('Ambiguous article body')
 footer=text.find('<div class="card__footer',start[0].end())
 if footer<0:raise ValueError('Missing footer')
 article=text[start[0].end():footer];heads=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',article,re.S));ordinal=0;out=[]
 for i,x in enumerate(heads):
  title=h.visible(x[2])
  if not title:continue
  ordinal+=1
  if ordinal not in [37,38,39]:continue
  body=article[x.end():heads[i+1].start()];paragraphs=h.Paragraphs().result(body)
  candidate=next(r['candidateReference'] for r in matrix['candidateRows'] if r['classSlug']=='wizard' and r['candidateReference']['headingOrdinal']==ordinal)
  if candidate['parent']!='tradition.evocation' or candidate['sourceIds']!=['102'] or candidate['title']!=title or len(paragraphs)!=2:raise ValueError('Changed Evocation candidate/complete paragraph scope')
  if not paragraphs[0].startswith(str(6 if ordinal==39 else 2)+'-й уровень,'):raise ValueError('Changed class feature level label')
  out.append({'originalCandidateReferencePreserved':candidate,'headingOrdinal':ordinal,'bodySha256':sha(h.visible(body).encode()),'paragraphSha256':[sha(p.encode()) for p in paragraphs],'paragraphCount':2,'firstParagraphIsLevelLabel':True,'completeSelectedParagraphsCompared':True,'fullSubclassOrOriginalPublicationAccepted':False})
 if [r['headingOrdinal'] for r in out]!=[37,38,39]:raise ValueError('Missing selected Evocation components')
 return out


def primary(text):
 h=module('audit-wizard-entry-boundaries-2014.py');text=compact(text)
 specs=[('evocation-savant','Evocation Savant Beginning when you select this school','Sculpt Spells Beginning at 2nd level'),('sculpt-spells','Sculpt Spells Beginning at 2nd level','Potent Cantrip Starting at 6th level'),('potent-cantrip','Potent Cantrip Starting at 6th level','Empowered Evocation Beginning at 10th level')]
 out=[]
 for key,start,stop in specs:
  value=h.span(text,start,stop);out.append({'key':key,'source':'srd51','pdfPage':54,'start':start,'stop':stop,'textSha256':sha(value.encode()),'wordCount':len(value.split())})
 return out


def audit(class_raw,srd_raw,*,rendered_pages_checked=False):
 if not rendered_pages_checked or sha(srd_raw)!=SRD_SHA:raise ValueError('Inspect exact primary Evocation page')
 import pypdfium2 as p
 pdf=p.PdfDocument(srd_raw);scopes=primary(pdf[53].get_textpage().get_text_range());matrix=json.loads((ROOT/MATRIX).read_text(encoding='utf-8'))
 return {'schemaVersion':1,'status':'bounded-low-level-evocation-concordance-not-full-subclass-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
  'sources':{'secondary':{'url':'https://dnd.su/class/105-wizard/','sha256':CLASS_SHA,'historicalCandidateSnapshotSha256':'f226111ed72d4f8be34c2cf3ecb0bba2f6486d2b3679187eeb4ec96e1e5ca9b1','historicalSnapshotNotReplaced':True,'originalHttpReceiptUnavailable':True},'srd':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SRD_SHA,'selectedPdfPages':[54]},'renderedPageInspected':True},
  'secondaryScopes':secondary(class_raw,matrix),'primaryScopes':scopes,
  'manualAssessments':[{'headingOrdinal':37,'primaryKey':'evocation-savant','classification':'same-school-book-copying-gold-and-time-halving','goldAndTimeBothHalved':True,'ordinaryScope':'copy an evocation spell into your spellbook','allSpellSchoolsHalfPrice':False,'castingComponentsOrItemPricesHalved':False,'newVsBackupCopyAdjudicationAddedByThisScope':False}, {'headingOrdinal':38,'primaryKey':'sculpt-spells','classification':'same-operational-qualifiers-with-different-introductory-summary','secondaryIntroBroadDestructiveSpellWordingRetained':True,'primaryIntroExplicitEvocationWordingRetained':True,'operationalSentenceRequiresEvocationSchoolInBoth':True,'literalIntroEqualityClaimed':False,'otherCreaturesRequired':True,'creaturesAffectedByTheCastSpellRequired':True,'casterMustSeeChosenCreatures':True,'sourceChosenCountExpression':'1 + spell level','chosenNumberWordingAdjudicatedAsMandatoryMinimum':False,'automaticSaveSuccessAgainstThatSpell':True,'zeroDamageOnlyWhenSuccessfulSaveNormallyHalvesDamage':True,'universalImmunityToAnyDamageOrOtherSpells':False,'selfAutomaticallyProtected':False}, {'headingOrdinal':39,'primaryKey':'potent-cantrip','classification':'same-damaging-cantrip-successful-save-half-damage-and-no-additional-effect','damagingCantripRequired':True,'targetSuccessfulSavingThrowRequired':True,'halfDamageIfAny':True,'additionalEffectsOnSuccessfulSave':False,'attackRollMissTriggersHalfDamage':False,'evocationOrWizardOnlyQualifierPresentInThisClause':False,'automaticRollOrDamageMutationAccepted':False}],
  'syntheticDecisionCases':[{'case':'copy-evocation-book-spell','goldMultiplier':0.5,'timeMultiplier':0.5,'normalMaterialCastingCostHalved':False}, {'case':'sculpt-different-school-or-unseen-or-caster','ordinarySculptProtectionAutomaticallyGranted':False,'manualExceptionSaveAllowed':True}, {'case':'successful-save-usually-negates-damage','sculptGuaranteesZeroDamageIndependentlyOfHalfOnSaveCondition':False}, {'case':'potent-cantrip-save-success','damageFractionIfAny':0.5,'additionalCantripEffectsApplied':False}, {'case':'potent-cantrip-attack-miss','automaticHalfDamage':False}],
  'summary':{'selectedSubclassFeatures':3,'secondaryParagraphsIncludingLevelLabels':6,'secondaryRuleProseParagraphs':3,'classLevelsCovered':[2,6],'completeSelectedPrimaryScopes':3,'canonicalUnitsAccepted':0},
  'limits':['No real character subclass inferred; source comparison only.','Parent narrative36 and level10/14features40/41 are not accepted by these selected clauses.','Original PHB source/version and all subclasses/rights/canonical units remain unaccepted.','No other-school/material/roll/choice/protection/damage automation; manual deviations warn and remain allowed.','The cantrip clause lacks an explicit school/class qualifier; do not inherit one from the subclass label.'],
  'implementationBoundaries':{'manualDeviationWarnAndAllow':True,'mandatoryGmCheckbox':False,'characterOrDamageMutationPerformed':False},
  'inputSha256':{MATRIX:sha((ROOT/MATRIX).read_bytes().replace(b'\r\n',b'\n'))},'upstreamParserSha256':{name:sha((ROOT/name).read_bytes().replace(b'\r\n',b'\n')) for name in ['scripts/audit-wizard-candidate-concordance-2014.py','scripts/audit-wizard-entry-boundaries-2014.py']},'generator':{'path':'scripts/audit-wizard-evocation-low-level-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--class-html',type=Path,required=True);p.add_argument('--srd',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--rendered-primary-pages-checked',action='store_true');a=p.parse_args()
 d=audit(a.class_html.read_bytes(),a.srd.read_bytes(),rendered_pages_checked=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));print(json.dumps(d['summary']))
