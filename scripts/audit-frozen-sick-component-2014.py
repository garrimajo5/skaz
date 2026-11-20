"""Verify Frozen Sick's publication component without inferring scope from co-brand labels."""
import argparse
import hashlib
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
from urllib.parse import urljoin
HELPER=Path(__file__).with_name('audit-prisoner13-component-2014.py')
SPEC=importlib.util.spec_from_file_location('component_parser',HELPER);P=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(P)
SNAPSHOTS={
 'article.html':('https://www.dndbeyond.com/posts/1886-running-winter-adventures-in-d-d','https://www.dndbeyond.com/posts/1886-running-winter-adventures-in-d-d','140c694de56ff26fa4b57758d8c5ece70177060c17b134c82a4d525bd8b7414e'),
 'parent.html':('https://www.dndbeyond.com/sources/dnd/egtw','https://www.dndbeyond.com/sources/dnd/egtw','99fa12a4d4807052e4d3487fa3f5fd22329d611c123a9178afb2bc3dacc33214'),
 'child.html':('https://www.dndbeyond.com/sources/dnd/wa','https://www.dndbeyond.com/sources/dnd/wa/frozen-sick','4aea69c3b8de9759c0885520d28d76965c608881a29b6d6bacb810e487695669'),
}
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-source-link-proposals-2014.json','catalog/library-current-publication-context-2014.json']
PARENT="Explorer's Guide to Wildemount";CHILD='Frozen Sick'

def sha(raw):return hashlib.sha256(raw).hexdigest()
def title(text):return P.clean(text).replace('\u2019',"'")
def scoped(html,tag,css,expected):
    parser=P.ScopedMetadataParser(tag,css);parser.feed(html);parser.close()
    if parser.containers!=1 or parser.depth or not parser.titles or {title(t) for t in parser.titles}!={expected}:
        raise ValueError('Ambiguous primary title/container')
    return parser

def inspect_article(html):
    p=scoped(html,'section','p-article-content','Running Winter Adventures in D&D');matches=[]
    for row in p.paragraphs:
        text=title(row['text'])
        if not text.startswith('Frozen Sick is a short adventure') or 'It was included in '+PARENT not in text:continue
        links=[a for a in row['links'] if a['text']==CHILD and a['href']==SNAPSHOTS['child.html'][1]]
        if len(links)==1:matches.append(row)
    if len(matches)!=1:raise ValueError('Missing unique adventure inclusion statement and child link')
    return {'title':'Running Winter Adventures in D&D','relationParagraphSha256':sha(matches[0]['text'].encode()),
            'explicitAdventureIncludedInParent':True,'childLink':SNAPSHOTS['child.html'][1],
            'scope':'publisher article body only; later editorial reference is not a rules-version decision'}

def inspect_parent(html):
    p=scoped(html,'div','compendium-toc-full-text',PARENT)
    links=[a for a in p.links if a['text']==CHILD]
    if len(links)!=1:raise ValueError('Missing unique Frozen Sick TOC entry')
    target=urljoin(SNAPSHOTS['parent.html'][0],links[0]['href'] or '')
    if target!='https://www.dndbeyond.com/sources/egtw/adventures-in-wildemount-frozen-sick':raise ValueError('Changed parent adventure chapter identity')
    return {'title':PARENT,'adventureChapterLabel':CHILD,'adventureChapterUrl':target,'scope':'book TOC only; no parent full-chapter comparison'}

class IdentityParser(HTMLParser):
    def __init__(self):super().__init__();self.active=None;self.titles=[];self.canonical=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='h1':self.active=[]
        if tag=='link' and attrs.get('rel')=='canonical':self.canonical.append(attrs.get('href'))
    def handle_data(self,data):
        if self.active is not None:self.active.append(data)
    def handle_endtag(self,tag):
        if tag=='h1' and self.active is not None:self.titles.append(title(''.join(self.active)));self.active=None

def inspect_child_identity(html):
    p=IdentityParser();p.feed(html);p.close()
    if not p.titles or set(p.titles)!={CHILD} or p.canonical!=[SNAPSHOTS['child.html'][1]]:raise ValueError('Changed public child chapter identity')
    return {'title':CHILD,'canonicalUrl':p.canonical[0],'publicChapterSurfaceReached':True,
            'semanticFullAdventureRulesReviewed':False,'scope':'head canonical and h1 only; adventure prose is not collected'}

def audit(folder,root=Path('.')):
    folder=Path(folder);captures=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for name,(url,final,expected) in SNAPSHOTS.items():sources[name]=P.verify_capture((folder/name).read_bytes(),captures[name],url,final,expected)
    article=inspect_article((folder/'article.html').read_text(encoding='utf-8'))
    parent=inspect_parent((folder/'parent.html').read_text(encoding='utf-8'))
    child=inspect_child_identity((folder/'child.html').read_text(encoding='utf-8'))
    texts=[(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS]
    library,links,context=[json.loads(text) for text in texts];providers=[]
    for pid,name,file in [(59,PARENT,'parent.html'),(62,CHILD,'child.html')]:
        row=next(r for r in library['records'] if r['providerSourceId']==pid)
        if (title(row['title'])!=name or row['sourceUrl']!=SNAPSHOTS[file][0] or row['providerRuleset']['name']!='5e'
                or row['providerIsThirdParty'] or row['displayedPublisher']!='Critical Role'):raise ValueError('Changed co-brand library observation')
        providers.append({key:row[key] for key in ['observationId','providerSourceId','title','sourceUrl','displayedPublisher','providerIsThirdParty']})
    historical=next(r for r in links['records'] if r['dndsuSourceId']=='116');evidence=historical['publicationEvidence']
    preferred=[r for r in historical['candidates'] if r['preferredByEvidence']]
    if (title(historical['historicalTitle'])!=PARENT or evidence['publisher']!='Wizards of the Coast'
            or evidence['publicationKind']!='official-wotc-2014-publication' or len(preferred)!=1 or preferred[0]['providerSourceId']!=59):
        raise ValueError('Changed existing historical parent publication evidence')
    if 62 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Not in preserved residual15')
    return {'schemaVersion':1,'status':'primary-adventure-component-reference-not-scope-text-or-rights-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,'sources':sources,'publisherStatement':article,'parentToc':parent,
            'childIdentity':child,'providerReferences':providers,'existingParentPublicationEvidence':evidence,
            'relationship':{'kind':'adventure-chapter-with-separate-public-distribution','childProviderSourceId':62,'parentProviderSourceId':59,
                'existingParentDndsuSourceId':'116','childDndsuSourceId':None,'canonicalSourceId':None,
                'automaticSourceReplacement':False,'automaticRecordAttribution':False,'fullTextEquivalence':'unverified','reusePermission':'not-established'},
            'coBrandBoundary':{'displayedProviderPublisher':'Critical Role','existingParentPublicationEvidencePublisher':'Wizards of the Coast',
                'publisherLabelIsAutomaticExclusion':False,'childScopeAutomaticallyInherited':False,'ownerThirdPartyExclusionChanged':False},
            'inputSha256':{path:sha(text.encode()) for path,text in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-frozen-sick-component-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParser':{'path':'scripts/audit-prisoner13-component-2014.py','sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['A later editorial reference confirms a component relation, not a new edition or identical current texts.',
                      'The parent publication evidence was reviewed earlier; no claim of new full-parent or child rule acceptance.',
                      'The public child is not a claim landing, but only its title/canonical metadata was inspected here.',
                      'Co-brand metadata does not independently include/exclude this child or all Critical Role publications.',
                      'The15-row historical residual, IDs, source policies, canonical denominator, runtime and owner stages remain unchanged.',
                      'No full adventure/article prose, HTML, images, private profiles or account data is exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('capture_folder');p.add_argument('--output');args=p.parse_args();d=audit(args.capture_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'child':62,'parent':59,'parentDndsuSource':'116','kind':d['relationship']['kind'],'fullRulesReviewed':False}))
