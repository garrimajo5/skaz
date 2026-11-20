"""Compare the complete selected Arcane Recovery unit across three 2014-rule carriers."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from pypdf import PdfReader

WEB_URL='https://www.dndbeyond.com/compendium/rules/basic-rules/classes'
WEB_FINAL='https://www.dndbeyond.com/sources/dnd/basic-rules-2014/classes'
WEB_SHA='a08b309c589644f9faee67201dc7e0b9752be152215bce54d33d4b1ca7688c5e'
INPUTS=['catalog/basic-rules-publication-boundary-2014.json','catalog/srd51-class-features.json']

def sha(raw):return hashlib.sha256(raw).hexdigest()
def words(text):return ' '.join(unicodedata.normalize('NFKC',text).split())

def normalize_unit(text,basic_pdf_layout=False):
    text=unicodedata.normalize('NFKC',text);ordinal_repairs=0
    def ordinal(match):
        nonlocal ordinal_repairs
        replacement=match[1]+'-'
        if match[0]!=replacement:ordinal_repairs+=1
        return replacement
    text=re.sub(r'(\d+(?:st|nd|rd|th))\s*[-\u00ad\u2010\u2011]+\s*(?=level\b)',ordinal,text)
    # One visually checked discretionary wrap on Basic PDF p33 only; never a generic word repair.
    finish_repairs=0
    if basic_pdf_layout:
        text,finish_repairs=re.subn(r'\bfin[ \t]*-\r?\n[ \t]*ish\b','finish',text)
        if finish_repairs>1:raise ValueError('Unexpected repeated Basic finish wrap')
    return ' '.join(text.split()),{'ordinalHyphenRepairs':ordinal_repairs,'verifiedBasicFinishWrapRepairs':finish_repairs}

class WizardRuleParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.depth=0;self.containers=0;self.wizard=False
        self.starts=0;self.stops=0;self.in_heading=False;self.collect=False;self.paragraph=None;self.paragraphs=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='div':
            if 'p-article-content' in attrs.get('class','').split():
                if self.depth:raise ValueError('Nested source content containers')
                self.depth=1;self.containers+=1
            elif self.depth:self.depth+=1
        if not self.depth:return
        if tag=='h2' and attrs.get('id')=='Wizard':self.wizard=True
        if tag=='h3' and attrs.get('id')=='ArcaneRecovery':
            if not self.wizard:raise ValueError('Recovery is outside Wizard context')
            self.starts+=1;self.in_heading=True;self.collect=False
        if tag=='h3' and attrs.get('id')=='ArcaneTradition':
            if self.starts!=1 or not self.collect:raise ValueError('Wrong selected unit boundary order')
            self.stops+=1;self.collect=False
        if self.collect and tag=='p':self.paragraph=[]
    def handle_data(self,data):
        if self.collect and self.paragraph is not None:self.paragraph.append(data)
    def handle_endtag(self,tag):
        if not self.depth:return
        if tag=='h3' and self.in_heading:self.in_heading=False;self.collect=True
        if tag=='p' and self.paragraph is not None:
            self.paragraphs.append(words(''.join(self.paragraph)));self.paragraph=None
        if tag=='div':self.depth-=1
    def result(self,html):
        self.feed(html);self.close()
        if self.containers!=1 or self.depth or self.starts!=1 or self.stops!=1 or len(self.paragraphs)!=2:
            raise ValueError('Missing/ambiguous complete two-paragraph Wizard unit')
        return '\n'.join(self.paragraphs)

def pdf_unit(text):
    lines=text.splitlines();starts=[i for i,x in enumerate(lines) if words(x)=='Arcane Recovery'];stops=[i for i,x in enumerate(lines) if words(x)=='Arcane Tradition']
    if len(starts)!=1 or len(stops)!=1 or starts[0]>=stops[0]:raise ValueError('Ambiguous exact PDF heading boundaries')
    return '\n'.join(lines[starts[0]+1:stops[0]])

def facts(text):
    required=['Once per day when you finish a short rest','choose expended spell slots','combined level',
              'half your wizard level (rounded up)','none of the slots can be 6th level or higher',
              'a 2nd-level spell slot or two 1st-level spell slots']
    if any(anchor not in text for anchor in required):raise ValueError('Changed selected rule condition/example')
    return {'trigger':'finish-short-rest','selectionRequired':True,'spentSlotsOnly':True,
            'ordinaryFrequencySourceWording':'once-per-day','ordinaryBudget':'ceil(wizardClassLevel/2)',
            'ordinaryMaximumRecoverableSlotLevel':5,'budgetCountsSumOfSlotLevelsNotNumberOfSlots':True,
            'eachShortRestAutomaticallyRefillsAllSlots':False,'eachShortRestAutomaticallyResetsFrequency':False,
            'specificDayBoundaryOrPactPoolRouting':'not-established-by-this-unit',
            'manualDeviationAllowedWithWarning':True,'ordinaryRuleIsNotAnAuthorizationOrDataIntegrityBypass':True}

def audit(web_folder,pdf_folder,root=Path('.')):
    web_folder=Path(web_folder);pdf_folder=Path(pdf_folder);capture=json.loads((web_folder/'capture.json').read_text(encoding='utf-8'));raw=(web_folder/'classes.html').read_bytes()
    if (capture.get('requestedUrl')!=WEB_URL or capture.get('finalUrl')!=WEB_FINAL or capture.get('status')!=200
            or capture.get('sha256')!=WEB_SHA or sha(raw)!=WEB_SHA or capture.get('bytes')!=len(raw)):raise ValueError('Pinned digital class capture mismatch')
    texts=[(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS]
    boundary,features=[json.loads(text) for text in texts]
    snippets={'digital':WizardRuleParser().result(raw.decode('utf-8'))};sources={'digital':capture};pdf_caps=json.loads((pdf_folder/'capture.json').read_text(encoding='utf-8'))
    for name,key,page,expected_pages in [('basic','basic-rules.pdf',33,180),('srd','srd51.pdf',53,403)]:
        data=(pdf_folder/key).read_bytes();old=boundary['sources'][key];now=pdf_caps[key]
        for field in ['requestedUrl','finalUrl','status','bytes','sha256']:
            if now.get(field)!=old[field]:raise ValueError('Changed pinned PDF capture metadata')
        if sha(data)!=old['sha256'] or len(data)!=old['bytes']:raise ValueError('Changed pinned PDF body')
        reader=PdfReader(pdf_folder/key)
        if len(reader.pages)!=expected_pages:raise ValueError('Changed PDF page count')
        snippets[name]=pdf_unit(reader.pages[page-1].extract_text());sources[name]={**old,'inspectedPdfPages':[page]}
    norm={};witnesses={}
    for name,text in snippets.items():
        value,changes=normalize_unit(text,basic_pdf_layout=name=='basic');norm[name]=value
        witnesses[name]={'rawExtractedUnitSha256':sha(text.encode()),'normalizedUnitSha256':sha(value.encode()),
                         'normalizedWordCount':len(value.split()),'layoutNormalizations':changes}
    if len(set(norm.values()))!=1:raise ValueError('Selected unit differs after bounded typography normalization; no equality accepted')
    rule=facts(norm['srd']);feature=next(f for f in features['features'] if f['id']=='wizard-arcane-recovery')
    if feature['classId']!='wizard' or feature['sourcePage']!=53 or feature['status']!='manual':raise ValueError('Changed existing feature provenance/status')
    return {'schemaVersion':1,'status':'selected-complete-unit-source-comparison-not-runtime-acceptance','acceptedForRuntime':False,
            'runtimeChanged':False,'accepted':False,'complete':False,'approvedDenominator':None,
            'unitId':'wizard-arcane-recovery','scope':'whole two-paragraph selected unit including example; not whole Wizard class',
            'sources':sources,'boundaries':{'startHeading':'Arcane Recovery','stopHeading':'Arcane Tradition','includeBoundaryHeadings':False},
            'normalization':'NFKC, whitespace folding, ordinal+hyphen-run+literal-level repair; one visually checked fin-\nish wrap on Basic p33 only; no general letter/number/condition repair',
            'witnesses':witnesses,'normalizedSelectedUnitTextEqual':True,'ordinaryFacts':rule,
            'existingManualFeature':{'id':feature['id'],'sourcePage':53,'status':'manual','textSha256':sha(feature['text'].encode()),
                                     'rewritten':False,'fullClassAccepted':False},
            'syntheticReviewCases':[
                {'context':'fictional Wizard4','spentSlotLevels':[2],'ordinaryBudget':2,'ordinaryChoiceFits':True,'basis':'explicit source example'},
                {'context':'fictional Wizard4','spentSlotLevels':[1,1],'ordinaryBudget':2,'ordinaryChoiceFits':True,'basis':'explicit source example'},
                {'context':'fictional Wizard5/Fighter3','spentSlotLevels':[3],'ordinaryBudget':3,'ordinaryChoiceFits':True,'basis':'wizard class level and ceiling, not total8'},
                {'context':'fictional Wizard5/Fighter3','spentSlotLevels':[2,2],'ordinaryBudget':3,'ordinaryChoiceFits':False,'manualActionAllowed':True,'expected':'budget warning; preserve explicit manual route'},
                {'context':'fictional Wizard6 with manually granted slot6','spentSlotLevels':[6],'ordinaryBudget':3,'ordinaryChoiceFits':False,'manualActionAllowed':True,'expected':'budget and slot-level warnings; no automatic recovery'}],
            'inputSha256':{p:sha(t.encode()) for p,t in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-wizard-recovery-source-comparison-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['Equality is only this complete selected unit, not all shared classes/spells/items or global publication identity.',
                      'This confirms existing manual SRD-derived feature conditions; it does not implement rest events or a recovery command.',
                      'No claim that once-per-day means automatic reset on long rest, dawn or a particular calendar boundary.',
                      'No assumption about pool routing for Pact Magic or an unselected multiclass exception.',
                      'Existing SRD provenance is retained; matching web/PDF text does not grant site-wide reuse rights.',
                      'No full prose, private character, PDF/HTML, canonical denominator or owner acceptance exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('web_folder');p.add_argument('pdf_folder');p.add_argument('--output');args=p.parse_args();d=audit(args.web_folder,args.pdf_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'unit':d['unitId'],'normalizedSelectedUnitTextEqual':True,'words':d['witnesses']['srd']['normalizedWordCount'],'acceptedForRuntime':False}))
