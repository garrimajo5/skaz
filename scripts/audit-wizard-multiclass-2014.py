"""Selected Wizard multiclass summary versus complete bounded primary casting context."""
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
ENTRY='catalog/wizard-entry-boundaries-2014.json'
WIZARD_TABLE='catalog/wizard-table-concordance-2014.json'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def compact(text):return ' '.join(text.split())
def module(name):
 s=importlib.util.spec_from_file_location(name,ROOT/'scripts'/name);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def secondary(raw,entry):
 if sha(raw)!=CLASS_SHA:raise ValueError('Changed retained Wizard HTML')
 h=module('audit-wizard-candidate-concordance-2014.py');text=raw.decode('utf-8');start=list(re.finditer(r'<div\b[^>]*class="card__body new-article"[^>]*>',text))
 if len(start)!=1:raise ValueError('Ambiguous body')
 footer=text.find('<div class="card__footer',start[0].end())
 if footer<0:raise ValueError('Missing footer')
 article=text[start[0].end():footer];heads=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',article,re.S));ordinal=0
 for i,x in enumerate(heads):
  title=h.visible(x[2])
  if not title:continue
  ordinal+=1
  if ordinal!=13:continue
  if title!='МУЛЬТИКЛАССИРОВАНИЕ И ВОЛШЕБНИК':raise ValueError('Changed selected heading')
  body=article[x.end():heads[i+1].start()];paragraphs=h.Paragraphs().result(body)
  if len(paragraphs)!=4:raise ValueError('Selected multiclass heading must retain four paragraphs')
  prior=next(r for r in entry['secondaryScopes'] if r['headingOrdinal']==13)
  if prior['wholeBodySha256']!=sha(h.visible(body).encode()) or prior['comparedParagraphIndexes']!=[2] or prior['comparedParagraphSha256']!=[sha(paragraphs[2].encode())]:raise ValueError('Previously reviewed proficiency paragraph/source identity changed')
  return {'headingOrdinal':13,'title':title,'wholeBodySha256':sha(h.visible(body).encode()),'wholeBodyRead':True,'paragraphCount':4,'newComparedParagraphIndexes':[0,1,3],'newParagraphSha256':[sha(paragraphs[n].encode()) for n in [0,1,3]],'reusedProficiencyParagraph':{'path':ENTRY,'paragraphIndex':2,'paragraphSha256':sha(paragraphs[2].encode())},'wholePrimaryMulticlassRulesRepresentedByThisHeading':False}
 raise ValueError('Missing Wizard13')


def full_context(pages,basic_text):
 if set(pages)!={56,57,58}:raise ValueError('Primary prologue/continuation/table pages all required')
 text={}
 for n,value in pages.items():
  header=f'System Reference Document 5.1 {n} ';normalized=compact(value)
  if not normalized.startswith(header):raise ValueError('Unexpected primary page header')
  text[n]=normalized[len(header):]
 h=module('audit-wizard-entry-boundaries-2014.py')
 prologue=h.span(text[56],'Multiclassing Multiclassing allows you','Prerequisites To qualify')
 prerequisite=h.span(text[56],'Prerequisites To qualify','Multiclassing Prerequisites Class Ability Score Minimum')
 if 'both your current class and your new one' not in prerequisite or 'Wizard Intelligence 13' not in text[56]:raise ValueError('Lost both-class prerequisite or exact Wizard row')
 start='Spellcasting Your capacity for spellcasting';stop='Multiclass Spellcaster: Spell Slots per Spell Level'
 casting=h.span(text[57]+' '+text[58],start,stop)
 if not casting.endswith('to cast warlock spells you know.'):raise ValueError('Missing final Pact Magic cross-cast condition')
 if 'If you multiclass but have the Spellcasting feature from only one class' not in casting:raise ValueError('Lost cross-page single-Spellcasting condition')
 intro=h.span(compact(basic_text),'The combination of ability scores, race, class, and background','Multiclassing Multiclassing allows you')
 if 'two optional sets of rules' not in intro or 'Your DM decides whether these options are available in a campaign.' not in intro:raise ValueError('Lost campaign-level optional-rule context')
 specs=[('multiclass-prologue','srd51',[56],prologue),('both-class-prerequisites','srd51',[56],prerequisite),('complete-selected-casting-context','srd51',[57,58],casting),('optional-rules-campaign-context','basic2018',[58],intro)]
 return [{'kind':kind,'source':source,'pdfPages':numbers,'textSha256':sha(value.encode()),'wordCount':len(value.split())} for kind,source,numbers,value in specs]


def slot_table(text,verified_wizard_rows):
 h=module('audit-wizard-entry-boundaries-2014.py');start='Multiclass Spellcaster: Spell Slots per Spell Level Lvl. 1st 2nd 3rd 4th 5th 6th 7th 8th 9th';selected=h.span(compact(text),start,'Alignment A typical creature')
 tokens=selected[len(start):].split()
 if len(tokens)!=200:raise ValueError('Twenty complete ordinal plus nine-cell rows required')
 rows=[];seen_dashes=set()
 for i in range(20):
  label,*cells=tokens[i*10:(i+1)*10];n=i+1;expected=str(n)+({1:'st',2:'nd',3:'rd'}.get(n,'th'))
  if label!=expected:raise ValueError('Missing/out-of-order caster table level')
  slots=[]
  for cell in cells:
   if cell=='—':seen_dashes.add(cell);slots.append(0)
   elif re.fullmatch(r'[1-4]',cell):slots.append(int(cell))
   else:raise ValueError('Unknown table token cannot become zero')
  rows.append({'effectiveCasterLevel':n,'spellSlots':slots})
 expected=[{'effectiveCasterLevel':r['level'],'spellSlots':r['spellSlots']} for r in verified_wizard_rows]
 if rows!=expected:raise ValueError('Multiclass table differs from bounded previously reviewed Wizard slot projection')
 return {'source':'srd51','pdfPage':58,'start':start,'stop':'Alignment A typical creature','textSha256':sha(selected.encode()),'rows':rows,'numericCellsCompared':180,'explicitDashGlyphsRepresentedAsZero':sorted(seen_dashes),'priorWizardNumericProjectionReusedNotFullRuleEquality':True,'characterLevelOrKnownSpellCircleColumn':False}


def audit(class_raw,srd_raw,basic_raw,*,rendered_pages_checked=False):
 if not rendered_pages_checked or sha(srd_raw)!=SRD_SHA or sha(basic_raw)!=BASIC_SHA:raise ValueError('Inspect exact primary sources')
 import pypdfium2 as p
 pdf=p.PdfDocument(srd_raw);basic=p.PdfDocument(basic_raw);pages={n:pdf[n-1].get_textpage().get_text_range() for n in [56,57,58]}
 entry=json.loads((ROOT/ENTRY).read_text(encoding='utf-8'));table=json.loads((ROOT/WIZARD_TABLE).read_text(encoding='utf-8'))
 context=full_context(pages,basic[57].get_textpage().get_text_range());slots=slot_table(pages[58],table['table']['rows'])
 return {'schemaVersion':1,'status':'bounded-wizard-multiclass-summary-not-complete-class-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
  'sources':{'secondary':{'url':'https://dnd.su/class/105-wizard/','sha256':CLASS_SHA,'originalHttpReceiptUnavailable':True,'historicalCandidateSnapshotNotReplaced':True},'srd':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SRD_SHA,'pdfPages':[56,57,58]},'basic':{'url':'https://media.wizards.com/2018/dnd/downloads/DnD_BasicRules_2018.pdf','sha256':BASIC_SHA,'pdfPages':[58]},'renderedPagesInspected':True},
  'secondaryHeading':secondary(class_raw,entry),'primaryContexts':context,'slotTableWitness':slots,
  'manualAssessments':[{'paragraphIndex':0,'kind':'optional-rule-source-context','secondaryReferenceToPhbNotTreatedAsProofOfHistoricalPhbVersion':True,'campaignRuleChoiceCorroboratedByBasic58':True,'mandatoryGmCheckboxForManualSave':False}, {'paragraphIndex':1,'kind':'wizard-specific-Int13-prerequisite','minimumIntelligence':13,'appliesEnteringWizardOrLeavingWizardForAnotherClass':True,'primaryBothCurrentAndNewClassPrerequisitesRetained':True,'otherClassPrerequisitesContainedInWizardSentence':False,'allTwelveClassPrerequisiteRowsAccepted':False}, {'paragraphIndex':3,'kind':'condensed-wizard-slot-contribution-reference','wizardLevelsCountAsFullSpellcastingLevels':True,'wholePrimaryFormulaTranslatedByOneSentence':False,'higherSlotsTeachOrPrepareHigherCircleAutomatically':False,'artificerOrThirdCasterFormulaInferredFromSrdList':False}],
  'ordinarySelectedFacts':{'campaignMulticlassRuleOptional':True,'singleSpellcastingClassUsesThatClassRules':True,'eachClassKnownAndPreparedAsSingleClassIndividually':True,'castingAbilityAndFocusAssociatedWithClass':True,'exampleWizardBookTenSpellsIsHardCapacityLimit':False,'srdFullCasterClasses':['bard','cleric','druid','sorcerer','wizard'],'srdHalfCasterClasses':['paladin','ranger'],'srdHalfCasterRounding':'down','aggregationOfMultipleOddHalfCastersAdjudicatedByThisReport':False,'artificerRoundingOrEldritchKnightArcaneTricksterRulesAccepted':False,'unsupportedClassContributionSilentlyTreatedAsZero':False,'higherSlotsCanUpcastKnownLowerSpellsOnlyWhenSpellProvidesEnhancement':True,'everySpellAutomaticallyGainsDice':False,'pactMagicAddsWarlockLevelsToThisGeneralFormula':False,'pactSlotsCanCastKnownOrPreparedSpellcastingClassSpells':True,'spellcastingSlotsCanCastKnownWarlockSpells':True,'pactRechargeCountsOrPoolMergingEstablishedByThisScope':False},
  'syntheticDecisionCases':[{'case':'source-ranger4-wizard3','effectiveCasterLevel':5,'slotsFirstThreeCircles':[4,3,2],'ordinaryWizardHighestCircle':2,'ordinaryRangerHighestCircle':1,'thirdCircleKnownSpellsAutomaticallyGranted':False}, {'case':'ranger4-wizard3-example-book','exampleBookSpells':10,'exampleWizardCantrips':3,'intelligence':16,'preparedWizardSpells':6,'additionalCopiedWizardSpellsForbidden':False}, {'case':'wizard-and-pact','crossCastKnownClassSpellsAllowed':True,'poolsAndRechargeMerged':False,'warlockLevelsAddedToGeneralSrdFormula':False}, {'case':'artificer3-wizard6-source-gap','effectiveCasterLevelVerifiedFromTheseSources':None,'manualProfileSaveAllowed':True,'unsupportedSourceFilledWithZero':False}, {'case':'manual-higher-circle-known','ordinaryClassLimitWarning':True,'manualSaveAllowed':True,'gmCheckboxMandatory':False}],
  'limits':['All four secondary paragraphs now have bounded witnesses, but the heading is still a class-specific summary, not full primary multiclass rules.','Pact Magic interoperability does not establish slot counts/recovery or teach extra spells.','Artificer and one-third-caster formulas require exact primary scopes; they are not zero or inherited from Wizard.','Full class/source/version/rights and canonical denominator remain unaccepted.','Game-rule deviations warn and allow manual input; technical access/integrity/replay boundaries do not change.'],
  'summary':{'newSecondaryParagraphs':3,'previouslyComparedParagraphsReused':1,'selectedPrimaryContexts':4,'tableRows':20,'tableNumericCells':180,'wholeTranslatedPrimaryMulticlassRulesAccepted':False,'canonicalUnitsAccepted':0},
  'inputSha256':{name:sha((ROOT/name).read_bytes().replace(b'\r\n',b'\n')) for name in [ENTRY,WIZARD_TABLE]},'upstreamParserSha256':{name:sha((ROOT/name).read_bytes().replace(b'\r\n',b'\n')) for name in ['scripts/audit-wizard-candidate-concordance-2014.py','scripts/audit-wizard-entry-boundaries-2014.py']},'generator':{'path':'scripts/audit-wizard-multiclass-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--class-html',type=Path,required=True);p.add_argument('--srd',type=Path,required=True);p.add_argument('--basic',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--rendered-primary-pages-checked',action='store_true');a=p.parse_args()
 d=audit(a.class_html.read_bytes(),a.srd.read_bytes(),a.basic.read_bytes(),rendered_pages_checked=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));print(json.dumps(d['summary']))
