"""Bound a separately distributed gazetteer to its parent TOC and historical AL feature context."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urljoin
from pypdf import PdfReader
BASE=Path(__file__).parent

def module(name,file):
    s=importlib.util.spec_from_file_location(name,BASE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
P=module('gazetteer_meta','audit-prisoner13-component-2014.py');C=module('gazetteer_claim','audit-radiant-citadel-chapter-2014.py')
CHILD="Baldur's Gate Gazetteer";BOOK="Baldur's Gate: Descent into Avernus"
CHAPTER='https://www.dndbeyond.com/sources/bgdia/baldurs-gate-gazetteer'
SNAPSHOTS={
 'gazetteer.html':('https://www.dndbeyond.com/sources/dnd/bgg','https://www.dndbeyond.com/claim/source/baldurs-gate-gazetteer','7e67097c17b4c6d41ece76261769122f13dadafd1d384c68baeec1adeef3649c'),
 'avernus.html':('https://www.dndbeyond.com/sources/dnd/bgdia','https://www.dndbeyond.com/sources/dnd/bgdia','d4453ce0732c6ae1d650e0b3c59b72569ade1e23e2c65a0f6c8144e69b5e50b2')}
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-source-link-proposals-2014.json','catalog/library-current-publication-context-2014.json','catalog/wayfinder-version-boundary-2014.json']

def sha(raw):return hashlib.sha256(raw).hexdigest()
def clean(t):return P.clean(t).replace('\u2019',"'")

def inspect_parent(html):
    p=P.ScopedMetadataParser('div','compendium-toc-full-text').finish(html,BOOK)
    headings=[h for h in p.headings if clean(h['text'])==CHILD]
    if len(headings)!=1 or len(headings[0]['links'])!=1:raise ValueError('Missing unique gazetteer heading')
    target=urljoin(SNAPSHOTS['avernus.html'][0],headings[0]['links'][0]['href'] or '')
    if target!=CHAPTER:raise ValueError('Wrong gazetteer chapter target')
    backgrounds=[a for a in p.links if clean(a['text'])=="Baldur's Gate Character Backgrounds"]
    if len(backgrounds)!=1 or urljoin(CHAPTER,backgrounds[0]['href'] or '')!=CHAPTER+'#BaldursGateCharacterBackgrounds':raise ValueError('Missing own chapter background-section reference')
    return {'title':BOOK,'gazetteerChapterUrl':target,'backgroundSectionReference':CHAPTER+'#BaldursGateCharacterBackgrounds',
            'scope':'parent chapter TOC and one background-section reference; no full chapter or background rules'}

def inspect_claim(html):
    p=C.ClaimParser();p.feed(html);p.close()
    if p.containers!=1 or p.depth or {clean(t) for t in p.titles}!={CHILD,'Claim '+CHILD+' now!'} or p.expiryCaptions!=['This promotion is no longer available.']:raise ValueError('Missing unique gazetteer identity/ended offer')
    description=[r['text'] for r in p.paragraphs if 'districts' in r['text'] and 'people' in r['text'] and 'unlock backgrounds' in r['text']]
    distribution=[r['text'] for r in p.paragraphs if clean(r['text']).startswith('This claim unlocks the '+CHILD) and 'compendium and character builder' in r['text']]
    if len(description)!=1 or len(distribution)!=1:raise ValueError('Missing scoped gazetteer description/distribution')
    return {'descriptionSha256':sha(description[0].encode()),'distributionParagraphSha256':sha(distribution[0].encode()),
            'currentPromotionEndedNotice':True,'backgroundOptionsMentioned':True,'advertisedParentMonsterOrItemCountsAttributedToChild':False,
            'claimSubmitted':False,'fullGazetteerTextInspected':False,'previousOwnerAccessTested':False,
            'scope':'claim-main only; adjacent full-book advertisement and its numbers excluded'}

def inspect_al(text):
    text=clean(text);start=text.find("BALDUR'S GATE GAZETTEER");stop=text.find('Not for resale.',start)
    if start<0 or stop<0:raise ValueError('Missing bounded AL subsection')
    unit=text[start:stop]
    if 'Background features presented in this section are available to Season 9 characters.' not in unit:raise ValueError('Missing exact historical feature/season context')
    return {'pdfPage':25,'guideVersion':'2.4','subsectionSha256':sha(unit.encode()),'historicalSeason':9,'scope':'background features for Season9 characters only',
            'ordinaryProfileBackgroundSelectionBlocked':False,'allCharactersAutomaticallyGrantedFeatures':False,'currentGlobalAlEligibilityEstablished':False}

def audit(folder,guide_folder,root=Path('.')):
    folder=Path(folder);caps=json.loads((folder/'capture.json').read_text(encoding='utf-8'));sources={}
    for name,(url,final,digest) in SNAPSHOTS.items():sources[name]=P.verify_capture((folder/name).read_bytes(),caps[name],url,final,digest)
    parent=inspect_parent((folder/'avernus.html').read_text(encoding='utf-8'));claim=inspect_claim((folder/'gazetteer.html').read_text(encoding='utf-8'))
    texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};lib,links,context,wayfinder=[json.loads(t) for t in texts.values()]
    providers=[]
    for pid,name,file in [(48,BOOK,'avernus.html'),(122,CHILD,'gazetteer.html')]:
        r=next(r for r in lib['records'] if r['providerSourceId']==pid)
        if clean(r['title'])!=name or r['sourceUrl']!=SNAPSHOTS[file][0] or r['providerRuleset']['name']!='5e' or r['displayedPublisher']!='Wizards of the Coast' or r['providerIsThirdParty']:raise ValueError('Changed provider identity')
        providers.append({k:r[k] for k in ['providerSourceId','observationId','title','sourceUrl','providerType','providerIsFree']})
    parent_link=next(r for r in links['records'] if r['dndsuSourceId']=='126')
    if clean(parent_link['historicalTitle']).casefold()!=BOOK.casefold() or not any(c['providerSourceId']==48 and c['preferredByEvidence'] for c in parent_link['candidates']):raise ValueError('Changed existing historical parent link')
    if 122 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Changed original residual')
    pdf=Path(guide_folder)/'al-guide.pdf';pin=wayfinder['sources']['al-guide.pdf']
    if sha(pdf.read_bytes())!=pin['sha256'] or pdf.stat().st_size!=pin['bytes']:raise ValueError('Changed reused AL guide')
    reader=PdfReader(pdf)
    if len(reader.pages)!=67:raise ValueError('Changed reused guide page count')
    return {'schemaVersion':1,'status':'setting-gazetteer-component-and-background-offer-not-full-rules-or-automatic-grant',
            'accepted':False,'complete':False,'approvedDenominator':None,'sources':sources,'providerReferences':providers,'parentToc':parent,'claimBoundary':claim,
            'reusedGuide':{**pin,'inspectedPdfPages':[25]},'historicalCampaignContext':inspect_al(reader.pages[24].extract_text()),
            'relationship':{'kind':'setting-gazetteer-component-with-separate-background-distribution','childProviderSourceId':122,'parentProviderSourceId':48,
                'existingParentDndsuSourceId':'126','childDndsuSourceId':None,'canonicalSourceId':None,'automaticRecordAttribution':False,'automaticSourceReplacement':False,
                'wholeParentBookOrAllParentMonstersIncluded':False,'fullTextEquivalence':'unverified','reusePermission':'not-established'},
            'inputSha256':{p:sha(t.encode()) for p,t in texts.items()},
            'generator':{'path':'scripts/audit-gazetteer-component-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParsers':[{'path':'scripts/'+name,'sha256':sha((BASE/name).read_bytes().replace(b'\r\n',b'\n'))} for name in ['audit-prisoner13-component-2014.py','audit-radiant-citadel-chapter-2014.py']],
            'limits':['Provider122, parent provider48 and historical parent126 are distinct namespaces; no child numeric ID invented.',
                'Full-book advertisement numbers outside claim-main are not gazetteer record counts.',
                'Ended promotion does not establish prior owner access or publication/translation permission.',
                'Historical AL Season9 feature guidance is not a general game-action prohibition or automatic feature grant.',
                'Full backgrounds, text versions, rights and canonical units remain open; no runtime/profile/owner milestone changed.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');p.add_argument('guide_folder');p.add_argument('--output');a=p.parse_args();d=audit(a.folder,a.guide_folder)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'child':122,'parent':48,'historicalParent':'126','fullRulesRead':False}))
