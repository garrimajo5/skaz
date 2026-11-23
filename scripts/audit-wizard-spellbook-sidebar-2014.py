"""Compare the complete seven-paragraph Spellbook sidebar, including its SRD continuation page."""
import argparse
from difflib import SequenceMatcher
import hashlib
import importlib.util
from importlib.metadata import version
import json
from pathlib import Path
import re
from pypdf import PdfReader
import pypdfium2 as pdfium
HELPER=Path(__file__).with_name('audit-wizard-spellcasting-scope-2014.py')
s=importlib.util.spec_from_file_location('book_scope',HELPER);W=importlib.util.module_from_spec(s);s.loader.exec_module(W)
INPUTS=['catalog/basic-rules-publication-boundary-2014.json','catalog/wizard-spellcasting-scope-2014.json','catalog/srd51-class-features.json']
END='your previous spellbook in a mishap.'

def sha(raw):return hashlib.sha256(raw).hexdigest()

def basic_sidebar(text):
    lines=text.splitlines();indices=[i for i,line in enumerate(lines) if W.R.words(line)=='Your Spellbook']
    if len(indices)!=1:raise ValueError('Missing unique exact Basic sidebar heading')
    unit='\n'.join(lines[indices[0]+1:])
    if not W.R.words(unit).endswith(END):raise ValueError('Basic sidebar last paragraph incomplete')
    return unit

def srd_sidebar(page54,page55):
    first=W.R.words(page54);last=W.R.words(page55);marker='Your Spellbook '
    if first.count(marker)!=1:raise ValueError('Ambiguous SRD sidebar start')
    first=first.split(marker,1)[1];header='System Reference Document 5.1 55 '
    if not last.startswith(header):raise ValueError('Missing exact continuation page/header identity')
    last=last[len(header):]
    if not first.endswith('material components you') or not last.startswith('expend as you experiment'):raise ValueError('Changed split-sentence continuation boundary')
    if not last.endswith(END):raise ValueError('Missing complete sidebar last paragraph')
    return first+' '+last

def normalize(text,carrier):
    value,changes=W.R.normalize_unit(text);gilt=0
    if carrier=='srd':
        def fix(m):
            nonlocal gilt
            if m[0]!='gilt-edged':gilt+=1
            return 'gilt-edged'
        value=re.sub(r'\bgilt[-\u00ad\u2010\u2011]+edged\b',fix,value)
        if gilt>1:raise ValueError('Unexpected repeated compound-hyphen repair')
    return value,{**changes,'verifiedSrdGiltHyphenRunRepairs':gilt}

def facts(text):
    required=['spell level you can prepare','2 hours','50 gp','Replacing the Book.','your own spellbook into another book','1 hour and 10 gp','spells that you have prepared','find new spells','The Book’s Appearance.','you understand your own notation','already know how to cast the spell','many wizards keep backup spellbooks in a safe place.']
    if any(t not in text for t in required):raise ValueError('Changed complete sidebar condition or required subsection')
    return {'newSpellCopyHoursPerSpellLevel':2,'newSpellCopyGpPerSpellLevel':50,'newSpellMustBePreparableLevel':True,
        'ownBookCopyHoursPerSpellLevel':1,'ownBookCopyGpPerSpellLevel':10,'ownNotationExplainsDifferentProcedure':True,
        'lostBookReconstructionUsesPreparedSpells':True,'allKnownUnpreparedSpellsAutomaticallyRestored':False,
        'remainderRequiresFindingSpellsNormally':True,'backupsMentioned':True,'appearanceSubsectionIncluded':True,
        'subclassDiscountsOrScrollSpecificChecksEstablished':False,'genericInventoryDeleteEventImplementation':False,'manualDeviationAllowedWithWarning':True}

def read_pdfium_pages(path,pages):
    doc=pdfium.PdfDocument(str(path));result=[]
    try:
        for index in pages:
            page=doc[index-1]
            try:
                textpage=page.get_textpage()
                try:result.append(textpage.get_text_range())
                finally:textpage.close()
            finally:page.close()
    finally:doc.close()
    return result

def audit(web_folder,pdf_folder,root=Path('.')):
    web_folder=Path(web_folder);pdf_folder=Path(pdf_folder);raw=(web_folder/'classes.html').read_bytes();cap=json.loads((web_folder/'capture.json').read_text(encoding='utf-8'))
    if cap['requestedUrl']!=W.R.WEB_URL or cap['finalUrl']!=W.R.WEB_FINAL or cap['sha256']!=W.R.WEB_SHA or sha(raw)!=W.R.WEB_SHA or cap['bytes']!=len(raw) or cap['status']!=200:raise ValueError('Changed retained digital capture')
    blocks=W.SpellcastingParser().result(raw.decode('utf-8'));sidebar=next(b for b in blocks if b['headingId']=='YourSpellbookSidebar')
    if len(sidebar['paragraphs'])!=7:raise ValueError('Changed complete digital sidebar paragraph inventory')
    snippets={'digital':'\n'.join(sidebar['paragraphs'])};sources={'digital':cap};texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};basic,inventory,features=[json.loads(t) for t in texts.values()]
    if inventory['summary']['digitalComponentBlocks']!=9 or inventory['summary']['wholeFeatureAccepted'] or not inventory['scopeBoundaries']['sidebarCapturedSeparately']:raise ValueError('Changed prior feature inventory scope')
    caps=json.loads((pdf_folder/'capture.json').read_text(encoding='utf-8'))
    for name,file,pages,count in [('basic','basic-rules.pdf',[33],180),('srd','srd51.pdf',[54,55],403)]:
        b=(pdf_folder/file).read_bytes();pin=basic['sources'][file]
        if sha(b)!=pin['sha256'] or len(b)!=pin['bytes'] or any(caps[file].get(k)!=pin[k] for k in ['requestedUrl','finalUrl','status','bytes','sha256']):raise ValueError('Changed retained PDF')
        pdf=PdfReader(pdf_folder/file)
        if len(pdf.pages)!=count:raise ValueError('Wrong PDF page count')
        snippets[name]=basic_sidebar(pdf.pages[32].extract_text()) if name=='basic' else srd_sidebar(*read_pdfium_pages(pdf_folder/file,[54,55]))
        sources[name]={**pin,'inspectedPdfPages':pages,'textExtractor':'pypdf' if name=='basic' else 'pypdfium2','extractorVersion':__import__('pypdf').__version__ if name=='basic' else version('pypdfium2')}
    values={};witnesses={}
    for name,text in snippets.items():
        value,repairs=normalize(text,name);values[name]=value;witnesses[name]={'rawUnitSha256':sha(text.encode()),'normalizedUnitSha256':sha(value.encode()),'wordCount':len(value.split()),'layoutRepairs':repairs}
    ordinary={name:facts(text) for name,text in values.items()}
    if len({json.dumps(v,sort_keys=True) for v in ordinary.values()})!=1:raise ValueError('Selected sidebar conditions disagree')
    deltas={name:W.short_deltas(values['digital'],values[name]) for name in ['basic','srd']}
    parent=next(f for f in features['features'] if f['id']=='wizard-spellcasting')
    if parent['classId']!='wizard' or parent['status']!='manual':raise ValueError('Changed existing parent')
    return {'schemaVersion':1,'status':'complete-selected-sidebar-comparison-with-retained-literal-difference-not-whole-feature-or-runtime',
        'unitId':'source-comparison:wizard-your-spellbook','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'scope':'complete seven-paragraph Your Spellbook sidebar including copying, replacing, lost book and appearance; SRD54 continues on55',
        'sources':sources,'witnesses':witnesses,'allThreeLiteralTextsEqual':len(set(values.values()))==1,'digitalVersusCarrierDeltas':deltas,
        'ordinaryFacts':ordinary['digital'],'continuationBoundary':{'srdStartPage':54,'srdStopPage':55,'continuationHeaderRemovedExactly':True,'truncatedPage54Accepted':False},
        'existingManualParent':{'id':parent['id'],'status':'manual','textSha256':sha(parent['text'].encode()),'rewritten':False,'newFeatureCreated':False},
        'syntheticCases':[{'event':'ordinary-new-spell-copy','spellLevel':2,'expectedBaseHours':4,'expectedBaseGp':100,'choicesAndSourceVerificationRequired':True},
            {'event':'own-book-backup-copy','spellLevel':2,'expectedBaseHours':2,'expectedBaseGp':20},
            {'event':'lost-book','preparedSpellIds':['fictional-a'],'otherKnownSpellIds':['fictional-b'],'expectedReconstructibleByThisProcedure':['fictional-a'],'automaticRestoreAllKnown':False},
            {'event':'import-existing-book','expected':'do-not-charge-or-grant-copying-again'},
            {'event':'special-discount-or-scroll','expected':'outside-selected-ordinary-cost-rules; retain manual warning path'}],
        'inputSha256':{p:sha(t.encode()) for p,t in texts.items()},
        'generator':{'path':'scripts/audit-wizard-spellbook-sidebar-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
        'upstreamParsers':[{'path':'scripts/'+p.name,'sha256':sha(p.read_bytes().replace(b'\r\n',b'\n'))} for p in [HELPER,Path(__file__).with_name('audit-wizard-recovery-source-comparison-2014.py')]],
        'limits':['The whole selected sidebar is compared, but its small literal carrier difference is preserved; no global text identity claimed.',
            'Ordinary book copying, own-book backup and prepared-only reconstruction are different procedures, not automated inventory actions.',
            'No fresh cantrip/known-spell grant, all-known restoration, subclass discount or scroll procedure inferred.',
            'Full Spellcasting/general references, class/subclasses, original candidate translation/source claims, rights and M0 remain open.',
            'No source prose, PDF, private sheet, runtime, feature rewrite or owner acceptance exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('web_folder');p.add_argument('pdf_folder');p.add_argument('--output');a=p.parse_args();d=audit(a.web_folder,a.pdf_folder)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'unit':d['unitId'],'words':{k:v['wordCount'] for k,v in d['witnesses'].items()},'literalEqual':d['allThreeLiteralTextsEqual'],'deltas':d['digitalVersusCarrierDeltas']}))
