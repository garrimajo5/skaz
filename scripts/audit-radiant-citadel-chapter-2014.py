"""Verify a setting-hub first-chapter promotion without turning it into a whole anthology."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urljoin
HELPER=Path(__file__).with_name('audit-prisoner13-component-2014.py')
SPEC=importlib.util.spec_from_file_location('scoped_meta',HELPER);P=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(P)
CHILD='The Radiant Citadel';BOOK='Journeys through the Radiant Citadel'
ARTICLE="What You'll Discover at the Radiant Citadel, a City on the Ethereal Plane"
SNAPSHOTS={
 'article.html':('https://www.dndbeyond.com/posts/1270-what-youll-discover-at-the-radiant-citadel-a-city','https://www.dndbeyond.com/posts/1270-what-youll-discover-at-the-radiant-citadel-a-city','1c72cf90ac89d9591bb9980ca334417cf93eb9371f73cde6b6c4666bec9575a3'),
 'parent.html':('https://www.dndbeyond.com/sources/dnd/jttrc','https://www.dndbeyond.com/sources/dnd/jttrc','b044fd063b99b2ed73942d22eb96e763bf6868fbe0e02a05cda6f593fbda649b'),
 'child.html':('https://www.dndbeyond.com/sources/dnd/trc','https://www.dndbeyond.com/claim/source/the-radiant-citadel','91bda44c90c57071312f2a459d63f093a3afc177c738fc9c1b235b1919d36d6f'),
}
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-source-link-proposals-2014.json','catalog/library-current-publication-context-2014.json']
def sha(raw):return hashlib.sha256(raw).hexdigest()
def title(text):return P.clean(text).casefold()

def inspect_article(html):
    p=P.ScopedMetadataParser('section','p-article-content');p.feed(html);p.close()
    if p.containers!=1 or p.depth or {title(t) for t in p.titles}!={title(ARTICLE)}:raise ValueError('Ambiguous publisher article/body')
    kind=[r['text'] for r in p.paragraphs if 'The first chapter of this book' in r['text'] and 'hub of extraplanar adventure' in r['text']]
    identity=[r['text'] for r in p.paragraphs if 'first chapter of Journeys Through the Radiant Citadel' in r['text'] and 'The chapter is listed as "The Radiant Citadel."' in r['text']]
    if len(kind)!=1 or len(identity)!=1:raise ValueError('Missing unique first-chapter kind and separate distribution-label evidence')
    return {'title':ARTICLE,'firstChapterKindParagraphSha256':sha(kind[0].encode()),'distributionLabelParagraphSha256':sha(identity[0].encode()),
            'firstChapterSettingHubExplicit':True,'separateChapterListingLabel':CHILD,'scope':'two bounded publisher article paragraphs; not full chapter contents'}

class ContentsTocParser(P.ScopedMetadataParser):
    def __init__(self):super().__init__('div','chosen-contents-toc');self.section=None;self.observedTocSections=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='h2':
            if self.depth:raise ValueError('Section transition inside selected Contents TOC')
            self.section=a.get('id')
        if tag=='div' and 'compendium-toc-full-text' in a.get('class','').split():
            if self.depth:raise ValueError('Unexpected nested TOC container')
            self.observedTocSections.append(self.section)
            if self.section=='Contents':a['class']=a.get('class','')+' chosen-contents-toc'
        super().handle_starttag(tag,list(a.items()))

def inspect_parent(html):
    p=ContentsTocParser();p.feed(html);p.close()
    if p.containers!=1 or p.depth or {title(t) for t in p.titles}!={title(BOOK)}:raise ValueError('Ambiguous parent title/named Contents TOC')
    chapters=[h for h in p.headings if h['text']==CHILD]
    if len(chapters)!=1 or len(chapters[0]['links'])!=1:raise ValueError('Missing unique chapter heading in Contents, not statblocks')
    target=urljoin(SNAPSHOTS['parent.html'][0],chapters[0]['links'][0]['href'] or '')
    if target!='https://www.dndbeyond.com/sources/jttrc/the-radiant-citadel':raise ValueError('Wrong parent chapter target')
    return {'title':BOOK,'chapterTitle':CHILD,'chapterUrl':target,'observedTocSectionIds':p.observedTocSections,
            'selectedTocSectionId':'Contents','scope':'named Contents TOC; separate Statblocks section is not counted as adventures'}

class ClaimParser(P.ScopedMetadataParser):
    def __init__(self):super().__init__('div','claim-main');self.expiry=None;self.expiryCaptions=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);super().handle_starttag(tag,attrs)
        if self.depth and tag=='span' and 'claim-main__purchase-inactive' in a.get('class','').split():self.expiry=[]
    def handle_data(self,data):
        super().handle_data(data)
        if self.expiry is not None:self.expiry.append(data)
    def handle_endtag(self,tag):
        if tag=='span' and self.expiry is not None:self.expiryCaptions.append(P.clean(''.join(self.expiry)));self.expiry=None
        super().handle_endtag(tag)

def inspect_claim(html):
    p=ClaimParser();p.feed(html);p.close()
    if (p.containers!=1 or p.depth or {title(t) for t in p.titles}!={title(CHILD),title('Claim The Radiant Citadel now!')}
            or p.expiryCaptions!=['This promotion is no longer available.']):raise ValueError('Missing scoped current promotion-ended notice/claim identity')
    matches=[r['text'] for r in p.paragraphs if 'unlocking the first chapter of Journeys Through the Radiant Citadel at no cost' in r['text']]
    if len(matches)!=1:raise ValueError('Claim description is not the first chapter promotion')
    return {'currentPromotionEndedNotice':True,'firstChapterOfferMetadataSha256':sha(matches[0].encode()),
            'claimSubmitted':False,'authenticatedAccessUsed':False,'fullChapterRulesInspected':False,
            'priorClaimantOrBookOwnerAccessTested':False,'categoryRecordCountsEstablished':False,
            'scope':'claim-main description/ended notice only; generic toolset listing promises do not prove specific rules records'}

def audit(folder,root=Path('.')):
    folder=Path(folder);caps=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for name,(url,final,digest) in SNAPSHOTS.items():sources[name]=P.verify_capture((folder/name).read_bytes(),caps[name],url,final,digest)
    article=inspect_article((folder/'article.html').read_text(encoding='utf-8'));parent=inspect_parent((folder/'parent.html').read_text(encoding='utf-8'));claim=inspect_claim((folder/'child.html').read_text(encoding='utf-8'))
    texts=[(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS];lib,links,context=[json.loads(t) for t in texts];providers=[]
    for pid,name,file in [(87,BOOK,'parent.html'),(92,CHILD,'child.html')]:
        r=next(row for row in lib['records'] if row['providerSourceId']==pid)
        if title(r['title'])!=title(name) or r['sourceUrl']!=SNAPSHOTS[file][0] or r['providerRuleset']['name']!='5e' or r['providerIsThirdParty'] or r['displayedPublisher']!='Wizards of the Coast':raise ValueError('Changed library source identity')
        providers.append({key:r[key] for key in ['providerSourceId','observationId','title','sourceUrl','providerType','providerIsFree']})
    historic=next(r for r in links['records'] if r['dndsuSourceId']=='171')
    if title(historic['historicalTitle'])!=title(BOOK) or not any(r['preferredByEvidence'] and r['providerSourceId']==87 for r in historic['candidates']):raise ValueError('Changed existing anthology link')
    if 92 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Outside original residual')
    return {'schemaVersion':1,'status':'primary-setting-chapter-promotion-witness-not-whole-anthology-or-count-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,'sources':sources,'publisherStatement':article,'parentToc':parent,'claimBoundary':claim,
            'providerReferences':providers,'relationship':{'kind':'setting-hub-first-chapter-with-separate-promotion','childProviderSourceId':92,'parentProviderSourceId':87,
                'existingParentDndsuSourceId':'171','childDndsuSourceId':None,'canonicalSourceId':None,'automaticSourceReplacement':False,'automaticRecordAttribution':False,
                'wholeAnthologyUnlockedOrReviewed':False,'zeroOrNonzeroRulesRecordCountInferredFromMetadata':False,'fullTextEquivalence':'unverified','reusePermission':'not-established'},
            'inputSha256':{p:sha(t.encode()) for p,t in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-radiant-citadel-chapter-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParser':{'path':'scripts/audit-prisoner13-component-2014.py','sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['A separate first-chapter distribution is not the whole anthology or an independently proved new adventure.',
                      'Raw providerType adventure and generic toolset claims remain observations, not catalogue category counts or zero-content proof.',
                      'An ended promotion is not a claim about access held by prior claimants/book owners or redistribution rights.',
                      'No full text, account/profile data, source-ID replacement, runtime, canonical denominator or owner acceptance exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('capture_folder');p.add_argument('--output');args=p.parse_args();d=audit(args.capture_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'child':92,'parent':87,'kind':d['relationship']['kind'],'promotionEnded':True,'recordCountsEstablished':False}))
