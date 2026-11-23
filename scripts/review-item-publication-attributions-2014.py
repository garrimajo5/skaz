"""Read-only metadata for four item attribution groups. No item rules imported."""
import argparse
import hashlib
import json
import re
import runpy
from pathlib import Path
from urllib.parse import quote

ROOT=Path(__file__).resolve().parents[1]
shared=runpy.run_path(str(ROOT/'scripts/extract-remaining-bestiary-evidence.py'))
listing=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-index.py'))


def extract_listing(raw,name,url):
    Tree,only,clean=listing['Tree'],listing['only'],listing['clean']
    tree=Tree();tree.feed(raw.decode('utf-8'))
    if len(list(tree.root.find(lambda n:n.tag=='h1' and clean(n)=='Magic Items')))!=1:
        raise ValueError('Missing publisher item listing title')
    container=only(tree.root.find(lambda n:n.tag=='ul' and n.has('rpgmagic-item-listing')),'item listing')
    rows=[];seen=set()
    for n in container.find(lambda n:n.has('info') and n.attrs.get('data-type')=='magic-items'):
        named=only(n.find(lambda n:n.has('item-name')),'item name')
        a=only(named.find(lambda n:n.tag=='a' and re.fullmatch(r'/magic-items/[0-9]+-[a-z0-9-]+',n.attrs.get('href',''))),'item ID')
        label=clean(a)
        if label!=name:continue
        href=a.attrs['href']
        if href in seen:raise ValueError('Duplicate item identity link')
        seen.add(href)
        rows.append({'heading':label,'cardUrl':'https://www.dndbeyond.com'+href,
            'legacyBadge':a.attrs.get('aria-describedby')=='legacy-badge','editionInferredFromBadge':False,
            'publicationAssigned':False,'identityAccepted':False})
    return {'name':name,'url':url,'htmlSha256':hashlib.sha256(raw).hexdigest(),'records':rows,
        'publicationEvidence':False,'fullRulesAccepted':False}


def build(review,policy,selection,manifest,raws,list_manifest,list_raws,attempts):
    groups=[g for g in review['identityGroups'] if g['section']=='items' and g['decision']=='define-separate-source-version-units']
    if len(groups)!=4 or sorted(g['reviewId'] for g in groups)!=selection['selectedReviewIds'] or selection['accepted'] is not False:
        raise ValueError('Item scope changed')
    basis=[{'reviewId':g['reviewId'],'name':g['comparisonKey'],'observationId':m['id'],'observedName':m['observedName'],'sourceIds':m['sourceIds']} for g in groups for m in g['members']]
    if basis!=selection['observationBasis'] or len(basis)!=8 or any(len(x['sourceIds'])!=1 for x in basis):raise ValueError('Item observation attribution changed')
    byid={x['sourceId']:x for x in manifest}
    if len(byid)!=6 or len(manifest)!=6 or set(byid)!={x['sourceId'] for x in selection['sources']}:raise ValueError('Item source selection changed')
    sources=[];witnesses={}
    for spec in selection['sources']:
        ident=spec['sourceId'];item=byid[ident];rules=[x for x in policy['records'] if x['sourceId']==ident]
        if len(rules)!=1 or rules[0]['observedTitle']!=spec['policyTitle'] or rules[0]['disposition']!='eligible-publication-records-need-review':raise ValueError('Changed item publication policy')
        if item['requestedUrl']!=spec['sourceUrl'] or item['resolvedUrl']!=spec['sourceUrl'] or item['file']!=ident+'.html' or hashlib.sha256(raws[ident]).hexdigest()!=item['htmlSha256']:raise ValueError('Substituted item source')
        names=sorted({g['comparisonKey'] for g in groups if any(m['sourceIds']==[ident] for m in g['members'])})
        source=shared['extract_source'](raws[ident],spec,names)
        sources.append(source)
        witnesses[ident]={x['name']:{'kind':x['kind'],'heading':x['heading'],'targetUrl':x['targetUrl'],'indexUrl':source['indexUrl'],'htmlSha256':source['htmlSha256'],'publicationPresenceOnly':True,'fullItemIdentityAccepted':False} for x in source['records']}
    expected_names=sorted(g['comparisonKey'] for g in groups)
    listings=[];seen_names=set();cards={}
    for row in list_manifest:
        name=row['name'];url='https://www.dndbeyond.com/magic-items?filter-search='+quote(name)
        if name.lower() not in expected_names or name.lower() in seen_names or row['url']!=url or row.get('resolvedUrl')!=url:raise ValueError('Changed listing selection')
        seen_names.add(name.lower())
        raw=list_raws[name]
        if hashlib.sha256(raw).hexdigest()!=row['htmlSha256']:raise ValueError('Changed listing hash')
        result=extract_listing(raw,name,url);listings.append(result)
        for x in result['records']:
            if x['cardUrl'] in cards:raise ValueError('Duplicate unassigned item ID')
            cards[x['cardUrl']]=name
    if seen_names!=set(expected_names):raise ValueError('Incomplete listing names')
    access=[];seen_access=set()
    for row in attempts:
        if row['url'] not in cards or row['url'] in seen_access or row['name']!=cards[row['url']]:raise ValueError('Access attempt without selected listing ID')
        seen_access.add(row['url'])
        access.append({**{k:row[k] for k in ['name','url','resolvedUrl','htmlSha256','error'] if k in row},'usedAsPublicationWitness':False,'rulesRead':False,
            'status':'unavailable' if 'error' in row else 'redirected-access-page' if row['resolvedUrl']!=row['url'] else 'unassigned-card-metadata-only'})
    if seen_access!=set(cards):raise ValueError('Incomplete selected card access accounting')
    proposals=[];seen=set()
    for g in groups:
        observations=[]
        for m in g['members']:
            if m['id'] in seen or m['section']!='items' or m['observedName'].strip().lower()!=g['comparisonKey']:raise ValueError('Repeated or changed item observation')
            seen.add(m['id']);ident=m['sourceIds'][0]
            observations.append({'observationId':m['id'],'observedName':m['observedName'],'sourceIds':list(m['sourceIds']),'publicationWitness':witnesses[ident].get(g['comparisonKey']),
                'accepted':False,'canonicalId':None,'fullRules':'unverified','exactErrataVersion':'unverified','translationReusePermission':'not-established'})
        proposals.append({'reviewId':g['reviewId'],'name':g['comparisonKey'],'observations':observations,'allPublicationHeadingsWitnessed':all(x['publicationWitness'] for x in observations),
            'accepted':False,'canonicalId':None,'automaticMerge':False,'automaticCharacterMigration':False})
    return {'schemaVersion':1,'status':'item-publication-attribution-proposals-awaiting-review','accepted':False,'complete':False,'approvedDenominator':None,
        'summary':{'consideredGroups':4,'preservedObservations':len(seen),'publicationClaims':len(seen),'exactPublicationHeadingClaims':sum(bool(x['publicationWitness']) for g in proposals for x in g['observations']),
            'groupsWithAllPublicationHeadings':sum(g['allPublicationHeadingsWitnessed'] for g in proposals),'parentContexts':sum(len(s['parentContexts']) for s in sources),
            'unassignedItemCandidates':len(cards),'cardAccessFailures':sum(x['status']=='unavailable' for x in access),'accessPageRedirects':sum(x['status']=='redirected-access-page' for x in access),'acceptedCanonicalUnits':0},
        'sources':sources,'listings':listings,'cardAccess':access,'groups':proposals,
        'limitations':['Item identity by name, Legacy badge or access-page redirect is not a reviewed publication/ruleset association.',
            'Exact scoped headings prove publication presence only; no full item text, class requirement, charges, casting time or source version is accepted.',
            'Missing exact headings and inaccessible cards remain unresolved, not absent content. No login, claim button or paywall bypass was used.',
            'No canonical denominator, translation rights, runtime catalog or character data change is established.']}


def build_from_directory(directory):
    paths=['catalog/effective-m0-review-2014.json','catalog/numeric-source-scope-policy-2014.json','catalog/item-publication-source-selection-2014.json']
    raw=[(ROOT/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in paths];review,policy,selection=map(json.loads,raw)
    manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'));listings=json.loads((directory/'listing-manifest.json').read_text(encoding='utf-8'));attempts=json.loads((directory/'item-card-manifest.json').read_text(encoding='utf-8'))
    for item in attempts:
        if 'file' in item:
            if not re.fullmatch(r'[0-9]+-[a-z0-9-]+\.html',item['file']) or hashlib.sha256((directory/item['file']).read_bytes()).hexdigest()!=item['htmlSha256']:raise ValueError('Changed access snapshot')
    result=build(review,policy,selection,manifest,{s['sourceId']:(directory/(s['sourceId']+'.html')).read_bytes() for s in selection['sources']},listings,{x['name']:(directory/x['file']).read_bytes() for x in listings},attempts)
    result['inputSha256']={p:hashlib.sha256(t.encode()).hexdigest() for p,t in zip(paths,raw)}
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--directory',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    if a.output.resolve() in {p.resolve() for p in a.directory.iterdir()}:raise SystemExit('Output cannot overwrite an input-folder file')
    result=build_from_directory(a.directory);a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n');print(json.dumps(result['summary']))
