"""Pin Wayfinder prototype, historical staff-revision and campaign-only AL boundaries."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from urllib.parse import urljoin,urlsplit,parse_qs
from pypdf import PdfReader
HELPER=Path(__file__).with_name('audit-prisoner13-component-2014.py')
SPEC=importlib.util.spec_from_file_location('scoped_metadata',HELPER);P=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(P)
TITLE="Wayfinder's Guide to Eberron"
TOPIC='https://www.dndbeyond.com/forums/d-d-beyond-general/news-announcements/53261-wayfinders-guide-to-eberron-pre-update-content'
SNAPSHOTS={
 'source.html':('https://www.dndbeyond.com/sources/dnd/wgte','eddfdc5056e6de0c163279514e499b53ed88b21c211ca93dbfad4811a2fcda5f'),
 'announcement.html':(TOPIC,'45bdd1849835c03a6e53593324f49fddf4d88f385685fbf09c1c90961b2803f1'),
 'al-guide.pdf':('https://media.dndbeyond.com/compendium-images/ddal/reference-docs/03-2024/d%26d-adventurers-league-adaptation-guides-v2.4.pdf','ee0ffa32ccab84212b518380ab81d720d15e8c1ccaa529750666fc235123dcbb'),
}
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-current-publication-context-2014.json']
def sha(raw):return hashlib.sha256(raw).hexdigest()
def clean(text):return P.clean(text).replace('\u2019',"'").replace('\u2018',"'")

class IntroParser(P.ScopedMetadataParser):
    def __init__(self):super().__init__('blockquote','compendium-toc-blockquote');self.text=[]
    def handle_data(self,data):
        super().handle_data(data)
        if self.depth:self.text.append(data)

def inspect_prototype(html):
    p=IntroParser();p.feed(html);p.close()
    if p.containers!=1 or p.depth or {clean(t) for t in p.titles}!={TITLE}:raise ValueError('Ambiguous Wayfinder source/introduction')
    text=clean(' '.join(p.text))
    if 'campaign prototype' not in text:raise ValueError('Missing bounded prototype description')
    return {'title':TITLE,'prototypeDescriptionStillDisplayed':True,'introMetadataSha256':sha(text.encode()),
            'scope':'public marketing introduction, not current full mechanics or every historical version'}

class FirstStaffPostParser(P.ScopedMetadataParser):
    def __init__(self):super().__init__('div','selected-staff-post-body');self.first_staff_marker=False
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if tag=='a' and 'first-dev-comment' in a.get('class','').split() and a.get('data-first-dev-comment-index')=='1':
            u=urlsplit(urljoin(TOPIC,a.get('href') or ''))
            if u.scheme=='https' and u.netloc=='www.dndbeyond.com' and u.path==urlsplit(TOPIC).path and parse_qs(u.query).get('comment')==['1']:
                self.first_staff_marker=True
        if tag=='blockquote' and self.depth:raise ValueError('Quoted text is not accepted as original staff statement')
        if tag=='div' and a.get('id')=='forum-post-body-1':a['class']=a.get('class','')+' selected-staff-post-body'
        super().handle_starttag(tag,list(a.items()))

def inspect_staff_revision(html):
    p=FirstStaffPostParser();p.feed(html);p.close()
    if p.containers!=1 or p.depth or not p.first_staff_marker:raise ValueError('Missing exact first-staff-post marker/body1')
    matches=[]
    for row in p.paragraphs:
        text=clean(row['text'])
        if (re.search(r'\bold\b',text) and 'version of WGtE' in text and 'Specific content' in text
                and 'public homebrew' in text and 'non-official mechanics' in text):matches.append(text)
    if len(matches)!=1:raise ValueError('Missing bounded specific-old-version/non-official distinction')
    return {'topicUrl':TOPIC,'postIndex':1,'firstStaffNavigationMarkerPresent':True,'postBodyId':'forum-post-body-1',
            'statementSha256':sha(matches[0].encode()),'specificOldMechanicsRecreatedAsPublicHomebrew':True,
            'allVersionsOrAllBookTextDeclaredHomebrew':False,'scope':'only original body1 identified by first-staff marker; no user replies/quotes or metadata description'}

def inspect_al_boundaries(version_text,scope_text,eberron_text,page_count):
    version=clean(version_text);scope=clean(scope_text);text=clean(eberron_text)
    if page_count!=67 or not re.search(r'Version\s+2\.4\b',version):raise ValueError('Changed AL guide bibliographic identity')
    if 'official organized play campaign' not in scope or 'use these as suggestions' not in scope:raise ValueError('Missing organized-play-only scope boundary')
    if 'Eberron Campaign' not in text:raise ValueError('Missing named campaign scope')
    start=text.find(TITLE+' is not a legal source');stop=text.find('Always use the most recent iteration',start)
    if start<0 or stop<0:raise ValueError('Missing exact conditional AL passage boundaries')
    unit=text[start:stop]
    if not all(x in unit for x in ['except in the case','matches Eberron: Rising from the Last War exactly']):raise ValueError('Missing conditional exact-match exception')
    return {'version':'2.4','pages':67,'inspectedPdfPages':[1,3,18],'campaign':'Eberron Campaign',
            'conditionalPassageSha256':sha(unit.encode()),'exactRisingTextExceptionPresent':True,
            'alLegalityIsGeneralCatalogOrHomeGamePermission':False,'scope':'campaign-specific adaptation guidance only, not global official-status adjudication'}

def audit(folder,root=Path('.')):
    folder=Path(folder);capture=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for file,(url,digest) in SNAPSHOTS.items():sources[file]=P.verify_capture((folder/file).read_bytes(),capture[file],url,url,digest)
    prototype=inspect_prototype((folder/'source.html').read_text(encoding='utf-8'));staff=inspect_staff_revision((folder/'announcement.html').read_text(encoding='utf-8'))
    pdf=PdfReader(folder/'al-guide.pdf');al=inspect_al_boundaries(pdf.pages[0].extract_text(),pdf.pages[2].extract_text(),pdf.pages[17].extract_text(),len(pdf.pages))
    texts=[(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS];library,context=[json.loads(t) for t in texts]
    r=next(row for row in library['records'] if row['providerSourceId']==37)
    if clean(r['title'])!=TITLE or r['sourceUrl']!=SNAPSHOTS['source.html'][0] or r['providerRuleset']['name']!='5e' or r['displayedPublisher']!='Wizards of the Coast' or r['providerIsThirdParty']:
        raise ValueError('Changed observed library identity')
    if 37 not in {row['providerSourceId'] for row in context['remainingUnlinkedProviderReferences']}:raise ValueError('Outside original residual')
    attempts=capture.get('limitedAttempts',[])
    if len(attempts)!=2 or attempts[0].get('errorType')!='TimeoutError' or attempts[1].get('status')!=403 or any(a.get('retried') for a in attempts):raise ValueError('Changed author-recorded external attempt limits')
    return {'schemaVersion':1,'status':'primary-version-status-boundaries-not-whole-publication-inclusion-or-exclusion',
            'accepted':False,'complete':False,'approvedDenominator':None,'providerSourceId':37,'providerObservationId':r['observationId'],
            'numericDndsuSourceId':None,'canonicalSourceId':None,'automaticAttribution':False,'sources':sources,
            'prototypeMetadata':prototype,'historicalStaffRevisionBoundary':staff,'campaignOnlyGuidance':al,
            'versionScopeProposal':{'specificOldNonOfficialMechanicsEligibleForCommonCatalog':False,
                'currentOrUpdatedVersionOfficialStatus':'requires-version-specific-evidence',
                'prototypeMarketingLabelAutomaticallyExcludesEveryVersion':False,'wotcPublisherLabelAutomaticallyIncludesAllMechanics':False,
                'exactCurrentWgteAndRisingTextEquivalence':'unverified','ownerExperimentalExclusionChanged':False,
                'profileManualExceptionsRetained':True,'alEventRestrictionBlocksOrdinaryProfileAction':False},
            'authorObservedExternalConditions':{'limitedAttempts':attempts,'currentFullMechanicsRead':False,
                'interpretation':'body-read timeout and403 are concrete limited attempts, not evidence of publication status or permanent denial'},
            'inputSha256':{p:sha(t.encode()) for p,t in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-wayfinder-version-boundary-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParser':{'path':'scripts/audit-prisoner13-component-2014.py','sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['A prototype cover description is not a complete current-version mechanics review.',
                      'Specific old non-official mechanics and updated content must not be conflated with all book versions or lore.',
                      'Campaign event eligibility is not a general rule prohibition, catalogue scope decision or user-action authorization.',
                      'No full mechanics/PDF/HTML/prose/private profiles/automatic source attribution or owner-stage acceptance exported.',
                      'Full versions, record units, official status of exact updated passages, translations and reuse rights remain unresolved.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('capture_folder');p.add_argument('--output');args=p.parse_args();d=audit(args.capture_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'provider':37,'oldSpecificNonOfficialEligible':False,'currentStatus':d['versionScopeProposal']['currentOrUpdatedVersionOfficialStatus'],'alIsGeneralBan':False}))
