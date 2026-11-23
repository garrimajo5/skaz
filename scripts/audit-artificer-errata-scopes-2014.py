"""Retain six bounded Artificer errata clauses with source-specific applicability and safety outcomes."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from pypdf import PdfReader
HELPER=Path(__file__).with_name('audit-wizard-recovery-source-comparison-2014.py')
s=importlib.util.spec_from_file_location('errata_words',HELPER);R=importlib.util.module_from_spec(s);s.loader.exec_module(R)
PINS={'eberron-errata.pdf':('https://media.wizards.com/2020/dnd/downloads/ERftLW-Errata.pdf','94f194059290862f626f883fac83866e665655c7b4987405e17d71a9d4b4026d',2,'2.0','119'),
      'tasha-errata.pdf':('https://media.wizards.com/2021/dnd/downloads/TCE-Errata.pdf','471b401d7c44c23c3f880fa2ca5d1e9b26abd87cc673a27ba614c9fea371dbd9',1,'1.0','117')}
UNITS=[('magical-tinkering','eberron-errata.pdf','Magical Tinkering (p. 55).','Tools Required (p. 55).','replacement-phrase','feature.magical-tinkering'),
       ('tools-material-clarification','eberron-errata.pdf','Tools Required (p. 55).','Infusing an Item (p. 57).','added-clarification','feature.spellcasting'),
       ('infused-container-contents','eberron-errata.pdf','Infusing an Item (p. 57).','The Right Tool for the Job (p. 57).','whole-added-paragraph','feature.infuse-item'),
       ('right-tool','eberron-errata.pdf','The Right Tool for the Job (p. 57).','Eldritch Cannon (p. 59).','replacement-phrase','feature.right-tool-for-the-job'),
       ('purify-ritual-tag','tasha-errata.pdf','Artificer Spell List (pg. 12).','Perfected Armor (pg. 17).','added-spell-list-marker','feature.spellcasting'),
       ('repeating-shot-ammunition','tasha-errata.pdf','Repeating Shot (pg. 22).','Animating Performance (pg. 29).','whole-replacement-sentence','infusion-choice-index')]
INPUTS=['catalog/dndsu-source-register.json','catalog/wizard-artificer-source-scopes-2014.json']

def sha(raw):return hashlib.sha256(raw).hexdigest()

def selected(text,start,stop):
    text=R.words(text);starts=[m.start() for m in re.finditer(re.escape(start),text)]
    if len(starts)!=1:raise ValueError('Missing/ambiguous selected errata heading')
    end=text.find(stop,starts[0]+len(start))
    if end<0:raise ValueError('Missing next errata boundary')
    raw=text[starts[0]+len(start):end].strip();value=raw;repairs={}
    for name,pattern,replacement in [('verifiedArtisanWrap',r'\barti\s*-\s*san(?=’s)','artisan'),('verifiedAutomaticallyWrap',r'\bautomat\s*-\s*ically\b','automatically')]:
        value,n=re.subn(pattern,replacement,value);repairs[name]=n
        if n>1:raise ValueError('Unexpected repeated discretionary wrap')
    return value,{'whitespaceUnitSha256':sha(raw.encode()),'normalizedUnitSha256':sha(value.encode()),'layoutRepairs':repairs,'boundaryStop':'first-next-heading'}

def ordinary_facts(key,text):
    required={
      'magical-tinkering':['changed to','thieves’ tools','artisan’s tools'],
      'tools-material-clarification':['added','second sentence','‘M’','when you cast it'],
      'infused-container-contents':['If an infusion ends','contains other things','like a bag of holding','harmlessly appear','in and around its space'],
      'right-tool':['first sentence','changed','with thieves’ tools or artisan’s tools'],
      'purify-ritual-tag':['purify food and drink','“(ritual)” has been added'],
      'repeating-shot-ammunition':['second paragraph','first sentence','If the weapon lacks ammunition','one piece of magic ammunition','when the wielder makes a ranged attack with it']}
    if any(t not in text for t in required[key]):raise ValueError('Changed selected correction conditions')
    return {
      'magical-tinkering':{'correctedToolAlternatives':['thieves-tools','artisans-tools'],'completeFeatureVerified':False},
      'tools-material-clarification':{'patchClarifiesMaterialComponentWhenCastingThroughThisFeature':True,'otherClassSpellsChanged':False,'costlyOrConsumedMaterialExceptionInferred':False,'completeToolsRequiredVerified':False},
      'infused-container-contents':{'trigger':'infusion-ends-on-item-containing-other-things','ordinaryOutcome':'contents-harmlessly-appear-in-and-around-item-space','bagOfHoldingIsExampleNotOnlyContainer':True,'itemDestroyedOrOtherExtradimensionalEventsCovered':False,'completeInfuseItemVerified':False},
      'right-tool':{'correctedToolAlternatives':['thieves-tools','artisans-tools'],'completeFeatureVerified':False},
      'purify-ritual-tag':{'spellTitle':'Purify Food and Drink','artificerListRitualMarkerAdded':True,'spellAutomaticallyPreparedOrWizardBookGranted':False,'completeArtificerRitualRuleVerified':False},
      'repeating-shot-ammunition':{'condition':'weapon-lacks-ammunition','productionTrigger':'wielder-makes-ranged-attack-with-weapon','producedMagicAmmunitionPerTrigger':1,'unconditionalStockpileGranted':False,'wholeInfusionVerified':False}}[key]

def audit(folder,root=Path('.')):
    folder=Path(folder);caps=json.loads((folder/'capture.json').read_text(encoding='utf-8'));pages={};sources={}
    for file,(url,digest,count,version,pid) in PINS.items():
        raw=(folder/file).read_bytes();c=caps[file]
        if c['requestedUrl']!=url or c['finalUrl']!=url or c['status']!=200 or c['outcome']!='complete' or c['bytes']!=len(raw) or c['sha256']!=digest or sha(raw)!=digest:raise ValueError('Pinned official errata capture mismatch')
        pdf=PdfReader(folder/file)
        if len(pdf.pages)!=count:raise ValueError('Wrong errata page count')
        text=pdf.pages[0].extract_text();normalized=R.words(text)
        if 'Version '+version not in normalized or 'Wizards of the Coast' not in normalized:raise ValueError('Wrong errata version/publisher')
        pages[file]=text;sources[file]={k:c[k] for k in ['requestedUrl','finalUrl','status','bytes','sha256','capturedAt']};sources[file].update(pdfPageCount=count,inspectedPdfPages=[1],errataVersion=version,historicalBookSourceId=pid)
    texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};register,mapping=[json.loads(t) for t in texts.values()]
    titles={r['sourceId']:r['title'] for r in register['sources']}
    if titles.get('119')!='Eberron: Rising from the Last War' or titles.get('117')!="Tasha's Cauldron of Everything":raise ValueError('Changed historical book namespace')
    candidates={r['candidateReference']['id']:r for r in mapping['candidateRows']};records=[]
    for key,file,start,stop,kind,fragment in UNITS:
        text,witness=selected(pages[file],start,stop);pid=PINS[file][4];candidate_id='scope:artificer:class-features:'+fragment if fragment!='infusion-choice-index' else None
        if candidate_id and candidate_id not in candidates:raise ValueError('Missing existing Artificer candidate link')
        records.append({'key':key,'sourceFile':file,'pdfPage':1,'historicalBookSourceId':pid,'bookTitle':titles[pid],
            'startHeading':start,'stopHeading':stop,'scopeKind':kind,'witness':witness,'ordinaryFacts':ordinary_facts(key,text),
            'correspondingCandidateId':candidate_id,'candidateOriginalSourceClaims':candidates[candidate_id]['candidateReference']['sourceIds'] if candidate_id else None,
            'appliesToCandidatePublicationVerified':False,'applicabilityStatus':'requires-full-candidate-text/version-comparison-even-when-book-id-matches',
            'acceptedForRuntime':False,'manualDeviationAllowedWithWarning':True})
    return {'schemaVersion':1,'status':'six-source-specific-errata-clauses-not-complete-artificer-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,
        'acceptedForRuntime':False,'runtimeChanged':False,'sources':sources,'records':records,
        'summary':{'selectedCorrections':6,'sourceBooks':2,'wholeBaseFeaturesAccepted':0,'canonicalUnitsAccepted':0},
        'syntheticCases':[{'event':'infusion-ends','itemContainsOtherThings':True,'correctedPublicationVerified':True,'expected':'contents-appear-harmlessly-in-and-around-item-space'},
            {'event':'item-destroyed','itemContainsOtherThings':True,'correctedPublicationVerified':True,'expected':'outside-this-added-paragraph-no-outcome-inferred'},
            {'event':'infusion-still-active','itemContainsOtherThings':True,'correctedPublicationVerified':True,'expected':'no-trigger-from-this-patch'},
            {'event':'infusion-ends','itemContainsOtherThings':True,'correctedPublicationVerified':False,'expected':'version/source-warning-before-any-future-automation'},
            {'event':'ritual-tag-added-to-list','expected':'not-automatic-preparation-or-spellbook-entry'},
            {'event':'repeating-shot-equipped-only','expected':'no-unconditional-ammunition-stockpile'}],
        'inputSha256':{p:sha(t.encode()) for p,t in texts.items()},
        'generator':{'path':'scripts/audit-artificer-errata-scopes-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
        'upstreamParser':{'path':'scripts/'+HELPER.name,'sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
        'limits':['Errata119 patches are not automatically applied to candidate source117; named matching features do not establish edition/text identity.',
            'Only six selected clauses on PDFpage1 are inspected; remaining pages, whole infusions/spellcasting/subclasses are not accepted.',
            'A full added paragraph or replacement sentence is not a full base feature or an implemented game action.',
            'No global inventory-delete/destruction rule, Wizard ritual borrowing, cost/consumption exemption or auto grant inferred.',
            'Ordinary deviations warn and keep a manual route; integrity/access/transfer technical protections are unchanged.',
            'No full prose, PDF, profile data, runtime, publication rights or owner milestone acceptance exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');p.add_argument('--output');a=p.parse_args();d=audit(a.folder)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps(d['summary']))
