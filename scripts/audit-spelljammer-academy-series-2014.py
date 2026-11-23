"""Verify four Academy parts and separate advertised completion from optional AL timing."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urljoin,urlsplit
from pypdf import PdfReader
HELPER=Path(__file__).with_name('audit-prisoner13-component-2014.py')
CLAIM_HELPER=Path(__file__).with_name('audit-radiant-citadel-chapter-2014.py')
def module(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
P=module('academy_metadata',HELPER);C=module('academy_claim',CLAIM_HELPER)
TITLE='Spelljammer Academy';ARTICLE='What Is the Spelljammer Academy Adventure Series?'
PARTS=[('Orientation','orientation'),('Trial By Fire','trial-by-fire'),('Realmspace Sortie!','realmspace-sortie'),("Behold... H'Catha",'behold-hcatha')]
SNAPSHOTS={
 'source.html':('https://www.dndbeyond.com/sources/dnd/sja','13243600ab73ce80190d5794bdf8f49d3b760a802a8c3fe0ba4c9963d0bd67bb'),
 'article.html':('https://www.dndbeyond.com/posts/1284-what-is-the-spelljammer-academy-adventure-series','3305e19f4bb937b4582327fbba8876f32d15cb2752f122175bf5278619de68a6'),
 'claim.html':('https://www.dndbeyond.com/claim/source/spelljammer-academy','f968b2af7f3e46d0332022bce9859e4b14adbcdc46ea4d3a1ccae593a2e130e2'),
}
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-source-link-proposals-2014.json','catalog/library-current-publication-context-2014.json','catalog/wayfinder-version-boundary-2014.json']
def sha(raw):return hashlib.sha256(raw).hexdigest()
def clean(text):return P.clean(text).replace('\u2019',"'")

class SeriesTocParser(P.ScopedMetadataParser):
    def __init__(self):super().__init__('div','compendium-toc-full-text');self.root_heading=None;self.pending=None;self.parts=[];self.part_link_start=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='h2':
            if self.depth:raise ValueError('Part heading inside a component TOC')
            self.root_heading=[]
        if tag=='div' and 'compendium-toc-full-text' in a.get('class','').split():
            if self.depth or self.pending is None:raise ValueError('Unpaired/nested component TOC')
            self.part_link_start=len(self.links);self.parts.append({**self.pending,'links':[]});self.pending=None
        super().handle_starttag(tag,attrs)
    def handle_data(self,data):
        super().handle_data(data)
        if self.root_heading is not None:self.root_heading.append(data)
    def handle_endtag(self,tag):
        closes=tag=='div' and self.depth==1
        super().handle_endtag(tag)
        if closes:self.parts[-1]['links']=self.links[self.part_link_start:]
        if tag=='h2' and self.root_heading is not None:
            text=clean(''.join(self.root_heading));self.root_heading=None;m=re.fullmatch(r'(\d{2}):\s*(.+)',text)
            if m:
                if self.pending is not None:raise ValueError('Unconsumed part heading')
                self.pending={'number':int(m[1]),'title':m[2]}

def inspect_parts(html):
    p=SeriesTocParser();p.feed(html);p.close()
    if p.depth or p.pending or p.containers!=4 or [r['number'] for r in p.parts]!=[1,2,3,4] or {clean(x) for x in p.titles}!={TITLE}:raise ValueError('Missing/ambiguous ordered four-part series')
    result=[]
    for row,(name,slug) in zip(p.parts,PARTS):
        expected='https://www.dndbeyond.com/sources/sja/'+slug
        if row['title']!=name or not row['links']:raise ValueError('Changed named series part')
        links=[]
        for a in row['links']:
            u=urlsplit(urljoin(SNAPSHOTS['source.html'][0],a['href'] or ''))
            if u._replace(query='',fragment='').geturl()!=expected:raise ValueError('Wrong component link namespace/target')
            if a['text']=='Creature Statistics':links.append({'label':a['text'],'url':u.geturl()})
        result.append({'number':row['number'],'title':name,'chapterUrl':expected,'creatureStatisticsReferences':links})
    return {'title':TITLE,'orderedPartReferences':result,'proposedComponentReferences':4,'scope':'four named TOC components only; repeated section labels are not merged as creature records'}

def inspect_article(html):
    p=P.ScopedMetadataParser('section','p-article-content');p.feed(html);p.close()
    if p.containers!=1 or p.depth or {clean(t) for t in p.titles}!={ARTICLE}:raise ValueError('Ambiguous primary article')
    rows=[r['text'] for r in p.paragraphs if 'series of four adventures' in r['text'] and re.search(r'levels 1[–-]5',r['text']) and 'Light of Xaryxis' in r['text'] and 'included in Spelljammer: Adventures in Space' in r['text']]
    if len(rows)!=1:raise ValueError('Missing same-paragraph series/completion/preparation relation')
    return {'title':ARTICLE,'statementSha256':sha(rows[0].encode()),'advertisedStartLevel':1,'advertisedCompletionLevel':5,
            'preparesForAdventure':'Light of Xaryxis','relatedBoxedSetTitle':'Spelljammer: Adventures in Space',
            'containedInBoxedSet':'not-established','scope':'one publisher introductory paragraph; not class-level automation'}

def inspect_claim(html):
    p=C.ClaimParser();p.feed(html);p.close()
    if p.containers!=1 or p.depth or {clean(t) for t in p.titles}!={TITLE,'Claim Spelljammer Academy now!'} or p.expiryCaptions!=['This promotion is no longer available.']:raise ValueError('Missing scoped ended promotion/claim identity')
    rows=[r['text'] for r in p.paragraphs if 'series of four adventures' in r['text']]
    if len(rows)!=1:raise ValueError('Missing four-part offer description')
    return {'currentPromotionEndedNotice':True,'offerDescriptionSha256':sha(rows[0].encode()),'claimSubmitted':False,
            'authenticatedAccessUsed':False,'priorClaimantAccessTested':False,'fullAdventureRulesReviewed':False}

def inspect_al_timing(text):
    text=clean(text);lower=text.casefold();start=lower.find('spelljammer academy level requirements for play');stop=text.find('they wish to play.',start)
    if start<0 or stop<0:raise ValueError('Missing exact Academy timing subsection')
    unit=text[start:stop+len('they wish to play.')]
    if not all(x in unit for x in ['as an option for SJA Adventurers League play','in any order','4th level before finishing all the Spelljammer Academy adventures they wish to play']):raise ValueError('Lost optional campaign context or before-finish timing')
    return {'pdfPage':48,'subsectionSha256':sha(unit.encode()),'designedSequentialParts':True,'alOptionalTierOneAnyOrder':True,
            'alBeforeSelectedAdventuresFinishedOrdinaryMaximumLevel':4,'allFourPartsAlwaysMandatory':False,
            'globalProfileMaximumLevelIs4':False,'automaticLevelGrantedOnMetadataImport':False,
            'scope':'AL before-completion guidance, compatible with advertised completion5; not a global class or game-action cap'}

def audit(folder,guide_folder,root=Path('.')):
    folder=Path(folder);caps=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for name,(url,digest) in SNAPSHOTS.items():sources[name]=P.verify_capture((folder/name).read_bytes(),caps[name],url,url,digest)
    parts=inspect_parts((folder/'source.html').read_text(encoding='utf-8'));article=inspect_article((folder/'article.html').read_text(encoding='utf-8'));claim=inspect_claim((folder/'claim.html').read_text(encoding='utf-8'))
    texts=[(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS];lib,links,context,wayfinder=[json.loads(t) for t in texts]
    guide=Path(guide_folder)/'al-guide.pdf';pin=wayfinder['sources']['al-guide.pdf']
    if sha(guide.read_bytes())!=pin['sha256'] or guide.stat().st_size!=pin['bytes']:raise ValueError('Changed reused AL guide')
    pdf=PdfReader(guide)
    if len(pdf.pages)!=67:raise ValueError('Changed guide identity')
    timing=inspect_al_timing(pdf.pages[47].extract_text());sources['reusedALGuide']={**pin,'newlyInspectedPdfPages':[48]}
    r=next(x for x in lib['records'] if x['providerSourceId']==93)
    if r['title']!=TITLE or r['sourceUrl']!=SNAPSHOTS['source.html'][0] or r['providerRuleset']['name']!='5e' or r['providerIsThirdParty'] or r['displayedPublisher']!='Wizards of the Coast':raise ValueError('Changed series library identity')
    related=next(x for x in links['records'] if x['dndsuSourceId']=='160')
    if related['historicalTitle']!='Spelljammer: Adventures in Space' or not any(x['preferredByEvidence'] and x['providerSourceId']==90 for x in related['candidates']):raise ValueError('Changed related boxed-set identity')
    if 93 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Outside original residual')
    return {'schemaVersion':1,'status':'primary-ordered-adventure-series-witness-not-rules-count-or-runtime-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,'providerSourceId':93,'providerObservationId':r['observationId'],
            'numericDndsuSourceId':None,'canonicalSourceId':None,'automaticAttribution':False,'sources':sources,
            'seriesToc':parts,'publisherStatement':article,'claimBoundary':claim,'campaignTiming':timing,
            'relationship':{'kind':'four-part-preparatory-adventure-series','relatedBoxedSetProviderSourceId':90,'relatedBoxedSetExistingDndsuSourceId':'160',
                'containedInBoxedSet':'not-established','isAliasOfBoxedSet':False,'genericALSource169Assigned':False,'fullTextOrRecordEquivalence':'unverified','reusePermission':'not-established'},
            'inputSha256':{p:sha(t.encode()) for p,t in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-spelljammer-academy-series-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParsers':[{'path':'scripts/'+p.name,'sha256':sha(p.read_bytes().replace(b'\r\n',b'\n'))} for p in [HELPER,CLAIM_HELPER]],
            'limits':['Four component references are not four accepted creature/spell/item units or the whole related boxed set.',
                      'Repeated Creature Statistics headings remain scoped to their parts, without assumed duplicate record identities.',
                      'Completion5 and AL stay-at-most4 before finishing selected adventures describe different timing, not inconsistent versions.',
                      'No automatic level grant, all-parts mandate, global profile cap or removal of personal manual exceptions.',
                      'No full adventure/PDF/HTML/private profile, new source attribution, catalogue denominator or owner acceptance exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('capture_folder');p.add_argument('guide_folder');p.add_argument('--output');args=p.parse_args();d=audit(args.capture_folder,args.guide_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'provider':93,'componentReferences':4,'advertisedCompletion':5,'alCap4Timing':'before-selected-adventures-finished','runtimeChanged':False}))
