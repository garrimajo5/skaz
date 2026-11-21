"""Compare one complete Wizard ritual subsection across retained 2014 carriers, without runtime changes."""
import argparse
import hashlib
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
from pypdf import PdfReader
HELPER=Path(__file__).with_name('audit-wizard-recovery-source-comparison-2014.py')
s=importlib.util.spec_from_file_location('ritual_typography',HELPER);R=importlib.util.module_from_spec(s);s.loader.exec_module(R)
INPUTS=['catalog/basic-rules-publication-boundary-2014.json','catalog/srd51-class-features.json','catalog/rest-spellcasting-source-comparison-2014.json']

def sha(raw):return hashlib.sha256(raw).hexdigest()

class RitualParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.depth=0;self.containers=0;self.wizard=False;self.base=False;self.spellcasting=False
        self.collect=False;self.pending=False;self.starts=0;self.stops=0;self.wizard_sections=0;self.base_sections=0;self.spellcasting_sections=0;self.para=None;self.paragraphs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);id=a.get('id')
        if tag=='div':
            if 'p-article-content' in a.get('class','').split():
                if self.depth:raise ValueError('Nested content containers')
                self.depth=1;self.containers+=1
            elif self.depth:self.depth+=1
        if not self.depth:return
        if self.collect and tag in ['h1','h2','h3','h4','h5','h6'] and not(tag=='h4' and id=='SpellcastingFocus7'):raise ValueError('Unexpected heading inside selected ritual subsection')
        if tag=='h2':
            if id=='Wizard':self.wizard=True;self.base=False;self.spellcasting=False;self.wizard_sections+=1
            elif id=='ClassFeatures12' and self.wizard:self.base=True;self.base_sections+=1
            else:self.wizard=False;self.base=False;self.spellcasting=False
        if tag=='h3':
            self.spellcasting=id=='WizardSpellcasting' and self.wizard and self.base
            if self.spellcasting:self.spellcasting_sections+=1
        if tag=='h4' and id=='RitualCasting4':
            if not self.spellcasting:raise ValueError('Ritual subsection outside Wizard base Spellcasting')
            self.starts+=1;self.pending=True
        if tag=='h4' and id=='SpellcastingFocus7':
            if not self.collect or self.starts!=1 or self.para is not None:raise ValueError('Wrong ritual boundary order')
            self.stops+=1;self.collect=False
        if self.collect:
            if tag=='p':
                if self.para is not None:raise ValueError('Nested or unclosed selected paragraph')
                self.para=[]
            elif tag not in ['em','strong','b','i','a','span','br'] or self.para is None:
                raise ValueError('Unexpected nonparagraph content inside selected subsection')
            elif tag=='br':self.para.append(' ')

    def handle_data(self,data):
        if self.collect and self.para is None and data.strip():raise ValueError('Visible text outside selected paragraph')
        if self.para is not None:self.para.append(data)
    def handle_endtag(self,tag):
        if not self.depth:return
        if tag=='h4' and self.pending:self.pending=False;self.collect=True
        if tag=='p' and self.collect:
            if self.para is None:raise ValueError('Unpaired selected paragraph close')
            self.paragraphs.append(R.words(''.join(self.para)));self.para=None
        if tag=='div':self.depth-=1
    def result(self,html):
        self.feed(html);self.close()
        if self.containers!=1 or self.depth or self.collect or self.starts!=1 or self.stops!=1 or len(self.paragraphs)!=1 or (self.wizard_sections,self.base_sections,self.spellcasting_sections)!=(1,1,1):raise ValueError('Missing/ambiguous complete single-paragraph ritual subsection')
        return self.paragraphs[0]

def pdf_unit(text):
    lines=text.splitlines();starts=[i for i,line in enumerate(lines) if R.words(line)=='Ritual Casting'];stops=[i for i,line in enumerate(lines) if R.words(line)=='Spellcasting Focus']
    if len(starts)!=1 or len(stops)!=1 or starts[0]>=stops[0]:raise ValueError('Wrong exact PDF ritual boundaries')
    return '\n'.join(lines[starts[0]+1:stops[0]])

def facts(text):
    if any(t not in text for t in ['wizard spell','ritual tag','in your spellbook','You don’t need to have the spell prepared.']):raise ValueError('Changed ritual class/tag/book/preparation condition')
    return {'spellMustBeWizardSpell':True,'spellMustHaveRitualTag':True,'spellMustBeInWizardSpellbook':True,'preparationRequiredByThisFeature':False,
            'allKnownOrOtherClassSpellsAutomaticallyRitual':False,'artificerOrOtherClassRitualRuleInferred':False,
            'durationOrSlotExpenditureEstablishedByThisSubsection':False,'manualDeviationAllowedWithWarning':True}

def audit(web_folder,pdf_folder,root=Path('.')):
    web_folder=Path(web_folder);pdf_folder=Path(pdf_folder);cap=json.loads((web_folder/'capture.json').read_text(encoding='utf-8'));raw=(web_folder/'classes.html').read_bytes()
    if cap['requestedUrl']!=R.WEB_URL or cap['finalUrl']!=R.WEB_FINAL or cap['status']!=200 or cap['bytes']!=len(raw) or cap['sha256']!=R.WEB_SHA or sha(raw)!=R.WEB_SHA:raise ValueError('Changed retained digital class capture')
    texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};basic,features,prior=[json.loads(t) for t in texts.values()]
    values={'digital':RitualParser().result(raw.decode('utf-8'))};sources={'digital':cap};pdfcaps=json.loads((pdf_folder/'capture.json').read_text(encoding='utf-8'))
    for name,file,page,count in [('basic','basic-rules.pdf',32,180),('srd','srd51.pdf',53,403)]:
        b=(pdf_folder/file).read_bytes();pin=basic['sources'][file]
        if any(pdfcaps[file].get(k)!=pin[k] for k in ['requestedUrl','finalUrl','status','bytes','sha256']) or sha(b)!=pin['sha256'] or len(b)!=pin['bytes']:raise ValueError('Changed retained PDF')
        pdf=PdfReader(pdf_folder/file)
        if len(pdf.pages)!=count:raise ValueError('Changed PDF page count')
        values[name]=pdf_unit(pdf.pages[page-1].extract_text());sources[name]={**pin,'inspectedPdfPages':[page]}
    normalized={k:R.words(v) for k,v in values.items()}
    if len(set(normalized.values()))!=1:raise ValueError('Selected ritual unit differs; no equality accepted')
    feature=next(f for f in features['features'] if f['id']=='wizard-spellcasting')
    if feature['classId']!='wizard' or feature['status']!='manual':raise ValueError('Changed existing parent feature')
    if not any(u['key']=='wizard-preparation-selected' for u in prior['units']):raise ValueError('Changed prior distinct preparation witness')
    return {'schemaVersion':1,'status':'complete-selected-wizard-ritual-component-not-full-class-or-runtime','unitId':'source-comparison:wizard-ritual-casting',
            'accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
            'scope':'whole single-paragraph Ritual Casting subsection only; not all Spellcasting, Wizard or other classes',
            'sources':sources,'boundaries':{'startHeading':'Ritual Casting','stopHeading':'Spellcasting Focus','boundaryHeadingsIncluded':False},
            'witnesses':{k:{'rawExtractedUnitSha256':sha(values[k].encode()),'normalizedUnitSha256':sha(v.encode()),'normalizedWordCount':len(v.split())} for k,v in normalized.items()},
            'normalization':'NFKC and whitespace only; no general hyphen, letter, quote, number or condition repair','normalizedSelectedUnitTextEqual':True,
            'ordinaryFacts':facts(normalized['srd']),
            'existingManualParentFeature':{'id':feature['id'],'status':feature['status'],'textSha256':sha(feature['text'].encode()),'rewritten':False,'newCatalogFeatureCreated':False},
            'priorPreparationWitnessIsSameAsRitualUnit':False,
            'syntheticCases':[{'spellIsWizardSpell':True,'ritualTag':True,'inWizardBook':True,'prepared':False,'ordinaryWizardRitualAccess':True},
                {'spellIsWizardSpell':True,'ritualTag':False,'inWizardBook':True,'prepared':True,'ordinaryWizardRitualAccess':False,'manualActionAllowed':True,'expected':'ritual-tag warning'},
                {'spellIsWizardSpell':True,'ritualTag':True,'inWizardBook':False,'prepared':True,'ordinaryWizardRitualAccess':False,'manualActionAllowed':True,'expected':'wizard-book warning'},
                {'spellIsWizardSpell':False,'ritualTag':True,'inWizardBook':False,'prepared':True,'ordinaryWizardRitualAccess':False,'manualActionAllowed':True,'expected':'do not borrow Wizard feature for another class'}],
            'inputSha256':{p:sha(t.encode()) for p,t in texts.items()},
            'generator':{'path':'scripts/audit-wizard-ritual-source-comparison-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParser':{'path':'scripts/'+HELPER.name,'sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['Complete selected component equality does not establish whole class/source equality, automation or new canonical aliases.',
                'Wizard ritual access is separate from preparation count, other-class rituals and technical data/access checks.',
                'No full prose, source artefacts, private sheet, runtime, cross-carrier reuse right or owner acceptance exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('web_folder');p.add_argument('pdf_folder');p.add_argument('--output');a=p.parse_args();d=audit(a.web_folder,a.pdf_folder)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'unit':d['unitId'],'equal':True,'words':d['witnesses']['srd']['normalizedWordCount'],'runtimeChanged':False}))
