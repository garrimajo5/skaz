"""Inventory a mixed-source reference and compare two selected complete ordinary subsections only."""
import argparse
from collections import Counter
import hashlib
from html.parser import HTMLParser
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import re

URL='https://dnd.su/articles/mechanics/157-spellcasting/'
ARTICLE_SHA='ef774df6faa63acb1b3e7fd72f6a77e40524f6dec1023a0cf0c08f28faffa169'
SRD_SHA='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
INPUTS=['catalog/wizard-table-concordance-2014.json','catalog/rest-spellcasting-source-comparison-2014.json']


def sha(raw):return hashlib.sha256(raw).hexdigest()


def compact(text):return ' '.join(text.split())


class Inventory(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.depth=0;self.starts=0;self.heading=None;self.heading_parts=[];self.parts=[];self.rows=[];self.ordinal=0;self.current={'ordinal':0,'level':None,'title':'prelude'};self.tags=Counter();self.current_tags=Counter();self.images=[]

    def flush(self):
        text=compact(' '.join(self.parts));self.rows.append({**self.current,'bodyTextSha256':sha(text.encode()),'bodyWordCount':len(text.split()),'bodyTagCounts':dict(sorted(self.current_tags.items()))});self.parts=[];self.current_tags=Counter()

    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if not self.depth:
            if tag=='div' and set(a.get('class','').split())=={'desc','card__article-body'}:
                self.starts+=1;self.depth=1
            return
        if tag not in {'div','p','span','a','strong','em','br','h2','h3','h4','table','tbody','thead','tr','td','th','ul','li','img','b','i','svg','use'}:raise ValueError('Unknown semantic article tag: '+tag)
        if tag=='div':self.depth+=1
        self.tags[tag]+=1
        if tag in {'h2','h3','h4'}:
            if self.heading:raise ValueError('Nested/unclosed heading')
            self.flush();self.heading=tag;self.heading_parts=[]
        else:self.current_tags[tag]+=1
        if tag=='img':self.images.append({'src':a.get('src'),'dataSrc':a.get('data-src'),'altSha256':sha(a.get('alt','').encode()),'fetchedOrAcceptedAsArt':False})

    def handle_endtag(self,tag):
        if not self.depth:return
        if tag in {'h2','h3','h4'}:
            if self.heading!=tag:raise ValueError('Unmatched heading')
            title=compact(' '.join(self.heading_parts))
            if not title:raise ValueError('Empty heading')
            self.ordinal+=1;self.current={'ordinal':self.ordinal,'level':int(tag[1]),'title':title};self.heading=None
        if tag=='div':
            self.depth-=1
            if not self.depth:
                if self.heading:raise ValueError('Unclosed heading')
                self.flush()

    def handle_data(self,data):
        if self.depth:
            (self.heading_parts if self.heading else self.parts).append(data)

    def result(self,html):
        self.feed(html);self.close()
        if self.starts!=1 or self.depth or self.heading:raise ValueError('Ambiguous/unclosed article description')
        if not self.rows or [r['ordinal'] for r in self.rows]!=list(range(len(self.rows))):raise ValueError('Lost article block')
        return {'blocks':self.rows,'tagCounts':dict(sorted(self.tags.items())),'images':self.images}


def helper():
    p=Path(__file__).with_name('audit-wizard-candidate-concordance-2014.py');s=importlib.util.spec_from_file_location('paragraph_helper',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def validate_receipt(raw,receipt):
    if receipt.get('requestedUrl')!=URL or receipt.get('finalUrl')!=URL or receipt.get('status')!=200 or receipt.get('outcome')!='complete' or receipt.get('retried') is not False or receipt.get('bytes')!=len(raw) or receipt.get('sha256')!=sha(raw) or sha(raw)!=ARTICLE_SHA:raise ValueError('Changed or incomplete exact public article receipt')


def primary_units(pdf_raw,*,rendered_page_inspected=False):
    if not rendered_page_inspected:raise ValueError('Primary page visual inspection required')
    if sha(pdf_raw)!=SRD_SHA:raise ValueError('Wrong SRD PDF')
    import pypdfium2 as p
    pdf=p.PdfDocument(pdf_raw);page=pdf[99];tp=page.get_textpage();text=compact(tp.get_text_range())
    if text.count('Known and Prepared Spells')!=1 or text.count('Casting in Armor')!=1:raise ValueError('Changed primary headings')
    known=text.split('Known and Prepared Spells',1)[1].split('Spell Slots',1)[0].strip();armor=text.split('Casting in Armor',1)[1].strip()
    for anchor in ['magic item','bards and sorcerers','clerics and wizards','varies for different classes']:
        if anchor not in known:raise ValueError('Known/prepared primary condition missing')
    if 'must be proficient with the armor' not in armor or not armor.endswith('spellcasting.'):raise ValueError('Armor primary condition/boundary missing')
    result={key:{'textSha256':sha(value.encode()),'wordCount':len(value.split()),'pdfPage':100,'completeSelectedSubsection':True} for key,value in [('known-prepared',known),('casting-in-armor',armor)]}
    tp.close();page.close();pdf.close();return result


def audit(raw,receipt,pdf_raw,root=Path('.'),*,rendered_page_inspected=False):
    validate_receipt(raw,receipt);html=raw.decode('utf-8');inventory=Inventory().result(html)
    if len(inventory['blocks'])!=49:raise ValueError('Changed48heading article inventory')
    h=helper();article=html[html.index('<div class="desc card__article-body"'):];headings=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',article,re.S))
    selected=[];primary=primary_units(pdf_raw,rendered_page_inspected=rendered_page_inspected)
    for ordinal,key,title in [(3,'known-prepared','Известные и подготовленные заклинания'),(4,'casting-in-armor','Накладывание заклинаний в доспехе')]:
        row=inventory['blocks'][ordinal];heading=headings[ordinal-1]
        if row['title']!=title or h.visible(heading[2])!=title:raise ValueError('Changed selected secondary heading')
        paragraphs=h.Paragraphs().result(article[heading.end():headings[ordinal].start()])
        if len(paragraphs)!=(3 if ordinal==3 else 1):raise ValueError('Changed complete selected secondary paragraph')
        selected.append({'key':key,'secondaryHeadingOrdinal':ordinal,'secondaryParagraphSha256':[sha(p.encode()) for p in paragraphs],'primary':primary[key],
            'assessmentMethod':'manual semantic comparison of complete selected subsections pinned by source SHA; not automatic translation equality','fullTranslationAccepted':False,'runtimeAccepted':False})
    texts={path:(root/path).read_bytes().replace(b'\r\n',b'\n') for path in INPUTS};inputs={path:json.loads(raw) for path,raw in texts.items()}
    refs=inputs[INPUTS[0]]['introduction']['secondaryNavigationReferences']
    if not any(r['href']=='/articles/mechanics/157-spellcasting/' for r in refs):raise ValueError('Lost Wizard reference relationship')
    if not any(u['key']=='multiclass-spellcasting-selected' for u in inputs[INPUTS[1]]['units']):raise ValueError('Per-class multiclass context missing')
    explicit=[{'ordinal':r['ordinal'],'title':r['title'],'observedLabel':'XGE' if '(XGE)' in r['title'] else 'TCE','canonicalSourceAssignmentAccepted':False} for r in inventory['blocks'] if '(XGE)' in r['title'] or '(TCE)' in r['title']]
    if [r['ordinal'] for r in explicit]!=[31,32,33,40,46]:raise ValueError('Changed explicit supplemental labels')
    return {'schemaVersion':1,'status':'mixed-reference-inventory-with-two-selected-clause-comparisons-not-full-chapter','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'headingsInventoried':48,'blocksIncludingPrelude':49,'explicitSupplementalHeadingLabels':len(explicit),'completeSelectedSubsectionComparisons':2,'selectedSecondaryParagraphs':4,'canonicalUnitsAccepted':0},
        'source':receipt,'primarySource':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SRD_SHA,'pdfPage':100,'renderedPageInspected':True,'textExtractor':'pypdfium2','extractorVersion':importlib.metadata.version('pypdfium2')},
        'inventory':inventory,'sourceBoundaryObservations':{'observedPageHeaderClaim':"Player's Handbook",'wholePageSourceInheritanceAllowed':False,'explicitSupplementalHeadings':explicit,
            'spellPointsVariantHeadingOrdinals':[7,8,9],'variantPrimaryPublicationAndVersionVerified':False,'neighboringHeadingSourceInheritanceAllowed':False,
            'readyActionAndRepeatedBonusActionHeadingsPreserved':[14,17,18],'deduplicatedOrAcceptedAsOneRule':False},
        'selectedComparisons':selected,'ordinarySelectedFacts':{'knownOrPreparedAccessAndMagicItemAccessDistinct':True,'knownFixedListExamples':['bard','sorcerer'],'preparationExamples':['cleric','wizard'],'classDescriptionsDetermineProcedure':True,'sharedKnownPreparedCountInferred':False,'armorProficiencyRequiredByOrdinaryRule':True,'armorRuleAppliedAsRuntimeBlock':False,'manualDeviationAllowedWithWarning':True,'multiclassContextReference':'multiclass-spellcasting-selected SRD58; individual class known/prepared rules still required'},
        'remainingCriteria':['46other heading bodies plus prelude, referenced tables/images, exact source/version/rights and translation remain unverified as rules; inventory is not completeness acceptance.',
            'Spell points variant and XGE/TCE labelled additions require own bounded primary evidence; page-level PHB label cannot accept them.',
            'Wizard spell list, individual class and item overrides remain separate.'],
        'nextWorkItem':{'role':'content','phase':'general-spell-slots-and-upcasting','action':'Compare complete secondary Spell Slots and Casting at Higher Level scopes against corresponding SRD100/101 boundaries; preserve spell-points variant and multiclass separation.'},
        'limits':['Fresh public reference capture has own complete HTTP receipt/SHA and no inherited Wizard-page identity.',
            'Only two selected complete subsection scopes are semantically compared;48headings do not mean48accepted rules.',
            'No full source prose, private sheet, runtime block, profile edit, publication rights or owner-stage acceptance exported.'],
        'inputSha256':{path:sha(value) for path,value in texts.items()},'generator':{'path':'scripts/audit-spellcasting-reference-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
        'upstreamParser':{'path':'scripts/audit-wizard-candidate-concordance-2014.py','sha256':sha(Path(__file__).with_name('audit-wizard-candidate-concordance-2014.py').read_bytes().replace(b'\r\n',b'\n'))}}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder',type=Path);p.add_argument('srd',type=Path);p.add_argument('--rendered-primary-page-checked',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=audit((a.folder/'spellcasting.html').read_bytes(),json.loads((a.folder/'capture.json').read_text(encoding='utf-8')),a.srd.read_bytes(),rendered_page_inspected=a.rendered_primary_page_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
