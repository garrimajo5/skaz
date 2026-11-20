"""Pin bibliographic/TOC differences of Basic Rules PDF, digital source and SRD5.1."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit
import pypdf
from pypdf import PdfReader

SNAPSHOTS={
 'basic-rules.pdf':('https://media.wizards.com/2018/dnd/downloads/DnD_BasicRules_2018.pdf','7a0c5d8bf52d15092f156d78418aa3d43307e271f810d2f06bf2f0258e9288a3'),
 'digital.html':('https://www.dndbeyond.com/sources/dnd/basic-rules-2014','4f7950c8cb921b7b7217831b7f3b6e191a8d98926225a9871fce530454dad407'),
 'srd51.pdf':('https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'),
}
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-current-publication-context-2014.json',
        'catalog/source-rights-evidence-2014.json','catalog/srd51-class-progression.json']
BASE='https://www.dndbeyond.com/compendium/rules/basic-rules/'

def normalized(text):return ' '.join(unicodedata.normalize('NFKC',text).split())
def digest(raw):return hashlib.sha256(raw).hexdigest()

def verify_capture(raw,capture,url,sha):
    if (capture.get('requestedUrl')!=url or capture.get('finalUrl')!=url or capture.get('status')!=200
            or capture.get('bytes')!=len(raw) or capture.get('sha256')!=sha or digest(raw)!=sha):
        raise ValueError('Pinned public artifact URL/status/bytes/SHA mismatch')
    return {key:capture[key] for key in ['requestedUrl','finalUrl','status','bytes','sha256','capturedAt']}

class TocParser(HTMLParser):
    """Read only the named TOC container, never navigation or arbitrary body anchors."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth=0;self.containers=0;self.heading=None;self.link=None;self.current=None
        self.title=None;self.titles=[];self.chapters=[];self.appendices=[];self.links={}
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='h1':self.title=[]
        if tag=='div':
            if 'compendium-toc-full-text' in attrs.get('class','').split():
                if self.depth:raise ValueError('Nested TOC containers')
                self.depth=1;self.containers+=1
            elif self.depth:self.depth+=1
        if not self.depth:return
        if tag=='h4':self.heading={'text':[],'url':None}
        if tag=='a':
            if self.heading is not None:self.heading['url']=attrs.get('href')
            else:self.link={'text':[],'url':attrs.get('href'),'chapter':self.current}
    def handle_data(self,data):
        if self.title is not None:self.title.append(data)
        if self.heading is not None:self.heading['text'].append(data)
        if self.link is not None:self.link['text'].append(data)
    def handle_endtag(self,tag):
        if tag=='h1' and self.title is not None:self.titles.append(normalized(''.join(self.title)));self.title=None
        if not self.depth:return
        if tag=='a' and self.link is not None:
            link=self.link;self.link=None;link['text']=normalized(''.join(link['text']))
            self.links.setdefault(link.pop('chapter'),[]).append(link)
        if tag=='h4' and self.heading is not None:
            h=self.heading;self.heading=None;label=normalized(''.join(h['text']))
            match=re.fullmatch(r'Ch\.\s*(\d+):\s*(.+)',label)
            if match:
                self.current=int(match[1]);self.chapters.append({'number':self.current,'title':match[2],'url':h['url']})
            else:
                self.current=None
                if label.startswith('Appendix '):self.appendices.append({'title':label,'url':h['url']})
        if tag=='div':self.depth-=1

def inspect_digital(html):
    parser=TocParser();parser.feed(html);parser.close()
    if parser.containers!=1 or parser.depth or not parser.titles or set(parser.titles)!={'Basic Rules (2014)'}:
        raise ValueError('Ambiguous digital title/TOC container')
    if [h['number'] for h in parser.chapters]!=list(range(1,16)):
        raise ValueError('Changed ordered digital chapter inventory')
    for h in parser.chapters+parser.appendices:
        if not isinstance(h['url'],str) or not h['url'].startswith(BASE):raise ValueError('Foreign chapter target')
    def names(chapter,skip):
        result=[]
        for link in parser.links.get(chapter,[]):
            url=link['url']
            if not isinstance(url,str) or not url.startswith(BASE):raise ValueError('Foreign TOC child target')
            if urlsplit(url).fragment in skip:continue
            if not urlsplit(url).fragment:raise ValueError('Missing TOC child fragment')
            result.append(link['text'])
        if len(result)!=len(set(result)):raise ValueError('Duplicate TOC child identity')
        return result
    classes=names(3,{'ClassesSummary'});races=names(2,{'ChoosingaRace','RacialTraits'})
    return {'title':parser.titles[0],'chapters':parser.chapters,'appendices':parser.appendices,
            'classTocNames':classes,'raceTocNames':races,'classCount':len(classes),'raceCount':len(races)}

def inspect_basic_pdf(cover,toc,page_count):
    cover=normalized(cover);toc=normalized(toc)
    match=re.search(r'D&D Basic Rules, Version ([0-9]+\.[0-9]+), Released ([A-Za-z]+) (\d{4})',cover)
    years=set(re.findall(r'©\s*(\d{4})\s+Wizards',cover))
    if not match or len(years)!=1 or page_count!=180:raise ValueError('Missing/changed Basic PDF bibliographic identity')
    if 'personal use only' not in toc or 'Not for resale' not in toc:raise ValueError('Missing PDF-specific use notice')
    def rows(start,end):
        if toc.count(start)!=1 or toc.count(end)!=1:raise ValueError('Ambiguous PDF TOC section')
        body=toc.split(start,1)[1].split(end,1)[0]
        return [{'name':m[0].strip(),'page':int(m[1])} for m in re.findall(r'([A-Za-z][A-Za-z -]*?)\s*\.{2,}\s*(\d+)',body)]
    classes=rows('Ch. 3: Classes','Ch. 4:');races=rows('Ch. 2: Races','Ch. 3:')
    races=[r for r in races if r['name'] not in ['Choosing a Race','Racial Traits']]
    chapters=[{'number':int(n),'title':title.strip()} for n,title in re.findall(r'Ch\.\s*(\d+):\s*(.*?)\s*\.{2,}',toc)]
    if [r['number'] for r in chapters]!=list(range(1,15)):raise ValueError('Changed PDF chapter inventory')
    return {'version':match[1],'releaseMonth':match[2],'releaseYear':int(match[3]),'copyrightYear':int(next(iter(years))),
            'pages':page_count,'inspectedPdfPages':[1,2],'chapters':chapters,
            'classTocEntries':classes,'raceTocEntries':races,'classCount':len(classes),'raceCount':len(races),
            'appendices':[{'letter':a,'title':b,'page':int(c)} for a,b,c in re.findall(r'Appendix\s+([A-Z]):\s*(.*?)\s*\.{2,}\s*(\d+)',toc)],
            'personalUseNoticePresent':True}

def locate_srd_heading(reader,name,table_page):
    inspected=[]
    for page in [table_page,table_page+1]:
        inspected.append(page);text=normalized(reader.pages[page-1].extract_text())
        if re.search(r'\b'+re.escape(name)+r' Class Features\b',text):
            return {'name':name,'existingTableExtractionPage':table_page,'headingPage':page,'inspectedPdfPages':inspected}
    raise ValueError('Missing SRD class heading in existing extraction window: '+name)

def audit(folder,root=Path('.')):
    folder=Path(folder);captures=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for name,(url,sha) in SNAPSHOTS.items():sources[name]=verify_capture((folder/name).read_bytes(),captures[name],url,sha)
    digital=inspect_digital((folder/'digital.html').read_text(encoding='utf-8'))
    pdf=PdfReader(folder/'basic-rules.pdf');basic=inspect_basic_pdf(pdf.pages[0].extract_text(),pdf.pages[1].extract_text(),len(pdf.pages))
    srd=PdfReader(folder/'srd51.pdf');legal=normalized(srd.pages[0].extract_text())
    if len(srd.pages)!=403 or 'Creative Commons Attribution 4.0 International License' not in legal:raise ValueError('Changed pinned SRD legal identity')
    texts=[(root/path).read_text(encoding='utf-8').replace('\r\n','\n') for path in INPUTS]
    library,context,rights,classes=[json.loads(text) for text in texts]
    provider=next(r for r in library['records'] if r['providerSourceId']==1)
    if (provider['sourceUrl']!=SNAPSHOTS['digital.html'][0] or provider['title']!=digital['title']
            or provider['providerRuleset']['name']!='5e' or provider['providerIsThirdParty']
            or provider['displayedPublisher']!='Wizards of the Coast'):raise ValueError('Changed provider1 identity')
    if 1 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Not in preserved D05 residual')
    if classes['source']['sha256']!=SNAPSHOTS['srd51.pdf'][1] or rights['srd51']['url']!=SNAPSHOTS['srd51.pdf'][0]:raise ValueError('Changed existing SRD provenance')
    srd_heads=[]
    for row in classes['classes']:
        srd_heads.append(locate_srd_heading(srd,row['name']['en'],row['sourcePage']))
    if [x['name'] for x in srd_heads]!=digital['classTocNames']:raise ValueError('Changed selected SRD/digital class-name relation')
    if [r['name'] for r in basic['classTocEntries']]!=['Cleric','Fighter','Rogue','Wizard']:raise ValueError('Changed four-class PDF scope')
    return {'schemaVersion':1,'status':'primary-toc-and-publication-boundary-witness-not-full-rules-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,'providerObservationId':provider['observationId'],'providerSourceId':1,
            'numericDndsuSourceId':None,'canonicalSourceId':None,'automaticAttribution':False,
            'sources':sources,'extractorVersion':pypdf.__version__,'basicPdf':basic,'digitalToc':digital,
            'existingSrdWitness':{'pages':403,'inspectedPdfPages':sorted({1,*[p for r in srd_heads for p in r['inspectedPdfPages']]}),
                'classHeadingEntries':srd_heads,'existingLicense':'CC-BY-4.0','scope':'legal identity and12class headings only; no new class rules/table extraction'},
            'relations':{'digitalVersusBasicPdf':'not-equivalent-toc-inventories',
                'digitalOnlyClassTocNames':[n for n in digital['classTocNames'] if n not in {r['name'] for r in basic['classTocEntries']}],
                'digitalOnlyChapterNumbers':[r['number'] for r in digital['chapters'] if r['number'] not in {c['number'] for c in basic['chapters']}],
                'digitalSrdSelectedClassNamesMatch':True,'digitalSrdFullTextEquivalence':'unverified',
                'srdLicenseExtendsToOtherDocuments':False,'commonCatalogTextReusePermission':'not-established'},
            'inputSha256':{path:digest(text.encode()) for path,text in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-basic-rules-boundary-2014.py','sha256':digest(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['Digital title2014 and provider release date are not a claim that a2018 PDF or present web text is the2014 text.',
                'TOC/class-heading metadata does not review full spells, monsters, items, class features or identical shared prose.',
                'The existing SRD license applies to that identified document, not this web page or Basic Rules PDF by title similarity.',
                'No full text/PDF/image/ownership/profile data is exported; no historical source IDs, runtime or residual15 are changed.']}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('capture_folder');parser.add_argument('--output');args=parser.parse_args();d=audit(args.capture_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'provider':1,'basicPdfClasses':d['basicPdf']['classCount'],'digitalClasses':d['digitalToc']['classCount'],
                      'basicPdfChapters':len(d['basicPdf']['chapters']),'digitalChapters':len(d['digitalToc']['chapters']),
                      'digitalSrdFullTextEquivalence':d['relations']['digitalSrdFullTextEquivalence']}))
