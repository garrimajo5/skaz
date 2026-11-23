"""Current source-body witness map, not a canonical rule denominator or acceptance counter."""
import argparse
import hashlib
import json
from pathlib import Path
EVIDENCE={'generalReference': {'path': 'catalog/spellcasting-reference-scopes-2014.json', 'sha256': '0e20ecfc18534dcc94752854e8ff018d8ad109eeabe9290036d04a6c57d925d3', 'pr': 234, 'head': '80e16bcac195f52761a47de2a83f868e7926b400', 'review': 'https://github.com/garrimajo5/skaz/pull/234#issuecomment-7064250485', 'scope': '48heading inventory and two complete selected KnownPrepared/Armor scopes(4secondary paragraphs),not full mixed page'}, 'castingClauses': {'path': 'catalog/general-casting-clauses-2014.json', 'sha256': 'aa6815ec47e2cb963c1c30e5fc50082bb20a6fc47861bc6c6f502dfcd59c97cf', 'pr': 236, 'head': '344a66a37aee1f3151384cc230922ec606c1d848', 'review': 'https://github.com/garrimajo5/skaz/pull/236#issuecomment-7064939796', 'scope': '13selected general casting scopes/32secondary paragraphs,cantrip errata/material qualifier caveat retained'}, 'concentrationTargets': {'path': 'catalog/general-concentration-targets-2014.json', 'sha256': '0913dd9d2f06d30f69bd60d32451d89117170f1a6a354d82029bf64d87c5330b', 'pr': 237, 'head': '5cab5effb2f28340abd868ce483efdd62c7b1034', 'review': 'https://github.com/garrimajo5/skaz/pull/237#issuecomment-7065116486', 'scope': '6selected full scopes/13paragraphs/3list items,Basic rounding and referent caveat retained'}, 'areasEffects': {'path': 'catalog/general-areas-effects-2014.json', 'sha256': '64aef4dd8001785004414ed3cee11cb7d1d0a7084563294d1a7db2cee5139896', 'pr': 238, 'head': '3968c43ed70dc850cf68f59fc3da2604aa959156', 'review': 'https://github.com/garrimajo5/skaz/pull/238#issuecomment-7065234416', 'scope': '9ordinary-prose scopes/19paragraphs;7diagrams/6captions unverified;equal-potency errata separate'}, 'introductionsSchools': {'path': 'catalog/general-introductions-schools-2014.json', 'sha256': '8618b63a316e83bdc40eebc5124f1826244bad5a32e341f74c6998ddf4a01dc1', 'pr': 239, 'head': 'cb3455094a9ab8b26d1a25ed5be14c18f8ccf9ff', 'review': 'https://github.com/garrimajo5/skaz/pull/239#issuecomment-7065896663', 'scope': '4selected full scopes/18paragraphs/eight explicit school mappings;article boundary excludes UI'}, 'readyBonus': {'path': 'catalog/ready-bonus-context-2014.json', 'sha256': 'd921d0707996439739a7e678fc6da9406c108424b2669db0446d05d5d9dbae5a', 'pr': 240, 'head': 'e06c5b13cc479e1bc80f802e73df51cae6042d22', 'review': 'https://github.com/garrimajo5/skaz/pull/240#issuecomment-7066100829', 'scope': 'Ready17 spell excerpt/bonus18 condensation with full combat/reaction/errata context'}}
NARRATIVE='catalog/weave-narrative-2014.json'


def sha(raw):return hashlib.sha256(raw).hexdigest()


def load_inputs(root):
    data={}
    for key,spec in EVIDENCE.items():
        raw=(root/spec['path']).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=spec['sha256']:raise ValueError('Changed report cannot inherit exact independent review')
        data[key]=json.loads(raw)
    raw=(root/NARRATIVE).read_bytes().replace(b'\r\n',b'\n');narrative=json.loads(raw)
    if narrative['generator']['sha256']!=sha((root/narrative['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed co-versioned narrative generator')
    return data,narrative,sha(raw)


def claim(assignments,base,ordinal,digest,evidence,selector,kind,media=0,captions=0):
    if not isinstance(ordinal,int) or isinstance(ordinal,bool) or ordinal not in range(49):raise ValueError('Unknown original body ordinal')
    if ordinal in assignments:raise ValueError('Duplicate body assignment; keep corroboration separate')
    if digest!=base[ordinal]['bodyTextSha256']:raise ValueError('Changed source-body identity')
    assignments[ordinal]={'evidenceKey':evidence,'reportSelector':selector,'scopeKind':kind,'diagramCountUnverified':media,'captionCountUnverified':captions,'fullRulesAccepted':False,'canonicalId':None}


def combine(data,narrative):
    for d in [*data.values(),narrative]:
        if d.get('accepted') or d.get('complete') or d.get('acceptedForRuntime') or d.get('runtimeChanged') or d.get('approvedDenominator') is not None:raise ValueError('Selected witnesses cannot become full/runtime acceptance')
    original=data['generalReference']['inventory']['blocks'];source=data['generalReference']['source']['sha256']
    if len(original)!=49 or [b['ordinal'] for b in original]!=list(range(49)):raise ValueError('Changed original49body sequence')
    for key,d in data.items():
        digest=d['source']['sha256'] if key=='generalReference' else d['sources']['secondary']['sha256']
        if digest!=source:raise ValueError('Different article snapshot requires separate observations')
    if narrative['sources']['secondary']['sha256']!=source:raise ValueError('Narrative snapshot cannot inherit original identity')
    assigned={}
    for index,r in enumerate(data['generalReference']['selectedComparisons']):
        n=r['secondaryHeadingOrdinal'];expected={'known-prepared':3,'casting-in-armor':4}
        if expected.get(r['key'])!=n:raise ValueError('Changed original selected-reference relationship')
        claim(assigned,original,n,original[n]['bodyTextSha256'],'generalReference','/selectedComparisons/'+str(index),'complete-selected-text')
    for key,kind in [('castingClauses','complete-selected-text-with-caveats'),('concentrationTargets','complete-selected-text-with-lists'),('areasEffects','ordinary-prose-with-media-separate'),('introductionsSchools','complete-selected-introduction-category-text')]:
        for index,r in enumerate(data[key]['records']):
            digest=(r['secondary']['bodyTextSha256'] if key=='concentrationTargets' else r['secondaryBodySha256'] if key=='introductionsSchools' else r['bodyTextSha256'])
            media=len(r.get('diagramReferences',[]));captions=len(r.get('captionTextSha256',[]))
            claim(assigned,original,r['headingOrdinal'],digest,key,'/records/'+str(index),kind,media,captions)
    for index,r in enumerate(data['readyBonus']['secondaryObservations']):
        kind={17:'spell-excerpt-with-full-external-action-context',18:'condensed-repeat-of-clause14-not-new-capability'}.get(r['headingOrdinal'])
        if kind is None:raise ValueError('Unknown Ready/bonus observation')
        claim(assigned,original,r['headingOrdinal'],r['bodyTextSha256'],'readyBonus','/secondaryObservations/'+str(index),kind)
    for index,r in enumerate(narrative['records']):
        if r['headingOrdinal'] not in [0,48]:raise ValueError('Unexpected new narrative body')
        kind='narrative-prose-with-embedded-navigation-separate' if r['headingOrdinal']==0 else 'complete-selected-narrative-prose'
        claim(assigned,original,r['headingOrdinal'],r['originalCombinedBodySha256'],'coVersionedNarrative','/records/'+str(index),kind)
    pending={7,8,9,31,32,33,40,41,42,46,47}
    if set(range(49))-set(assigned)!=pending or len(assigned)!=38:raise ValueError('Changed selected/pending partition; reassess explicitly')
    if sum(a['diagramCountUnverified'] for a in assigned.values())!=len(data['generalReference']['inventory']['images']) or sum(a['captionCountUnverified'] for a in assigned.values())!=6:raise ValueError('Lost diagram/caption observations')
    rows=[]
    for old in original:
        n=old['ordinal'];entry={'observationReference':{'articleSnapshotSha256':source,'ordinal':n,'title':old['title'],'bodyTextSha256':old['bodyTextSha256']},'canonicalId':None,'canonicalRuleMissingProven':False,'acceptedForRuntime':False,'sourceIdInherited':False}
        if n in assigned:entry.update(state='selected-body-witness-present',**assigned[n])
        else:
            group='spell-points-variant' if n in [7,8,9] else 'xge-labelled-or-adjacent-grid' if n in [31,32,33,40,41,42] else 'tce-labelled-or-adjacent-theme-table'
            entry.update(state='awaiting-own-primary-scope-version-comparison',pendingGroup=group,explicitHeadingLabel='XGE' if '(XGE)' in old['title'] else 'TCE' if '(TCE)' in old['title'] else None,fullRulesAccepted=False)
        entry['originalTableElementCount']=old['bodyTagCounts'].get('table',0);rows.append(entry)
    return {'schemaVersion':1,'status':'current-49-source-body-witness-map-not-canonical-rules-denominator','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'originalBodyObservations':49,'withSelectedBodyWitness':38,'awaitingOwnPrimaryBodyComparison':11,'additionalWitnessedBodiesWithUnverifiedMedia':5,'unverifiedDiagramsRetained':7,'unverifiedCaptionsRetained':6,'canonicalUnitsAccepted':0},
        'sourceArticle':data['generalReference']['source'],'rows':rows,
        'independentlyReviewedEvidence':EVIDENCE,'coVersionedNarrative':{'path':NARRATIVE,'scope':'prelude2p+Weave5p with TOC and Basic carrier witness','priorIndependentReviewInherited':False},
        'unverifiedMediaHeadingOrdinals':[r['observationReference']['ordinal'] for r in rows if r.get('diagramCountUnverified')],
        'pendingHeadingOrdinals':sorted(pending),'navigationClassifiedSeparately':narrative['preludeNavigation'],
        'nextWorkItem':narrative['nextWorkItem'],
        'limits':['49bodies/38witnessed/11pending partitions source observations,not game rules,missing catalog records or a completeness denominator.',
            'Five witnessed bodies still have seven unverified diagrams and six captions; tables/variants/XGE/TCE need their own primary scopes.',
            'Ready spell excerpt,duplicate bonus observation,narrative and complete selected text are different scope kinds,not equal accepted features.',
            'Original body/order/title/hash remains unchanged; no source arrays,canonical IDs,full class,translation,rights,runtime or owner milestone accepted.']}


def build(root=Path('.')):
    data,narrative,digest=load_inputs(root);d=combine(data,narrative);d['inputSha256']={s['path']:s['sha256'] for s in EVIDENCE.values()};d['inputSha256'][NARRATIVE]=digest
    d['generator']={'path':'scripts/review-spellcasting-scope-coverage-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))};return d


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path('.'));p.add_argument('--output',type=Path,required=True);a=p.parse_args();d=build(a.root);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
