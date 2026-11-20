"""Verify one adventure/anthology reference relation without merging rules or statblocks."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urljoin,urlsplit

SNAPSHOTS={
 'article.html':('https://www.dndbeyond.com/posts/1438-claim-your-copy-of-prisoner-13-and-infiltrate','https://www.dndbeyond.com/posts/1438-claim-your-copy-of-prisoner-13-and-infiltrate','77dbe0a1e6f431db8f81e99856fa78e8ce7b28d6dc01843b76a64f65f72fb9ed'),
 'parent.html':('https://www.dndbeyond.com/sources/dnd/kftgv','https://www.dndbeyond.com/sources/dnd/kftgv','c1088c618c526335f480d2be64f094a34e9b45710bc5ef0efb40252f9b277347'),
 'child.html':('https://www.dndbeyond.com/sources/dnd/p13','https://www.dndbeyond.com/claim/source/prisoner-13','9ddf70b7307ae6a10ee794cbe30b5a24a5c85bbb93b3a90513a180814938841f'),
}
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-current-publication-context-2014.json','catalog/library-source-link-proposals-2014.json']
ARTICLE_TITLE="Claim Your Copy of Prisoner 13 and Infiltrate Revel's End!"
PARENT='Keys from the Golden Vault';CHILD='Prisoner 13'

def clean(text):return ' '.join(unicodedata.normalize('NFKC',text).split())
def sha(raw):return hashlib.sha256(raw).hexdigest()

def verify_capture(raw,c,url,final,expected):
    if (c.get('requestedUrl')!=url or c.get('finalUrl')!=final or c.get('status')!=200 or c.get('bytes')!=len(raw)
            or c.get('sha256')!=expected or sha(raw)!=expected):raise ValueError('Pinned public artifact URL/status/bytes/SHA mismatch')
    return {key:c[key] for key in ['requestedUrl','finalUrl','status','bytes','sha256','capturedAt']}

class ScopedMetadataParser(HTMLParser):
    def __init__(self,tag,css):
        super().__init__(convert_charrefs=True);self.tag=tag;self.css=css;self.depth=0;self.containers=0
        self.title=None;self.titles=[];self.para=None;self.paragraphs=[];self.heading=None;self.headings=[];self.anchor=None;self.links=[]
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        if tag=='h1':self.title=[]
        if tag==self.tag:
            if self.css in attrs.get('class','').split():
                if self.depth:raise ValueError('Nested evidence containers')
                self.depth=1;self.containers+=1
            elif self.depth:self.depth+=1
        if not self.depth:return
        if tag=='p':self.para={'text':[],'links':[]}
        if tag=='h3':self.heading={'text':[],'links':[]}
        if tag=='a':self.anchor={'text':[],'href':attrs.get('href')}
    def handle_data(self,data):
        for target in [self.title,self.para and self.para['text'],self.heading and self.heading['text'],self.anchor and self.anchor['text']]:
            if target is not None:target.append(data)
    def handle_endtag(self,tag):
        if tag=='h1' and self.title is not None:self.titles.append(clean(''.join(self.title)));self.title=None
        if not self.depth:return
        if tag=='a' and self.anchor is not None:
            a=self.anchor;self.anchor=None;a['text']=clean(''.join(a['text']));self.links.append(a)
            if self.para is not None:self.para['links'].append(a)
            if self.heading is not None:self.heading['links'].append(a)
        if tag=='p' and self.para is not None:
            self.para['text']=clean(''.join(self.para['text']));self.paragraphs.append(self.para);self.para=None
        if tag=='h3' and self.heading is not None:
            self.heading['text']=clean(''.join(self.heading['text']));self.headings.append(self.heading);self.heading=None
        if tag==self.tag:self.depth-=1
    def finish(self,html,title):
        self.feed(html);self.close()
        if self.containers!=1 or self.depth or not self.titles or set(self.titles)!={title}:raise ValueError('Ambiguous primary title/container')
        return self

def inspect_article(html):
    p=ScopedMetadataParser('section','p-article-content').finish(html,ARTICLE_TITLE)
    matches=[]
    for row in p.paragraphs:
        if not re.search(r'Prisoner 13 is a heist-based adventure from the upcoming anthology\s*'+re.escape(PARENT),row['text']):continue
        targets=[a for a in row['links'] if a['text']==PARENT and a['href'] and
                 urlsplit(a['href']).scheme=='https' and urlsplit(a['href']).netloc=='www.dndbeyond.com' and
                 urlsplit(a['href']).path=='/marketplace/adventures/keys-from-the-golden-vault']
        if len(targets)==1:matches.append((row,targets[0]))
    if len(matches)!=1:raise ValueError('Missing unambiguous publisher adventure-from-anthology statement/link')
    row,target=matches[0]
    return {'title':ARTICLE_TITLE,'relationParagraphSha256':sha(row['text'].encode()),'parentLink':target['href'],
            'explicitAdventureFromAnthologyStatement':True,
            'publicArticleOffersClaimAtNoCost':any('claim Prisoner 13 at no cost' in r['text'] for r in p.paragraphs),
            'scope':'publisher article body only; comments/navigation excluded'}

def inspect_parent(html):
    p=ScopedMetadataParser('div','compendium-toc-full-text').finish(html,PARENT)
    matches=[h for h in p.headings if h['text']==CHILD]
    if len(matches)!=1 or len(matches[0]['links'])!=1:raise ValueError('Missing unique adventure TOC heading')
    link=matches[0]['links'][0];url=urljoin(SNAPSHOTS['parent.html'][0],link['href'] or '')
    if url!='https://www.dndbeyond.com/sources/kftgv/prisoner-13':raise ValueError('Changed adventure chapter identity')
    statblocks=[a for a in p.links if a['text']=='Stat Block: Prisoner 13']
    if len(statblocks)!=1:raise ValueError('Missing distinct same-name statblock TOC witness')
    stat_url=urljoin(SNAPSHOTS['parent.html'][0],statblocks[0]['href'] or '')
    if urlsplit(stat_url)._replace(fragment='').geturl()!=url or not urlsplit(stat_url).fragment:raise ValueError('Changed statblock fragment identity')
    return {'title':PARENT,'adventureHeading':CHILD,'adventureChapterUrl':url,
            'sameNameStatblock':{'tocLabel':statblocks[0]['text'],'url':stat_url,'catalogUnitDecision':'separate-kind-review-required'},
            'scope':'anthology TOC metadata only; no chapter/full statblock text inspected'}

def audit(folder,root=Path('.')):
    folder=Path(folder);captures=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for file,(url,final,expected) in SNAPSHOTS.items():
        raw=(folder/file).read_bytes();c=captures[file]
        sources[file]=verify_capture(raw,c,url,final,expected)
    article=inspect_article((folder/'article.html').read_text(encoding='utf-8'));parent=inspect_parent((folder/'parent.html').read_text(encoding='utf-8'))
    texts=[(root/path).read_text(encoding='utf-8').replace('\r\n','\n') for path in INPUTS]
    library,context,links=[json.loads(text) for text in texts]
    providers=[]
    for pid,title,file in [(103,PARENT,'parent.html'),(105,CHILD,'child.html')]:
        r=next(row for row in library['records'] if row['providerSourceId']==pid)
        if (r['title']!=title or r['sourceUrl']!=SNAPSHOTS[file][0] or r['providerRuleset']['name']!='5e'
                or r['displayedPublisher']!='Wizards of the Coast' or r['providerIsThirdParty']):raise ValueError('Changed publication identity')
        providers.append({key:r[key] for key in ['observationId','providerSourceId','title','sourceUrl','providerIsFree']})
    old=next(r for r in links['records'] if r['dndsuSourceId']=='189')
    preferred=[r for r in old['candidates'] if r['preferredByEvidence']]
    if old['historicalTitle']!=PARENT or len(preferred)!=1 or preferred[0]['providerSourceId']!=103:raise ValueError('Changed existing historical parent link')
    if 105 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Not in preserved residual15')
    return {'schemaVersion':1,'status':'primary-adventure-anthology-relation-witness-not-canonical-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,'sources':sources,'publisherStatement':article,'parentToc':parent,
            'providerReferences':providers,'relationship':{'kind':'adventure-component-with-separate-distribution-entry',
                'childProviderSourceId':105,'parentProviderSourceId':103,'existingParentDndsuSourceId':'189',
                'childDndsuSourceId':None,'canonicalSourceId':None,'automaticSourceReplacement':False,'automaticRecordAttribution':False,
                'fullTextEquivalence':'unverified','reusePermission':'not-established'},
            'accessBoundary':{'anonymousChildRequestRedirectedToClaimPage':True,'childFullAdventureTextInspected':False,
                'claimSubmitted':False,'authenticatedAccessUsed':False,'providerIsFreeFlagPreserved':True,
                'freeClaimOfferIsPublicationPermission':False},
            'inputSha256':{path:sha(text.encode()) for path,text in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-prisoner13-component-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['An anthology component and a separate distribution source are not two proved distinct full rules versions.',
                'The adventure title and its same-name creature statblock are different kinds, not an accepted single unit or alias.',
                'Provider105 does not invent/replace dndsu source105; only existing parent189 is referenced.',
                'A public no-cost claim offer is neither completed access nor permission to publish/translate full text.',
                'The historical15-row residual remains unchanged; no canonical counts, profiles, runtime or owner acceptance are exported.']}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('capture_folder');parser.add_argument('--output');args=parser.parse_args();d=audit(args.capture_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'relation':d['relationship']['kind'],'child':105,'parent':103,'parentDndsuSource':'189','childFullTextInspected':False}))
