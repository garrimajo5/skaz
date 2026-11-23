"""Bound a Feywild supplement reference to a retained official Dungeoncraft PDF, not full rules."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import urlsplit
from pypdf import PdfReader
HELPER=Path(__file__).with_name('audit-prisoner13-component-2014.py')
SPEC=importlib.util.spec_from_file_location('domains_meta',HELPER);P=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(P)
URL='https://media.wizards.com/2021/dnd/downloads/Dungeoncraft_Wild_Beyond_the_Witchlight_v1.1.pdf'
DIGEST='9a2a19a39d28221092f1f63353c4e5e11e4c8497b203f14ba08964f31184a72c'
TITLE='Domains of Delight: A Feywild Accessory'
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-current-publication-context-2014.json']

def sha(raw):return hashlib.sha256(raw).hexdigest()

def inspect_page(text,uris):
    text=P.clean(text)
    if 'D&D ADVENTURERS LEAGUE DUNGEONCRAFT ADVENTURES: WILD BEYOND THE WITCHLIGHT' not in text or 'Version 1.1' not in text:
        raise ValueError('Wrong programme/version scope')
    start=text.find('You can create your own');stop=text.find('GENERAL GUIDELINES',start)
    if start<0 or stop<0:raise ValueError('Missing bounded publication reference paragraph')
    intro=text[start:stop]
    if not all(s in intro for s in ['using The Wild Beyond the Witchlight and Domains of Delight','Domains of Delight can be found for sale in the DMs Guild']):
        raise ValueError('Missing separate supplement distribution evidence')
    if 'There is a section in the Domains of Delight supplement' not in text:raise ValueError('Missing explicit supplement kind')
    targets={urlsplit(u)._replace(query='',fragment='').geturl() for u in uris if u and '371449' in u}
    if targets!={'https://www.dmsguild.com/product/371449/Domains-of-Delight-5e'}:raise ValueError('Wrong explicit supplement product link')
    start=text.find('Using Creatures.');stop=text.find('Adventure Setting.',start)
    if start<0 or stop<0:raise ValueError('Missing scoped creature guidance')
    creatures=text[start:stop]
    if 'You cannot use the archfey presented in Domains of Delight.' not in creatures:raise ValueError('Lost campaign-specific restriction')
    return {'pdfPage':1,'pdfVersion':'1.1','publicationReferenceParagraphSha256':sha(intro.encode()),
            'supplementKindExplicit':True,'separateDmsGuildProductUrl':next(iter(targets)),
            'productNumberIsDndsuSourceId':False,'sameAsWholeWitchlightOrContainedChapter':'not-established',
            'campaignArchfeyRestriction':{'paragraphSha256':sha(creatures.encode()),'scope':'historical Dungeoncraft programme only; not current global AL legality or common profile prohibition',
                'blocksOrdinaryProfileActions':False,'provesBookUnofficialOrEmpty':False},
            'scope':'one official PDF page and its product annotations; supplement full rules not read'}

def validate_provider(r):
    if r['providerSourceId']!=116 or r['observationId']!='ddb:library-source:116' or r['title']!=TITLE or r['sourceUrl']!='https://www.dndbeyond.com/sources/dnd/dod' or r['sku']!='SRC-00116-ELIFE' or r['providerRuleset']['name']!='5e' or r['displayedPublisher']!='Wizards of the Coast' or r['providerIsThirdParty']:
        raise ValueError('Changed provider identity, edition or publisher')

def audit(folder,followup,root=Path('.')):
    folder=Path(folder);followup=Path(followup);caps=json.loads((folder/'capture.json').read_text(encoding='utf-8'));nextcaps=json.loads((followup/'capture.json').read_text(encoding='utf-8'))
    raw=(folder/'dungeoncraft.pdf').read_bytes();source=P.verify_capture(raw,caps['dungeoncraft.pdf'],URL,URL,DIGEST)
    if caps['dungeoncraft.pdf'].get('outcome')!='complete':raise ValueError('Incomplete PDF cannot be used')
    pdf=PdfReader(folder/'dungeoncraft.pdf')
    if len(pdf.pages)!=9:raise ValueError('Changed PDF page count')
    uris=[(a.get_object().get('/A') or {}).get('/URI') for a in pdf.pages[0].get('/Annots',[])]
    observation=inspect_page(pdf.pages[0].extract_text(),uris)
    texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};lib,context=[json.loads(t) for t in texts.values()]
    provider=next(r for r in lib['records'] if r['providerSourceId']==116);validate_provider(provider)
    if 116 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Changed original residual')
    attempts=[]
    for cap in [caps['source.html'],caps['shop.html'],nextcaps['domains-shop.html']]:
        if cap['outcome']!='capture-error' or cap['sha256'] is not None or cap['bodyFile'] is not None or cap['retried']:raise ValueError('Changed limited attempt; refresh evidence')
        attempts.append(cap)
    return {'schemaVersion':1,'status':'official-pdf-supplement-reference-with-limited-marketplace-captures-not-full-rules',
            'accepted':False,'complete':False,'approvedDenominator':None,'providerSourceId':116,'providerObservationId':provider['observationId'],
            'numericDndsuSourceId':None,'canonicalSourceId':None,'automaticAttribution':False,
            'providerReference':{k:provider[k] for k in ['title','sourceUrl','sku','displayedPublisher','providerRuleset','providerReleaseDate','providerType']},
            'sources':{'dungeoncraft.pdf':source},'pdfReference':observation,'pdfPageCount':9,'inspectedPdfPages':[1],
            'accessAndCaptureLimits':{'limitedAttempts':attempts,'fullSupplementRead':False,'marketplaceBodyRetained':False,
                'claimsAboutPermanentDenialOrPriorOwners':False,'captureFailuresDoNotInvalidateSuccessfulPdfReceipt':True,
                'captureHelperAutomaticRetries':False,'scope':'failed URL validation and body reads retained as failures; successful PDF retained independently'},
            'inputSha256':{p:sha(t.encode()) for p,t in texts.items()},
            'generator':{'path':'scripts/audit-domains-delight-reference-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},
            'upstreamParser':{'path':'scripts/'+HELPER.name,'sha256':sha(HELPER.read_bytes().replace(b'\r\n',b'\n'))},
            'limits':['Supplement reference and WotC library label do not establish complete current text or record counts.',
                'Historical programme restrictions are not a game-profile action ban or proof of zero common-catalogue records.',
                '371449 is a distribution product number,116 is a provider ID; neither invents a historical/canonical ID.',
                'Full rules/version comparison, independent canonical decisions and publication/translation rights remain open.',
                'No account, private profile, application runtime, owner milestone or accepted catalogue denominator changed.']}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');p.add_argument('followup');p.add_argument('--output');a=p.parse_args();d=audit(a.folder,a.followup)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps({'providerSourceId':116,'kind':'Feywild supplement reference','fullRulesRead':False}))
