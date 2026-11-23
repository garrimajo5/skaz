"""A two-provider Stormwreck witness with explicit partial reuse and body-only provenance."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urljoin
HELPER=Path(__file__).with_name('audit-prisoner13-component-2014.py')
SPEC=importlib.util.spec_from_file_location('storm_metadata',HELPER);P=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(P)
BOOK='Dragons of Stormwreck Isle';INTRO='Intro to Stormwreck Isle';ARTICLE=INTRO+': Your Free Introduction to D&D'
BODY_PINS={
 'article.html':('https://www.dndbeyond.com/posts/1582-intro-to-stormwreck-isle-your-free-introduction-to','a8bc6a040b443e3799569804bb08fabd7576cfdbea9fcf2b835b43ced8e9a83b'),
 'parent.html':('https://www.dndbeyond.com/sources/dnd/dosi','cf92da46836bb4a4be32ecd125b15bfff0939f252bfa23b074ea754e1d74b016'),
}
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-source-link-proposals-2014.json','catalog/library-current-publication-context-2014.json']
def sha(raw):return hashlib.sha256(raw).hexdigest()

def verify_body(raw,record,url,digest):
    expected_keys={'recordType','requestedUrl','httpStatus','finalUrl','bytes','sha256'}
    if (set(record)!=expected_keys or record['recordType']!='saved-response-body-without-retained-transaction' or record['requestedUrl']!=url
            or record['httpStatus'] is not None or record['finalUrl'] is not None or record['bytes']!=len(raw)
            or record['sha256']!=digest or sha(raw)!=digest):raise ValueError('Body-only artifact identity/provenance mismatch; do not invent HTTP receipt')
    return dict(record)

class CanonicalScopedParser(P.ScopedMetadataParser):
    def __init__(self,tag,css):super().__init__(tag,css);self.canonical=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='link' and a.get('rel')=='canonical':self.canonical.append(a.get('href'))
        super().handle_starttag(tag,attrs)

class EncounterArticleParser(CanonicalScopedParser):
    def __init__(self):super().__init__('section','p-article-content');self.item=None;self.items=[]
    def handle_starttag(self,tag,attrs):
        super().handle_starttag(tag,attrs)
        if self.depth and tag=='li':
            if self.item is not None:raise ValueError('Nested article item requires separate boundary review')
            self.item=[]
    def handle_data(self,data):
        super().handle_data(data)
        if self.item is not None:self.item.append(data)
    def handle_endtag(self,tag):
        if tag=='li' and self.item is not None:self.items.append(P.clean(''.join(self.item)));self.item=None
        super().handle_endtag(tag)

def inspect_article(html):
    p=EncounterArticleParser();p.feed(html);p.close()
    if p.containers!=1 or p.depth or set(p.titles)!={ARTICLE} or p.canonical!=[BODY_PINS['article.html'][0]]:raise ValueError('Ambiguous canonical publisher article')
    pair=[r['text'] for r in p.paragraphs if 'includes two encounters, Voyage to Stormwreck Isle and Drowned Sailors' in r['text'] and BOOK in r['text']]
    voyage=[r for r in p.items if r.startswith('Voyage to Stormwreck Isle is set aboard a ship')]
    drowned=[r for r in p.items if r.startswith('Drowned Sailors is from the first chapter of '+BOOK) and 'follows the events of Voyage to Stormwreck Isle' in r]
    if len(pair)!=1 or len(voyage)!=1 or len(drowned)!=1:raise ValueError('Missing unique two-encounter and partial-reuse evidence')
    return {'title':ARTICLE,'canonicalUrl':p.canonical[0],'pairParagraphSha256':sha(pair[0].encode()),
            'encounterEvidence':[{'title':'Voyage to Stormwreck Isle','descriptionSha256':sha(voyage[0].encode()),'originRelativeToFullBook':'not-established'},
                                 {'title':'Drowned Sailors','descriptionSha256':sha(drowned[0].encode()),'explicitFirstChapterReuseReference':True}],
            'allIntroTextOrWholeFirstChapterIdentical':False,'scope':'publisher paragraph and two encounter-list items; no full encounter-text comparison'}

def inspect_book(html):
    p=CanonicalScopedParser('div','compendium-toc-full-text');p.feed(html);p.close()
    if p.containers!=1 or p.depth or set(p.titles)!={BOOK} or p.canonical!=[BODY_PINS['parent.html'][0]]:raise ValueError('Ambiguous full-adventure source identity')
    matches=[a for a in p.links if a['text']=='Drowned Sailors']
    if len(matches)!=1:raise ValueError('Missing unique shared encounter reference')
    target=urljoin(BODY_PINS['parent.html'][0],matches[0]['href'] or '')
    if target!='https://www.dndbeyond.com/sources/dosi/dragons-rest#DrownedSailors':raise ValueError('Wrong shared encounter locator')
    return {'title':BOOK,'canonicalUrl':p.canonical[0],'sharedEncounterReference':{'title':'Drowned Sailors','url':target},
            'scope':'complete-adventure source identity and one TOC reference, not complete rules/Starter Set box contents'}

def audit(folder,root=Path('.')):
    folder=Path(folder);caps=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for name,(url,digest) in BODY_PINS.items():sources[name]=verify_body((folder/name).read_bytes(),caps[name],url,digest)
    article=inspect_article((folder/'article.html').read_text(encoding='utf-8'));book=inspect_book((folder/'parent.html').read_text(encoding='utf-8'))
    attempt=caps['limitedAttempt']
    if (attempt.get('requestedUrl')!='https://www.dndbeyond.com/sources/dnd/itsi' or attempt.get('errorType')!='TimeoutError'
            or attempt.get('timeoutSeconds')!=25 or attempt.get('retried')):raise ValueError('Changed single limited intro attempt')
    texts=[(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS];lib,links,context=[json.loads(t) for t in texts];refs=[]
    for pid,title,url in [(94,BOOK,BODY_PINS['parent.html'][0]),(128,INTRO,'https://www.dndbeyond.com/sources/dnd/itsi')]:
        r=next(r for r in lib['records'] if r['providerSourceId']==pid)
        if r['title']!=title or r['sourceUrl']!=url or r['providerRuleset']['name']!='5e' or r['providerIsThirdParty'] or r['displayedPublisher']!='Wizards of the Coast':raise ValueError('Changed separate publication identity')
        refs.append({k:r[k] for k in ['providerSourceId','observationId','title','sourceUrl','providerReleaseDate','providerRuleset']})
    if any(r['historicalTitle'] in [BOOK,INTRO] for r in links['records']):raise ValueError('Historical numeric link now exists; refresh scope rather than inventing IDs')
    if not {94,128}.issubset({r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}):raise ValueError('Outside original residual pair')
    witnesses={str(pid):{'providerSourceId':pid,'title':title,'kind':kind,'accepted':False,'numericDndsuSourceId':None,'canonicalSourceId':None,'automaticAttribution':False,'fullRulesReviewed':False}
               for pid,title,kind in [(94,BOOK,'starter-adventure-source-reference'),(128,INTRO,'two-encounter-intro-with-explicit-partial-reuse')]}
    return {'schemaVersion':1,'status':'paired-publication-and-partial-reuse-witness-with-body-only-capture-limits',
            'accepted':False,'complete':False,'approvedDenominator':None,'providerSourceIds':[94,128],'perProviderWitnesses':witnesses,
            'sources':sources,'publisherArticle':article,'fullAdventureSource':book,'libraryReferences':refs,
            'relationship':{'kind':'two-encounter-lead-in-with-one-explicit-first-chapter-reuse-reference','introProviderSourceId':128,'fullAdventureProviderSourceId':94,
                'exactEncounterTextEquivalence':'unverified','voyageOriginRelativeToBook':'not-established','wholeIntroIsWholeFirstChapter':False,
                'wholeAdventureUnlockedOrReviewed':False,'starterSetBrandInventsHistoricalIdOrAlias':False,'reusePermission':'not-established'},
            'authorObservedAccessAndProvenanceLimits':{'introRequest':attempt,'introBodyOrAccessStateInspected':False,
                'successfulBodyResponsesRetainedWithoutTransactionMetadata':True,'httpStatusAndFinalUrlNotInvented':True,
                'bodyCanonicalAndPublisherArticleCorroborateIdentity':True,'scope':'less complete transfer provenance; no proof of current Intro access, promo status or permanent denial'},
            'inputSha256':{p:sha(t.encode()) for p,t in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-stormwreck-publication-pair-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParser':{'path':'scripts/audit-prisoner13-component-2014.py','sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['Bodies were saved by successful anonymous reads, but final URL/status receipts were lost when the parallel intro read timed out.',
                      'Only SHA/bytes/requested URL/body canonical are claimed; source transfer provenance is explicitly weaker than complete receipt captures.',
                      'One encounter is explicitly referenced from chapter1; neither exact prose identity nor whole-intro/chapter equality is established.',
                      'No public promotion status, full rules, pregenerated sheets, private profile, automatic attribution, denominator or owner acceptance exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('capture_folder');p.add_argument('--output');args=p.parse_args();d=audit(args.capture_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'providers':[94,128],'introEncounterReferences':2,'explicitPartialReuseReferences':1,'httpReceiptsRetained':False,'wholeChapterEquality':False}))
