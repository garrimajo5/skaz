"""Compare historical source IDs with public library observations, without acceptance."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit

INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/dndsu-source-register.json',
        'catalog/numeric-source-publisher-evidence.json','catalog/numeric-source-scope-policy-2014.json']


def title_key(value):
    return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',value).translate(str.maketrans({'’':"'",'‘':"'",'–':'-','—':'-'}))).strip().casefold()


def volume_key(value):
    value=title_key(value)
    match=re.match(r"^(monstrous compendium|mordenkainen's fiendish folio) vol(?:ume)?\.?\s+(one|two|three|four|[1-4])(?=[: ]|$)",value)
    if not match:return value
    number={'one':'1','two':'2','three':'3','four':'4'}.get(match[2],match[2])
    return match[1]+' volume '+number+value[match.end():]


def public_url_key(value):
    if not isinstance(value,str):return None
    parsed=urlsplit(value)
    if parsed.scheme!='https' or parsed.hostname not in ['www.dndbeyond.com','dndbeyond.com'] or parsed.username or parsed.password or parsed.query or parsed.fragment:return None
    return 'https://www.dndbeyond.com'+parsed.path.rstrip('/')


def review(library,register,bibliography,policy):
    rows=library['records']; by_provider={r['providerSourceId']:r for r in rows}
    if len(by_provider)!=len(rows):raise ValueError('Duplicate provider source ID')
    sources=register['sources']; source_ids=[r['sourceId'] for r in sources]
    if len(set(source_ids))!=len(source_ids):raise ValueError('Duplicate historical source ID')
    def unique(items,label):
        found={r['sourceId']:r for r in items}
        if len(found)!=len(items):raise ValueError('Duplicate '+label)
        return found
    bib=unique(bibliography['records'],'bibliography source'); policies=unique(policy['records'],'policy source')
    if set(source_ids)!=set(policies):raise ValueError('Policy does not preserve all historical sources')
    output=[];preferred_ids=set()
    for source in sources:
        ident=source['sourceId']; evidence=bib.get(ident); urls=[]
        if evidence:
            urls=[evidence[k] for k in ['evidenceUrl','editionEvidenceUrl'] if isinstance(evidence.get(k),str)]
        reasons={}
        for row in rows:
            row_reasons=[]; book_url=public_url_key(row['sourceUrl'])
            if book_url is None:raise ValueError('Invalid public library source URL')
            for url in urls:
                key=public_url_key(url)
                if key and key==book_url:row_reasons.append({'kind':'same-compendium-url','evidenceUrl':url})
                elif key and key.startswith(book_url+'/'):row_reasons.append({'kind':'chapter-under-compendium-url','evidenceUrl':url})
                sku=row.get('sku')
                # Empty SKU must never match every URL; keep marketplace and compendium namespaces distinct.
                parsed=urlsplit(url)
                if sku and parsed.scheme=='https' and parsed.hostname=='marketplace.dndbeyond.com' and sku in parsed.path.split('/'):
                    row_reasons.append({'kind':'same-explicit-marketplace-sku','evidenceUrl':url})
            if title_key(source['title'])==title_key(row['title']):row_reasons.append({'kind':'normalized-title-only'})
            elif row['providerRuleset']['name']=='5e' and title_key(re.sub(r'\s*\(2014\)$','',row['title']))==title_key(source['title']):
                row_reasons.append({'kind':'explicit-2014-suffix-title-candidate'})
            elif volume_key(source['title'])==volume_key(row['title']) and (volume_key(source['title'])!=title_key(source['title']) or volume_key(row['title'])!=title_key(row['title'])):
                row_reasons.append({'kind':'volume-label-alias-candidate'})
            if row_reasons:reasons[row['providerSourceId']]=row_reasons
        strong={pid for pid,why in reasons.items() if any(r['kind'] in ['same-compendium-url','chapter-under-compendium-url','same-explicit-marketplace-sku'] for r in why)}
        target={pid for pid in reasons if by_provider[pid]['providerRuleset']['name']=='5e'}
        # Existing independently reviewed era is evidence for disambiguation, never guessed from a release year.
        if strong:preferred=strong;status='explicit-evidence-candidates'
        elif evidence and evidence.get('ruleset')=='5e-2014' and target:preferred=target;status='title-candidates-in-evidenced-ruleset'
        elif reasons:preferred=set(reasons);status='title-candidates-need-version-review'
        else:preferred=set();status='no-library-candidate'
        if evidence and evidence.get('ruleset')=='5e-2014' and any(by_provider[p]['providerRuleset']['name']!='5e' for p in preferred):
            status='evidence-ruleset-conflict'
        preferred_ids.update(preferred)
        candidates=[]
        for pid in sorted(reasons):
            row=by_provider[pid]
            candidates.append({'providerObservationId':row['observationId'],'providerSourceId':pid,
                               'title':row['title'],'sourceUrl':row['sourceUrl'],'providerRuleset':row['providerRuleset']['name'],
                               'displayedPublisher':row['displayedPublisher'],'providerIsThirdParty':row['providerIsThirdParty'],
                               'reasons':reasons[pid], 'preferredByEvidence':pid in preferred})
        output.append({'dndsuSourceId':ident,'historicalTitle':source['title'],'historicalGroup':source.get('group'),
                       'originalScope':source.get('scope'),'existingPolicyDisposition':policies[ident]['disposition'],
                       'publicationEvidence':None if evidence is None else {k:evidence[k] for k in ['publicationKind','publisher','ruleset','evidenceUrl','editionEvidenceUrl'] if k in evidence},
                       'relationshipStatus':status,'candidates':candidates,'accepted':False,'canonicalSourceId':None,
                       'automaticSourceReplacement':False})
    unlinked=[{'providerSourceId':r['providerSourceId'],'title':r['title'],'sourceUrl':r['sourceUrl'],
               'providerType':r['providerType'],'metadataBucket':r['metadataBucket'],
               'reviewStatus':'needs-publication-or-component-review-not-proven-missing'}
              for r in rows if r['providerSourceId'] not in preferred_ids and r['providerRuleset']['name']=='5e' and not r['providerIsThirdParty']]
    return {'schemaVersion':1,'status':'library-source-link-proposals-not-source-or-denominator-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,
            'summary':{'historicalSources':len(sources),'preservedHistoricalSources':len(output),'libraryObservations':len(rows),
                       'byRelationshipStatus':dict(sorted(Counter(r['relationshipStatus'] for r in output).items())),
                       'distinctPreferredProviderCandidates':len(preferred_ids),'unlinkedProvider5eNonThirdParty':len(unlinked)},
            'records':output,'unlinkedProvider5eNonThirdParty':unlinked,
            'limits':['Every historical source and policy is preserved; candidate links do not accept publication identities.',
                      'Other-version same-name hits remain visible even where a direct primary URL selects a2014 candidate.',
                      'No library listing does not prove exclusion or a missing catalogue entry.',
                      'Co-brand publisher labels do not override independent publication evidence.',
                      'Compilations, bundles, chapters, experimental publications and alternate channels require separate review.',
                      'No full-rule/version/reuse-rights/canonical-ID or runtime changes.']}


def build(root=Path('.')):
    raw=[(root/path).read_text(encoding='utf-8').replace('\r\n','\n') for path in INPUTS]
    result=review(*[json.loads(text) for text in raw])
    result['inputSha256']={path:hashlib.sha256(text.encode()).hexdigest() for path,text in zip(INPUTS,raw)}
    result['generator']={'path':'scripts/review-library-source-links-2014.py','sha256':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest()}
    return result


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output');args=parser.parse_args()
    report=build()
    if args.output:Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report['summary'],ensure_ascii=False))
