"""Pin Rrakkma's own adventure code and introductory-companion/edition boundaries."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
HELPER=Path(__file__).with_name('audit-prisoner13-component-2014.py')
SPEC=importlib.util.spec_from_file_location('scoped_component',HELPER);P=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(P)
SNAPSHOTS={
 'source.html':('https://www.dndbeyond.com/sources/dnd/ddia-mord','ef09e82c26c09cfbeeb13a8492d7bed32cb62ddf0d177a452bbcaa2652cbb232'),
 'article.html':('https://www.dndbeyond.com/posts/222-rrakkma-is-an-adventure-league-gith-adventure-that','d4a292069dd40bcb9e729b85053dec36eaa68be4b6489546cab389edc4c67624'),
}
ARTICLE="'Rrakkma' is an Adventure League Gith Adventure that Introduces 'Mordenkainen's Tome of Foes'"
BOOK="Mordenkainen's Tome of Foes"
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-current-publication-context-2014.json','catalog/library-source-link-proposals-2014.json']
def sha(raw):return hashlib.sha256(raw).hexdigest()
def label(text):return P.clean(text).replace('\u2019',"'").replace('\u2018',"'")

class IntroParser(P.ScopedMetadataParser):
    def __init__(self):super().__init__('blockquote','compendium-toc-blockquote');self.intro=[]
    def handle_data(self,data):
        super().handle_data(data)
        if self.depth:self.intro.append(data)

def inspect_source(html):
    p=IntroParser();p.feed(html);p.close()
    if p.containers!=1 or p.depth or {label(x) for x in p.titles}!={'Rrakkma'}:raise ValueError('Ambiguous own source/intro identity')
    text=label(' '.join(p.intro));codes=re.findall(r'Adventure Code:\s*([A-Z0-9-]+)',text)
    if codes!=['DDIA-MORD'] or 'AN INTRODUCTORY ADVENTURE FOR '+BOOK.upper() not in text.upper():raise ValueError('Missing exact adventure code or introductory-for-book relation')
    return {'title':'Rrakkma','adventureCode':'DDIA-MORD','introductoryForBook':BOOK,'introTextSha256':sha(text.encode()),
            'scope':'own bounded introduction only; no chapter/statblock text reviewed'}

def inspect_article(html):
    p=P.ScopedMetadataParser('section','p-article-content');p.feed(html);p.close()
    if p.containers!=1 or p.depth or {label(t) for t in p.titles}!={ARTICLE}:raise ValueError('Ambiguous editorial title/body')
    rows=[r for r in p.paragraphs if all(a in r['text'] for a in ['back in third edition','updated it to fifth edition','entire rewrite'])]
    if len(rows)!=1:raise ValueError('Missing same-paragraph original3e to rewritten5e statement')
    return {'title':ARTICLE,'editionStatementParagraphSha256':sha(rows[0]['text'].encode()),
            'olderThirdEditionOriginMentioned':True,'FifthEditionRewriteExplicit':True,
            'scope':'one primary editorial edition statement; not a textual comparison with old3e'}

def audit(folder,root=Path('.')):
    folder=Path(folder);caps=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for file,(url,expected) in SNAPSHOTS.items():sources[file]=P.verify_capture((folder/file).read_bytes(),caps[file],url,url,expected)
    own=inspect_source((folder/'source.html').read_text(encoding='utf-8'));article=inspect_article((folder/'article.html').read_text(encoding='utf-8'))
    texts=[(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS];lib,context,links=[json.loads(t) for t in texts]
    provider=next(r for r in lib['records'] if r['providerSourceId']==34)
    if (provider['title']!='Rrakkma' or provider['sourceUrl']!=SNAPSHOTS['source.html'][0] or provider['providerRuleset']['name']!='5e'
            or provider['displayedPublisher']!='Wizards of the Coast' or provider['providerIsThirdParty']):raise ValueError('Changed own library identity')
    book=next(r for r in lib['records'] if r['providerSourceId']==33)
    if label(book['title'])!=BOOK:raise ValueError('Wrong introduced book identity')
    historical=next(r for r in links['records'] if r['dndsuSourceId']=='113')
    if label(historical['historicalTitle'])!=BOOK or not any(c['providerSourceId']==33 and c['preferredByEvidence'] for c in historical['candidates']):raise ValueError('Changed existing introduced-book link')
    if 34 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Outside historical residual')
    return {'schemaVersion':1,'status':'primary-coded-introductory-adventure-witness-not-canonical-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,'providerSourceId':34,'providerObservationId':provider['observationId'],
            'numericDndsuSourceId':None,'canonicalSourceId':None,'automaticAttribution':False,'sources':sources,'ownPublication':own,'editionEvidence':article,
            'relationship':{'kind':'introductory-companion-adventure-for-book','introducedBookProviderSourceId':33,
                'introducedBookExistingDndsuSourceId':'113','introducedBookSourceUrl':book['sourceUrl'],
                'containedInBook':'not-established','isAliasOfIntroducedBook':False,'genericALSource169InferredFromAdventureCode':False,
                'fullRecordOrTextEquivalence':'unverified','reusePermission':'not-established'},
            'inputSha256':{p:sha(t.encode()) for p,t in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-rrakkma-publication-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParser':{'path':'scripts/audit-prisoner13-component-2014.py','sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['Introductory for a book is not proof of being printed in the book or sharing all statblocks.',
                      'The distinct adventure code does not assign generic ALsource169 observations to this publication.',
                      'The older3e origin is not a licence to reuse an older text as the stated5e rewrite.',
                      'Library5e and primary rewrite statement are bounded edition evidence, not full rules/version/rights acceptance.',
                      'No full adventure/prose/HTML/private profile, source-policy change or catalogue denominator is exported.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('capture_folder');p.add_argument('--output');args=p.parse_args();d=audit(args.capture_folder)
    if args.output:Path(args.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'provider':34,'code':d['ownPublication']['adventureCode'],'kind':d['relationship']['kind'],'containedInBook':'not-established'}))
