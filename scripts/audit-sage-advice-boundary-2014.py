"""Verify bibliographic first-page boundaries of one public Sage Advice snapshot."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import pypdf
from pypdf import PdfReader

URL='https://media.wizards.com/2020/dnd/downloads/SA-Compendium.pdf'
SHA='6f2d092682e627a92dff0412df1c88739669a1b55d4f5aef8daaa53ccc2b4736'
INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-current-publication-context-2014.json']


def inspect_first_page(text):
    normalized=' '.join(unicodedata.normalize('NFKC',text).split())
    headings=['Sage Advice Compendium','Rules References','Official Rulings','Compiled Answers']
    if any(heading not in normalized for heading in headings):raise ValueError('Missing first-page reference boundary')
    versions=set(re.findall(r'Version\s+([0-9]+\.[0-9]+)',normalized))
    years=set(re.findall(r'©\s*(\d{4})\s+Wizards',normalized))
    if len(versions)!=1 or len(years)!=1:raise ValueError('Ambiguous publication version/copyright year')
    if 'first published in 2014' not in normalized:raise ValueError('Missing explicit original-core reference')
    if 'personal use only' not in normalized:raise ValueError('Missing publication-specific use notice')
    return {'pdfVersion':next(iter(versions)),'copyrightYear':int(next(iter(years))),
            'firstCorePublicationReferenceYear':2014,'firstPageHeadings':headings,
            'publicationSpecificPersonalUseNoticePresent':True,
            'firstPageTextSha256':hashlib.sha256(normalized.encode()).hexdigest()}


def audit(folder,root=Path('.')):
    folder=Path(folder);capture=json.loads((folder/'capture.json').read_text(encoding='utf-8'));raw=(folder/'sage-advice.pdf').read_bytes()
    if (capture.get('url')!=URL or capture.get('finalUrl')!=URL or capture.get('status')!=200
            or capture.get('bytes')!=len(raw) or capture.get('sha256')!=SHA or hashlib.sha256(raw).hexdigest()!=SHA):
        raise ValueError('Pinned public PDF URL/status/bytes/SHA mismatch')
    reader=PdfReader(folder/'sage-advice.pdf');facts=inspect_first_page(reader.pages[0].extract_text())
    if len(reader.pages)!=23 or facts['pdfVersion']!='2.7' or facts['copyrightYear']!=2021:raise ValueError('Changed primary snapshot')
    texts=[(root/path).read_text(encoding='utf-8').replace('\r\n','\n') for path in INPUTS]
    library,context=[json.loads(text) for text in texts]
    provider=next(r for r in library['records'] if r['providerSourceId']==53)
    if (provider['sourceUrl']!='https://www.dndbeyond.com/sources/dnd/sac' or provider['providerRuleset']['name']!='5e'
            or provider['displayedPublisher']!='Wizards of the Coast' or provider['providerIsThirdParty']):raise ValueError('Changed library reference identity')
    if 53 not in {r['providerSourceId'] for r in context['remainingUnlinkedProviderReferences']}:raise ValueError('Reference no longer belongs to this residual')
    return {'schemaVersion':1,'status':'primary-reference-kind-witness-not-rules-or-inventory-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,
            'source':{**{k:capture[k] for k in ['url','finalUrl','status','bytes','sha256','retrievedAt']},'pages':23,'inspectedPdfPages':[1],'extractorVersion':pypdf.__version__},
            'facts':facts,'providerObservationId':provider['observationId'],'providerSourceId':53,'providerTitle':provider['title'],
            'sourceReferenceCandidate':{'kind':'primary-publication-reference','id':'wotc:sage-advice-compendium:v2.7:2021'},
            'numericDndsuSourceId':None,'canonicalSourceId':None,'automaticAttribution':False,
            'publicationKindProposal':'official-original-5e-rules-clarification-reference',
            'semanticReview':{'scope':'first-page bibliographic/authority boundaries only',
                              'dmAdjudicationRetained':True,'publicTeamStatementsAutomaticallyOfficial':False,
                              'exactDigitalPdfEquivalence':'unverified','fullAnswersReviewed':False,
                              'commonCatalogTextReusePermission':'not-established'},
            'inputSha256':{path:hashlib.sha256(text.encode()).hexdigest() for path,text in zip(INPUTS,texts)},
            'generator':{'path':'scripts/audit-sage-advice-boundary-2014.py','sha256':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest()},
            'limits':['First page establishes a reference publication kind, not a list of new spells/monsters/items.',
                      'URL directory2020 is not the2021 copyright year or a claim of a2020 text version.',
                      'Library presence and PDF snapshot do not prove identical current digital text.',
                      'The15-row residual and historical sources are preserved; no canonical count or inclusion is changed.',
                      'No full answers, PDF, translation, profile data, runtime changes or owner acceptance are exported.']}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('capture_folder');parser.add_argument('--output');args=parser.parse_args();report=audit(args.capture_folder)
    if args.output:Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'providerSourceId':report['providerSourceId'],'pages':report['source']['pages'],'version':report['facts']['pdfVersion'],'copyrightYear':report['facts']['copyrightYear'],'kind':report['publicationKindProposal']}))
