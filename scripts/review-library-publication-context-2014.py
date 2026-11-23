"""Join explicit publication relationships without merging source namespaces or rules."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

INPUTS=['catalog/publisher-library-observations-2026-11-21.json','catalog/library-source-link-proposals-2014.json',
        'catalog/numeric-source-publisher-evidence.json','catalog/unnumbered-publication-relations-2014.json',
        'catalog/class-scope-policy-2014.json','catalog/library-publication-relation-proposals-2014.json']


def fingerprint(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()


def review(library,links,bibliography,unnumbered,policy,proposals):
    if proposals.get('accepted') is not False or proposals.get('complete') is not False or proposals.get('approvedDenominator') is not None:
        raise ValueError('Premature publication acceptance')
    providers={r['providerSourceId']:r for r in library['records']}
    numeric={r['dndsuSourceId']:r for r in links['records']}
    evidence={r['sourceId']:r for r in bibliography['records']}
    named={r['bibliographyEvidenceId']:r for r in unnumbered['relations']}
    if len(providers)!=len(library['records']) or len(numeric)!=len(links['records']):raise ValueError('Duplicate source identity')
    if len(named)!=len(unnumbered['relations']) or len(evidence)!=len(bibliography['records']):raise ValueError('Duplicate evidence identity')
    if policy['policy'].get('experimental') is not False or policy['policy'].get('basis')!='owner-official-wotc-2014-only':
        raise ValueError('Owner policy changed; existing exclusion must be reviewed')
    raw_unlinked={r['providerSourceId'] for r in links['unlinkedProvider5eNonThirdParty']}
    seen_ids=set();seen_origins=set();numeric_relations={};named_rows=[];relation_rows=[];linked_targets=set();excluded_targets=set()
    for relation in proposals['relations']:
        if relation['id'] in seen_ids:raise ValueError('Duplicate relationship ID')
        seen_ids.add(relation['id'])
        if relation.get('accepted') is not False or relation.get('complete') is not False or relation.get('canonicalPublicationCount') is not None or relation.get('automaticSourceReplacement') is not False:
            raise ValueError('Premature relationship acceptance or replacement')
        origin=relation['origin'];basis=relation['basis'];kind=relation['relationType']
        if set(origin)!= {'kind','id'}:raise ValueError('Mixed source namespaces in origin')
        identity=(origin['kind'],origin['id'])
        if identity in seen_origins:raise ValueError('Original publications must remain distinct')
        seen_origins.add(identity)
        target_ids=[r['providerSourceId'] for r in relation['targets']]
        if not target_ids or len(set(target_ids))!=len(target_ids):raise ValueError('Missing or duplicated target')
        for target in relation['targets']:
            if target['providerSourceId'] not in raw_unlinked:raise ValueError('Target is not in the prior unlinked review set')
            actual=providers[target['providerSourceId']]
            if target['title']!=actual['title'] or target['sourceUrl']!=actual['sourceUrl']:raise ValueError('Changed primary target identity')
        detail={}
        if origin['kind']=='dndsu-source':
            sid=origin['id']
            if sid not in numeric or sid not in evidence or numeric[sid]['candidates']:raise ValueError('Unknown or already linked historical source')
            witness=evidence[sid]
            if basis['kind']!='numeric-publication-evidence' or basis['recordId']!=sid or basis.get('evidenceUrl')!=witness.get('evidenceUrl'):raise ValueError('Wrong numeric witness')
            if relation.get('preserveOriginalPublications') is not True:raise ValueError('Do not merge original publications')
            if kind not in ['later-refined-compilation','boxed-set-containing-adventure','bundle-with-rule-components']:raise ValueError('Wrong numeric relation type')
            if kind=='bundle-with-rule-components':
                if len(target_ids)!=2 or {r.get('role') for r in relation['targets']}!={'creature-statblocks','magic-items'} or relation.get('excludedNonRuleComponents')!=['digital-dice-set']:
                    raise ValueError('Bundle must keep both rule components and exclude non-rule dice')
            elif len(target_ids)!=1:raise ValueError('Expected one container candidate')
            numeric_relations[sid]=relation['id'];detail={'historicalTitle':numeric[sid]['historicalTitle'],'existingPolicyDisposition':numeric[sid]['existingPolicyDisposition']}
            linked_targets.update(target_ids)
        elif origin['kind']=='bibliography':
            bid=origin['id']
            if bid not in named or kind!='named-publication-library-reference' or len(target_ids)!=1:raise ValueError('Wrong bibliography relation')
            witness=named[bid]
            if basis['kind']!='unnumbered-publication-relation' or basis['recordId']!=bid or basis.get('observationId')!=witness['observationId']:raise ValueError('Wrong unnumbered witness')
            if witness['observedSourceIds'] or witness['numericSourceId'] is not None:raise ValueError('Named reference acquired a numeric source')
            if providers[target_ids[0]]['title']!=witness['observedSourceTitle']:raise ValueError('Named publication title differs')
            detail={k:witness[k] for k in ['observationId','observedSourceIds','bibliographyEvidenceId','historicalBibliographyScopeDecision','currentNamedPublicationDisposition']}
            detail.update(numericSourceId=None,automaticAttribution=False)
            named_rows.append({'relationId':relation['id'],**detail});linked_targets.update(target_ids)
        elif origin['kind']=='owner-policy':
            witness=policy['policy']
            if (kind!='existing-experimental-exclusion' or origin['id']!=witness['basis'] or basis['kind']!='owner-class-scope-policy'
                    or basis['recordId']!=witness['decisionDate'] or target_ids!=[100] or providers[100]['title']!='Unearthed Arcana'):
                raise ValueError('Wrong existing experimental exclusion')
            detail={'existingOwnerDecisionDate':witness['decisionDate'],'experimentalAllowed':False};excluded_targets.update(target_ids)
        else:raise ValueError('Unknown typed origin')
        if basis.get('recordSha256')!=fingerprint(witness):raise ValueError('Changed semantic witness requires renewed review')
        relation_rows.append({'id':relation['id'],'origin':origin,'relationType':kind,'targets':relation['targets'],'basis':basis,**detail,
                              'accepted':False,'textEquivalence':'unverified','canonicalPublicationCount':None,'automaticSourceReplacement':False})
    if linked_targets & excluded_targets:raise ValueError('Linked and excluded target overlap')
    ledger=[{'dndsuSourceId':r['dndsuSourceId'],'historicalTitle':r['historicalTitle'],'existingPolicyDisposition':r['existingPolicyDisposition'],
             'priorRelationshipStatus':r['relationshipStatus'],'compositionRelationId':numeric_relations.get(r['dndsuSourceId'])} for r in links['records']]
    remaining=[r for r in links['unlinkedProvider5eNonThirdParty'] if r['providerSourceId'] not in linked_targets|excluded_targets]
    historic_remaining=[r for r in ledger if r['priorRelationshipStatus']=='no-library-candidate' and not r['compositionRelationId']]
    return {'schemaVersion':1,'status':'current-publication-reference-context-not-canonical-catalogue',
            'accepted':False,'complete':False,'approvedDenominator':None,
            'summary':{'historicalSourceRows':len(ledger),'publicationRelations':len(relation_rows),'numericCompositionOrigins':len(numeric_relations),
                       'namedBibliographyOrigins':len(named_rows),'additionalLinkedProviderReferences':len(linked_targets),
                       'existingOwnerExcludedProviderReferences':len(excluded_targets),'priorUnlinkedProviderReferences':len(raw_unlinked),
                       'remainingUnlinkedProviderReferences':len(remaining),'remainingHistoricalRowsWithoutProviderCandidate':len(historic_remaining)},
            'relations':relation_rows,'historicalSourceLedger':ledger,'namedPublicationLedger':named_rows,
            'remainingUnlinkedProviderReferences':remaining,'remainingHistoricalRows':historic_remaining,
            'limits':['The70 historical numeric sources and three typed unnumbered references are not interchangeable namespaces.',
                      'Grung race169 never fills numeric AL source169; named dispositions and empty sourceIds are preserved.',
                      'Two original adventures can reference one later refined compilation without becoming one text version.',
                      'A bundle retains separate creature/item components; dice are not rule entries.',
                      'UA remains owner-excluded even though library metadata says WotC/non-third-party/5e.',
                      'Reference links do not accept the full publication inventory, canonical counts, rules, rights or runtime imports.']}


def build():
    raw=[Path(p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS]
    report=review(*[json.loads(s) for s in raw])
    report['inputSha256']={p:hashlib.sha256(s.encode()).hexdigest() for p,s in zip(INPUTS,raw)}
    report['generator']={'path':'scripts/review-library-publication-context-2014.py','sha256':hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest()}
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output');args=parser.parse_args();report=build()
    if args.output:Path(args.output).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report['summary'],ensure_ascii=False))
