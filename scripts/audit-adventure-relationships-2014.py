"""Verify three distinct adventure relationships without importing related books or granting levels."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlsplit
BASE=Path(__file__).parent

def module(name,file):
    s=importlib.util.spec_from_file_location(name,BASE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
P=module('aux_meta','audit-prisoner13-component-2014.py');C=module('aux_claim','audit-radiant-citadel-chapter-2014.py')
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-source-link-proposals-2014.json','catalog/library-current-publication-context-2014.json']
TITLES={126:'Lightning Keep',129:"Heroes' Feast: Saving the Children's Menu",135:'Vecna: Nest of the Eldritch Eye'}
ARTICLES={126:'From Minecraft x Dungeons & Dragons to Tabletop: Introducing D&D to Kids',129:"Deborah Ann Woll Talks Heroes Feast: Saving the Children's Menu",135:'Play the Prequel Adventure to Vecna: Eve of Ruin Today'}
PINS={
 'lightning-source':('source.html','https://www.dndbeyond.com/sources/dnd/lke','https://www.dndbeyond.com/claim/source/lightning-keep','1f57ef65ac2bdaffa13ab20f596c0238e80f09b89238430d47706f96c0886576'),
 'lightning-article':('article.html','https://www.dndbeyond.com/posts/1579-from-minecraft-x-dungeons-dragons-to-tabletop','https://www.dndbeyond.com/posts/1579-from-minecraft-x-dungeons-dragons-to-tabletop','92b21dfe6c27a28e481ca99e0a6a812a5f9fe6eda93e2858f19e1fac4db98288'),
 'feast-article':('feast-article.html','https://www.dndbeyond.com/posts/1639-deborah-ann-woll-talks-heroes-feast-saving-the','https://www.dndbeyond.com/posts/1639-deborah-ann-woll-talks-heroes-feast-saving-the','afa05f203ba5769b7442bd95e3c716c0480498050fafc7b4a58c8e80c8883310'),
 'vecna-article':('vecna-article.html','https://www.dndbeyond.com/posts/1680-play-the-prequel-adventure-to-vecna-eve-of-ruin','https://www.dndbeyond.com/posts/1680-play-the-prequel-adventure-to-vecna-eve-of-ruin','94c747249896134daaf2e20c6e1f853613a11067dcec3a9f2873116b7820ca4f')}
OUTPUTS={126:'lightning-keep-relationship-2014.json',129:'heroes-feast-relationship-2014.json',135:'vecna-prequel-relationship-2014.json'}

def sha(raw):return hashlib.sha256(raw).hexdigest()
def clean(t):return P.clean(t).replace('\u2019',"'").replace('\u2018',"'")
def article(html,pid):
    p=P.ScopedMetadataParser('section','p-article-content');p.feed(html);p.close()
    if p.containers!=1 or p.depth or {clean(t) for t in p.titles}!={ARTICLES[pid]}:raise ValueError('Wrong or ambiguous publisher article scope')
    return p

def unique(paragraphs,predicate):
    rows=[r for r in paragraphs if predicate(clean(r['text']))]
    if len(rows)!=1:raise ValueError('Missing unique relationship paragraph')
    return rows[0]

def inspect_lightning(html,claim_html):
    p=article(html,126)
    intro=unique(p.paragraphs,lambda t:'introduce Lightning Keep' in t and 'inspired by Minecraft' in t and '3rd-level characters' in t)
    reuse=unique(p.paragraphs,lambda t:"D&D's previous Minecraft supplement" in t and 'Monstrous Compendium Volume 3: Minecraft Creatures' in t)
    c=C.ClaimParser();c.feed(claim_html);c.close()
    if c.containers!=1 or c.depth or {clean(t) for t in c.titles}!={'Claim Lightning Keep now!','Get Lightning Keep at no cost!'} or c.expiryCaptions!=['This promotion is no longer available.']:raise ValueError('Missing Lightning claim identity/ended notice')
    offer=unique(c.paragraphs,lambda t:'four to six characters of level 3' in t and 'three or four hours' in t and 'a world of your choosing' in t and 'Monstrous Compendium Volume 3: Minecraft Creatures' in t)
    links=[a for a in offer['links'] if a['text']=='Monstrous Compendium Volume 3: Minecraft Creatures']
    if len(links)!=1 or links[0]['href']!='https://www.dndbeyond.com/sources/mcv3':raise ValueError('Wrong explicit referenced supplement target')
    return {'kind':'adventure-featuring-monsters-from-distinct-supplement','introductionParagraphSha256':sha(intro['text'].encode()),'reuseParagraphSha256':sha(reuse['text'].encode()),
            'offerParagraphSha256':sha(offer['text'].encode()),'advertisedLevel':3,'partySize':[4,6],'advertisedHours':[3,4],
            'worldChoiceForcedToMinecraft':False,'allSupplementCreaturesOrExactStatblocksIncluded':'not-established',
            'relatedProviderSourceId':115,'relatedExistingDndsuSourceId':'199','isAliasOfRelatedBook':False,
            'claimSubmitted':False,'promotionEndedNotice':True,'previousClaimantAccessTested':False,
            'scope':'two article paragraphs and one scoped claim description/link; no full adventure or creature rules'}

def inspect_feast(html):
    p=article(html,129)
    relation=unique(p.paragraphs,lambda t:t.startswith(TITLES[129]+' is based on a recipe included in ') and "Heroes' Feast Flavors of the Multiverse" in t and 'cookbook' in t)
    level=unique(p.paragraphs,lambda t:'D&D adventure for 10th-level adventurers' in t)
    publisher=unique(p.paragraphs,lambda t:'Wizards first wrote me' in t and 'publishing Saving the Children' in t)
    links=[a for a in relation['links'] if clean(a['text'])==TITLES[129]]
    if len(links)!=1 or urlsplit(links[0]['href']).path!='/marketplace/adventures/heroes-feast-saving-the-childrens-menu' or urlsplit(links[0]['href']).netloc!='www.dndbeyond.com':raise ValueError('Wrong separate adventure product target')
    return {'kind':'standalone-adventure-inspired-by-cookbook-recipe','relationParagraphSha256':sha(relation['text'].encode()),'levelParagraphSha256':sha(level['text'].encode()),'publisherContextSha256':sha(publisher['text'].encode()),
            'advertisedLevel':10,'cookbookTitle':"Heroes' Feast Flavors of the Multiverse",'authorIsPublisher':False,
            'cookbookImportedAsRulesSource':False,'containedInCookbookOrIdenticalRules':'not-established',
            'scope':'recipe relation, intended level and quoted publishing context in publisher article only'}

def inspect_vecna(html):
    p=article(html,135)
    intro=unique(p.paragraphs,lambda t:'Vecna: Nest of the Eldritch Eye, a one-shot adventure for 3rd-level characters' in t and 'It serves as a prequel to Vecna: Eve of Ruin' in t)
    transition=unique(p.paragraphs,lambda t:'prequel to Vecna: Eve of Ruin' in t and '10th to 20th level' in t and 'up to you as the Dungeon Master' in t)
    links=[a for a in intro['links'] if a['text']==TITLES[135]]
    if len(links)!=1 or urlsplit(links[0]['href']).netloc!='marketplace.dndbeyond.com' or urlsplit(links[0]['href']).path!='/category/SRC-00135':raise ValueError('Wrong separate prequel product target')
    return {'kind':'separate-low-level-prequel-to-high-level-adventure','introductionParagraphSha256':sha(intro['text'].encode()),'transitionParagraphSha256':sha(transition['text'].encode()),
            'advertisedPrequelLevel':3,'relatedCampaignLevelRange':[10,20],'transitionDeterminedByDm':True,'automaticLevel3To10Granted':False,
            'relatedProviderSourceId':132,'relatedSku':'SRC-00134','relatedExistingDndsuSourceId':'214',
            'containedInRelatedBookOrIdenticalRules':'not-established','calendarYear2024AutomaticallyMeansRevisedRules':False,
            'scope':'two publisher article paragraphs and separate product reference; no full prequel or campaign rules'}

def validate_related_provider(r,pid):
    title,slug,sku={115:('Monstrous Compendium Vol. 3: Minecraft Creatures','mcv3',''),132:('Vecna: Eve of Ruin','veor','SRC-00134')}[pid]
    if r['providerSourceId']!=pid or r['title']!=title or r['sourceUrl']!='https://www.dndbeyond.com/sources/dnd/'+slug or r['sku']!=sku or r['providerRuleset']['name']!='5e' or r['providerIsThirdParty'] or r['displayedPublisher']!='Wizards of the Coast':
        raise ValueError('Changed related provider identity/sku/edition')

def audit(lightning_folder,aux_folder,root=Path('.')):
    lightning_folder=Path(lightning_folder);aux_folder=Path(aux_folder);folders={'lightning':lightning_folder,'feast':aux_folder,'vecna':aux_folder};sources={}
    for key,(file,url,final,digest) in PINS.items():
        folder=folders[key.split('-')[0]];caps=json.loads((folder/'capture.json').read_text(encoding='utf-8'))
        sources[key]=P.verify_capture((folder/file).read_bytes(),caps[file],url,final,digest)
    relationships={126:inspect_lightning((lightning_folder/'article.html').read_text(encoding='utf-8'),(lightning_folder/'source.html').read_text(encoding='utf-8')),
                   129:inspect_feast((aux_folder/'feast-article.html').read_text(encoding='utf-8')),135:inspect_vecna((aux_folder/'vecna-article.html').read_text(encoding='utf-8'))}
    texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};lib,links,context=[json.loads(t) for t in texts.values()];result={}
    for related_pid,historical,title in [(115,'199','Monstrous Compendium Vol 3: Minecraft Creatures'),(132,'214','Vecna: Eve of Ruin')]:
        validate_related_provider(next(r for r in lib['records'] if r['providerSourceId']==related_pid),related_pid)
        r=next(r for r in links['records'] if r['dndsuSourceId']==historical)
        if r['historicalTitle']!=title or not any(c['preferredByEvidence'] and c['providerSourceId']==related_pid for c in r['candidates']):raise ValueError('Changed existing related publication link')
    for pid,relation in relationships.items():
        r=next(r for r in lib['records'] if r['providerSourceId']==pid)
        if clean(r['title'])!=TITLES[pid] or r['providerRuleset']['name']!='5e' or r['providerIsThirdParty'] or r['displayedPublisher']!='Wizards of the Coast' or r['sourceUrl']!='https://www.dndbeyond.com/sources/dnd/'+{126:'lke',129:'hfscm',135:'vnee'}[pid]:raise ValueError('Changed own source identity/edition/publisher')
        if pid not in {x['providerSourceId'] for x in context['remainingUnlinkedProviderReferences']}:raise ValueError('Changed original residual')
        prefix={126:'lightning',129:'feast',135:'vecna'}[pid];limits=[]
        if pid!=126:
            cap=json.loads((aux_folder/'capture.json').read_text(encoding='utf-8'))[prefix+'-source.html']
            if cap['outcome']!='capture-error' or cap['bodyFile'] is not None or cap['sha256'] is not None or cap['retried']:raise ValueError('Changed limited source attempt')
            limits.append(cap)
        result[pid]={'schemaVersion':1,'status':'bounded-adventure-relationship-not-full-record-or-canonical-acceptance','accepted':False,'complete':False,'approvedDenominator':None,
            'providerSourceId':pid,'numericDndsuSourceId':None,'canonicalSourceId':None,'automaticAttribution':False,'fullRulesReviewed':False,
            'providerReference':{k:r[k] for k in ['observationId','title','sourceUrl','sku','providerReleaseDate','providerRuleset','displayedPublisher']},
            'sources':{k:v for k,v in sources.items() if k.startswith(prefix+'-')},'relationship':relation,'limitedSourceAttempts':limits,
            'inputSha256':{p:sha(t.encode()) for p,t in texts.items()},
            'generator':{'path':'scripts/audit-adventure-relationships-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParsers':[{'path':'scripts/'+name,'sha256':sha((BASE/name).read_bytes().replace(b'\r\n',b'\n'))} for name in ['audit-prisoner13-component-2014.py','audit-radiant-citadel-chapter-2014.py']],
            'limits':['A narrative relationship does not establish containment, identical rules or full category record counts.',
                'Provider IDs, product SKUs and existing historical IDs stay distinct; no child ID or permission inferred.',
                'Publisher/author/brand and calendar year do not automatically change common catalogue policy or rules edition.',
                'Full rules, exact versions, individual record provenance and publication/translation rights remain open.',
                'No purchase/claim/account, real profile, runtime, automatic levels, owner milestone or accepted denominator changed.']}
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('lightning_folder');p.add_argument('aux_folder');p.add_argument('--output-dir',type=Path);a=p.parse_args();reports=audit(a.lightning_folder,a.aux_folder)
    if a.output_dir:
        for pid,d in reports.items():(a.output_dir/OUTPUTS[pid]).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'providerSourceIds':list(reports),'canonicalUnitsAccepted':0,'fullRulesReviewed':False}))
