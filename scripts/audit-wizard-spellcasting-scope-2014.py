"""Inventory the entire retained Wizard Spellcasting section and compare three newly selected subcomponents."""
import argparse
from difflib import SequenceMatcher
import hashlib
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import re
from pypdf import PdfReader
HELPER=Path(__file__).with_name('audit-wizard-recovery-source-comparison-2014.py')
s=importlib.util.spec_from_file_location('wizard_layout',HELPER);R=importlib.util.module_from_spec(s);s.loader.exec_module(R)
HEADINGS=[('Cantrips6','Cantrips'),('Spellbook','Spellbook'),('PreparingandCastingSpells4','Preparing and Casting Spells'),('SpellcastingAbility8','Spellcasting Ability'),('RitualCasting4','Ritual Casting'),('SpellcastingFocus7','Spellcasting Focus'),('LearningSpellsof1stLevelandHigher','Learning Spells of 1st Level and Higher')]
EXPECTED=['WizardSpellcasting',*[key for key,name in HEADINGS],'YourSpellbookSidebar']
INPUTS=['catalog/basic-rules-publication-boundary-2014.json','catalog/wizard-artificer-source-scopes-2014.json','catalog/rest-spellcasting-source-comparison-2014.json','catalog/wizard-ritual-source-comparison-2014.json']

def sha(raw):return hashlib.sha256(raw).hexdigest()

class SpellcastingParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.depth=0;self.containers=0;self.wizard=False;self.base=False;self.active=False
        self.wizard_count=0;self.base_count=0;self.starts=0;self.stops=0;self.pending_start=False;self.pending_heading=None;self.heading_text=[]
        self.paragraph=None;self.sidebar_title=False;self.in_sidebar=False;self.sidebar_count=0;self.sidebar_title_count=0;self.previous=None;self.current=None;self.blocks=[];self.paragraph_count=0
    def new_block(self,id,label):
        self.current={'headingId':id,'headingText':label,'paragraphs':[]};self.blocks.append(self.current)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);id=a.get('id')
        if tag=='div':
            if 'p-article-content' in a.get('class','').split():
                if self.depth:raise ValueError('Nested source containers')
                self.depth=1;self.containers+=1
            elif self.depth:self.depth+=1
        if not self.depth:return
        if tag=='h2':
            if self.active:raise ValueError('Class/section transition before feature stop')
            if id=='Wizard':self.wizard=True;self.base=False;self.wizard_count+=1
            elif id=='ClassFeatures12' and self.wizard:self.base=True;self.base_count+=1
            else:self.wizard=False;self.base=False
        if tag=='h3' and id=='WizardSpellcasting':
            if not(self.wizard and self.base) or self.starts:raise ValueError('Wrong/duplicate Wizard Spellcasting context')
            self.starts+=1;self.pending_start=True;return
        if tag=='h3' and id=='ArcaneRecovery':
            if not self.active or self.paragraph is not None or self.in_sidebar or self.pending_heading:raise ValueError('Wrong or unclosed feature boundary')
            self.stops+=1;self.active=False;return
        if not self.active:return
        if tag=='h4':
            if self.paragraph is not None or self.in_sidebar or self.pending_heading or id not in dict(HEADINGS):raise ValueError('Unexpected/unclosed feature subsection')
            self.pending_heading=id;self.heading_text=[];return
        if tag in ['h1','h2','h3','h5','h6']:raise ValueError('Unexpected heading within complete feature scope')
        if tag=='blockquote':
            if self.paragraph is not None or self.in_sidebar or self.current['headingId']!='LearningSpellsof1stLevelandHigher':raise ValueError('Unexpected/nested spellbook sidebar')
            self.previous=self.current;self.in_sidebar=True;self.sidebar_count+=1;self.new_block('YourSpellbookSidebar','Your Spellbook');return
        if tag=='p':
            if self.paragraph is not None or self.pending_heading:raise ValueError('Nested or unclosed paragraph')
            self.paragraph=[];self.sidebar_title='Sidebar-Styles_Sidebar-Heading' in a.get('class','').split()
            if self.sidebar_title and not self.in_sidebar:raise ValueError('Sidebar title outside sidebar')
            return
        if tag not in ['a','span','strong','em','b','i','br'] or (self.paragraph is None and not self.pending_heading):raise ValueError('Unknown content cannot be silently dropped')
        if tag=='br' and self.paragraph is not None:self.paragraph.append(' ')
    def handle_data(self,data):
        if not self.active:return
        if self.pending_heading:self.heading_text.append(data)
        elif self.paragraph is not None:self.paragraph.append(data)
        elif data.strip():raise ValueError('Visible text outside a captured paragraph')
    def handle_endtag(self,tag):
        if not self.depth:return
        if tag=='h3' and self.pending_start:self.pending_start=False;self.active=True;self.new_block('WizardSpellcasting','Spellcasting')
        elif self.active and tag=='h4':
            if not self.pending_heading:raise ValueError('Unpaired subsection heading')
            label=R.words(''.join(self.heading_text))
            if label!=dict(HEADINGS)[self.pending_heading]:raise ValueError('Changed subsection label')
            self.new_block(self.pending_heading,label);self.pending_heading=None
        elif self.active and tag=='p':
            if self.paragraph is None:raise ValueError('Unpaired paragraph close')
            text=R.words(''.join(self.paragraph));self.paragraph=None;self.paragraph_count+=1
            if self.sidebar_title:
                if text!='YOUR SPELLBOOK':raise ValueError('Wrong sidebar identity')
                self.sidebar_title_count+=1
            else:
                if not text:raise ValueError('Unexpected empty content paragraph')
                self.current['paragraphs'].append(text)
            self.sidebar_title=False
        elif self.active and tag=='blockquote':
            if not self.in_sidebar or self.paragraph is not None:raise ValueError('Unpaired/unclosed sidebar')
            self.in_sidebar=False;self.current=self.previous
        if tag=='div':self.depth-=1
    def result(self,html):
        self.feed(html);self.close()
        if self.containers!=1 or self.depth or self.active or self.pending_start or self.pending_heading or self.starts!=1 or self.stops!=1 or (self.wizard_count,self.base_count,self.sidebar_count,self.sidebar_title_count)!=(1,1,1,1):raise ValueError('Incomplete or ambiguous whole feature inventory')
        if [b['headingId'] for b in self.blocks]!=EXPECTED or any(not b['paragraphs'] for b in self.blocks):raise ValueError('Changed feature component inventory/order')
        return self.blocks

def pdf_new_units(text,name):
    lines=text.splitlines();clean=[R.words(x) for x in lines];starts=[i for i,x in enumerate(clean) if x=='Spellcasting']
    if len(starts)!=1:raise ValueError('Missing unique PDF class feature scope')
    scope_start=starts[0]
    def initial(heading):
        indices=[i for i,x in enumerate(clean) if i>scope_start and x==heading and R.words(' '.join(lines[i+1:i+12])).startswith('At 1st level,')]
        if len(indices)!=1:raise ValueError('Heading must start the subsection, not a wrapped table/body word')
        return indices[0]
    cantrips=initial('Cantrips');book=initial('Spellbook')
    if cantrips>=book:raise ValueError('Changed initial component order')
    if name=='basic':
        stops=[i for i,x in enumerate(clean) if i>book and x=='Preparing and Casting Spells']
        if len(stops)!=1:raise ValueError('Missing next Basic component boundary')
        spellbook='\n'.join(lines[book+1:stops[0]])
    else:
        spellbook='\n'.join(lines[book+1:])
        if not R.words(spellbook).endswith('which are fixed in your mind.'):raise ValueError('SRD page boundary does not finish the complete book paragraph')
    return {'Cantrips6':'\n'.join(lines[cantrips+1:book]),'Spellbook':spellbook}

def pdf_focus(text,name):
    lines=text.splitlines();clean=[R.words(x) for x in lines];starts=[i for i,x in enumerate(clean) if x=='Spellcasting Focus']
    if len(starts)!=1:raise ValueError('Wrong focus heading')
    stop=len(lines)
    if name=='srd':
        stops=[i for i,x in enumerate(clean) if i>starts[0] and x=='Learning Spells of 1st Level and Higher']
        if len(stops)!=1:raise ValueError('Missing next focus boundary')
        stop=stops[0]
    unit='\n'.join(lines[starts[0]+1:stop])
    if not R.words(unit).endswith('for your wizard spells.'):raise ValueError('Incomplete focus paragraph at page boundary')
    return unit

def normalize(text,carrier,key):
    value,repairs=R.normalize_unit(text);count=0
    if carrier=='srd' and key=='Cantrips6':
        value,count=re.subn(r'(?<=cantrips of your )choic\s+e(?= at higher levels)','choice',value)
        if count>1:raise ValueError('Unexpected repeated internal-letter split')
    repository=0
    if carrier=='basic' and key=='Spellbook':
        value,repository=re.subn(r'\brepos\s*-\s*itory\b','repository',value)
        if repository>1:raise ValueError('Unexpected repeated repository wrap')
    return value,{**repairs,'visuallyCheckedSrdChoiceSplitRepairs':count,'visuallyCheckedBasicRepositoryWrapRepairs':repository}

def short_deltas(left,right):
    a=left.split();b=right.split();result=[]
    for op,i,j,k,l in SequenceMatcher(a=a,b=b,autojunk=False).get_opcodes():
        if op=='equal':continue
        result.append({'operation':op,'leftWords':a[i:j] if j-i<=8 else None,'rightWords':b[k:l] if l-k<=8 else None,'leftWordCount':j-i,'rightWordCount':l-k})
    return result

def facts(key,text):
    if key=='Cantrips6':
        if not all(x in text for x in ['At 1st level','three cantrips','wizard spell list','Cantrips Known column']):raise ValueError('Changed initial Wizard cantrip conditions')
        return {'ordinaryWizardClassEntryCantripCount':3,'choicesRequired':True,'higherLevelsReferToWizardTable':True,'otherClassCantripsOverwritten':False}
    if key=='Spellbook':
        if not all(x in text for x in ['At 1st level','six','1st-level wizard spells','except your cantrips']):raise ValueError('Changed initial Wizard book conditions')
        return {'ordinaryWizardClassEntryBookSpellCount':6,'ordinaryInitialBookSpellLevel':1,'cantripsStoredInBook':False,'reappliedOnImportedLevelsOrEveryLevel':False}
    if not all(x in text for x in ['You can use an arcane focus','spellcasting focus for your wizard spells']):raise ValueError('Changed class-specific focus scope')
    return {'wizardArcaneFocusAllowed':True,'otherClassFocusRuleInferred':False,'costlyOrConsumedComponentExemptionInferred':False}

def audit(web_folder,pdf_folder,root=Path('.')):
    web_folder=Path(web_folder);pdf_folder=Path(pdf_folder);cap=json.loads((web_folder/'capture.json').read_text(encoding='utf-8'));raw=(web_folder/'classes.html').read_bytes()
    if cap['requestedUrl']!=R.WEB_URL or cap['finalUrl']!=R.WEB_FINAL or cap['status']!=200 or cap['sha256']!=R.WEB_SHA or cap['bytes']!=len(raw) or sha(raw)!=R.WEB_SHA:raise ValueError('Changed retained digital class body')
    blocks=SpellcastingParser().result(raw.decode('utf-8'));texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};basic,mapping,rest,ritual=[json.loads(t) for t in texts.values()]
    if mapping['accepted'] or mapping['complete'] or rest['acceptedForRuntime'] or ritual['acceptedForRuntime']:raise ValueError('Prior bounded scope changed stage')
    snippets={'digital':{b['headingId']:'\n'.join(b['paragraphs']) for b in blocks if b['headingId'] in ['Cantrips6','Spellbook','SpellcastingFocus7']}};sources={'digital':cap};pdfcaps=json.loads((pdf_folder/'capture.json').read_text(encoding='utf-8'))
    for name,file,mainpage,focuspage,pagecount in [('basic','basic-rules.pdf',32,32,180),('srd','srd51.pdf',52,53,403)]:
        b=(pdf_folder/file).read_bytes();pin=basic['sources'][file]
        if any(pdfcaps[file].get(k)!=pin[k] for k in ['requestedUrl','finalUrl','status','bytes','sha256']) or sha(b)!=pin['sha256'] or len(b)!=pin['bytes']:raise ValueError('Changed retained PDF')
        reader=PdfReader(pdf_folder/file)
        if len(reader.pages)!=pagecount:raise ValueError('Changed PDF page count')
        snippets[name]=pdf_new_units(reader.pages[mainpage-1].extract_text(),name);snippets[name]['SpellcastingFocus7']=pdf_focus(reader.pages[focuspage-1].extract_text(),name)
        sources[name]={**pin,'inspectedPdfPages':sorted({mainpage,focuspage})}
    comparisons=[]
    for key in ['Cantrips6','Spellbook','SpellcastingFocus7']:
        values={};witness={}
        for carrier,units in snippets.items():
            value,repairs=normalize(units[key],carrier,key);values[carrier]=value
            witness[carrier]={'rawUnitSha256':sha(units[key].encode()),'normalizedUnitSha256':sha(value.encode()),'wordCount':len(value.split()),'layoutRepairs':repairs}
        ordinary={carrier:facts(key,value) for carrier,value in values.items()}
        if len({json.dumps(v,sort_keys=True) for v in ordinary.values()})!=1:raise ValueError('New component facts disagree; do not accept shared facts')
        literal_equal=len(set(values.values()))==1
        classification='equal-after-bounded-layout-normalization' if literal_equal else 'unresolved-text-difference'
        if key=='SpellcastingFocus7' and not literal_equal:
            bases=[re.sub(r' \(see chapter 5, “Equip\u00ad?ment”\)| \(found in chapter 5\)','',v) for v in values.values()]
            if len(set(bases))==1:classification='document-cross-reference-wording-differs-only'
        comparisons.append({'headingId':key,'differenceClassification':classification,'witnesses':witness,'ordinaryFacts':ordinary['digital'],
            'allThreeLiteralTextsEqual':len(set(values.values()))==1,'digitalVersusBasicDeltas':short_deltas(values['digital'],values['basic']),
            'digitalVersusSrdDeltas':short_deltas(values['digital'],values['srd']),'wholeWizardSpellcastingAccepted':False,'acceptedForRuntime':False})
    inventory=[]
    for b in blocks:
        inventory.append({'headingId':b['headingId'],'headingText':b['headingText'],'paragraphCount':len(b['paragraphs']),
            'paragraphTextSha256':[sha(p.encode()) for p in b['paragraphs']],
            'sourceTextComparisonState':'new-three-carrier-component-comparison' if b['headingId'] in snippets['digital'] else 'existing-selected-components-not-repeated' if b['headingId'] in ['PreparingandCastingSpells4','SpellcastingAbility8','RitualCasting4','LearningSpellsof1stLevelandHigher'] else 'full-comparison-still-required',
            'fullRulesAccepted':False})
    return {'schemaVersion':1,'status':'whole-digital-feature-inventory-with-three-selected-component-comparisons-not-full-feature-acceptance','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'sources':sources,'inventory':inventory,'selectedNewComparisons':comparisons,
        'summary':{'digitalComponentBlocks':len(blocks),'digitalParagraphsIncludingSidebarTitle':sum(len(b['paragraphs']) for b in blocks)+1,
            'newlyComparedComponents':3,'wholeFeatureAccepted':False,'canonicalUnitsAccepted':0},
        'openReferenceGraph':['Wizard table','general spellcasting rules','Wizard spell list','remaining complete Your Spellbook sidebar/version comparison'],
        'scopeBoundaries':{'sidebarCapturedSeparately':True,'sidebarCompleteTextComparedAcrossCarriers':False,'oldPreparationUnitPromotedToWholeFeature':False,'existingRitualUnitRecountedAsNew':False},
        'inputSha256':{p:sha(t.encode()) for p,t in texts.items()},
        'generator':{'path':'scripts/audit-wizard-spellcasting-scope-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
        'upstreamParser':{'path':'scripts/'+HELPER.name,'sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
        'limits':['The digital inventory captures intro, seven inline subsections and one sidebar; it is not whole multi-carrier feature equality.',
            'Literal differences are retained; matching selected ordinary facts never grants global text identity, translation rights or canonical aliases.',
            'Initial Wizard choices are separate from later learning and importing existing levels; no extra spells or cantrips granted.',
            'Wizard arcane focus is not an Artificer rule or an exemption from other spell components.',
            'No full prose, private profile, runtime, other-carrier reuse permission or owner milestone acceptance exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('web_folder');p.add_argument('pdf_folder');p.add_argument('--output');a=p.parse_args();d=audit(a.web_folder,a.pdf_folder)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps(d['summary']));print(json.dumps([{k:r[k] for k in ['headingId','allThreeLiteralTextsEqual','digitalVersusBasicDeltas','digitalVersusSrdDeltas']} for r in d['selectedNewComparisons']]))
