"""Map selected class observations to bounded corresponding evidence, without accepting their translations or source claims."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
INPUTS=['catalog/dndsu-reviewed-class-proposals.json','catalog/artificer-heading-unit-proposals-2014.json','catalog/srd51-class-features.json','catalog/rest-spellcasting-source-comparison-2014.json','catalog/wizard-recovery-source-comparison-2014.json','catalog/wizard-ritual-source-comparison-2014.json','catalog/dndsu-source-register.json']
CLASS_URLS={'wizard':'https://dnd.su/class/105-wizard/','artificer':'https://dnd.su/class/137-artificer/'}
LOCAL_LINKS={'feature.spellcasting':'wizard-spellcasting','feature.arcane-recovery':'wizard-arcane-recovery','feature.arcane-tradition':'wizard-arcane-tradition','feature.ASI':'wizard-ability-score-improvement','feature.spell-mastery':'wizard-spell-mastery','feature.signature-spells':'wizard-signature-spells'}
SPELLCASTING_UNITS=['wizard-preparation-selected','wizard-spellcasting-bonuses','wizard-learning-on-level','wizard-copy-base-cost','wizard-errata-selected']


def sha(raw):return hashlib.sha256(raw).hexdigest()

def validate_evidence(rest,recovery,ritual):
    if any(d.get('accepted') or d.get('complete') or d.get('approvedDenominator') is not None for d in [rest,recovery,ritual]):raise ValueError('Bounded evidence cannot imply canonical acceptance')
    if rest['acceptedForRuntime'] or rest['runtimeChanged'] or recovery['acceptedForRuntime'] or recovery['runtimeChanged'] or ritual['acceptedForRuntime'] or ritual['runtimeChanged']:
        raise ValueError('Source-only evidence changed to runtime acceptance')
    if recovery['unitId']!='wizard-arcane-recovery' or not recovery['normalizedSelectedUnitTextEqual'] or ritual['unitId']!='source-comparison:wizard-ritual-casting' or not ritual['normalizedSelectedUnitTextEqual']:
        raise ValueError('Wrong bounded Wizard components')
    if len({u['key'] for u in rest['units']})!=len(rest['units']) or not set(SPELLCASTING_UNITS+['wizard-asi-levels']).issubset(u['key'] for u in rest['units']):raise ValueError('Missing/ambiguous selected source units')

def resolve(catalog,headings,features,rest,recovery,ritual,register):
    validate_evidence(rest,recovery,ritual)
    selected={}
    for slug,url in CLASS_URLS.items():
        found=[c for c in catalog['classes'] if c['classUrl']==url]
        if len(found)!=1:raise ValueError('Missing/ambiguous selected class proposal')
        selected[slug]=found[0]
    if headings['classUrl']!=CLASS_URLS['artificer'] or headings['accepted'] or headings['complete']:raise ValueError('Wrong or accepted secondary heading scope')
    if any(c['status']!='content-proposal-awaiting-independent-review' for c in selected.values()):raise ValueError('Changed proposal stage')
    all_ids=[r['id'] for c in selected.values() for r in c['records']]
    if len(set(all_ids))!=len(all_ids):raise ValueError('Duplicate selected candidate IDs')
    source_titles={r['sourceId']:r['title'] for r in register['sources']}
    if source_titles.get('102')!="Player's Handbook" or source_titles.get('117')!="Tasha's Cauldron of Everything":raise ValueError('Changed historical source namespace')
    local={f['id']:f for f in features['features']}
    if len(local)!=len(features['features']) or features['ruleset']!='5e-2014':raise ValueError('Changed local feature identity/edition')
    units={r['key']:r for r in rest['units']};rows=[]
    for slug,c in selected.items():
        for candidate in c['records']:
            if not candidate['id'].startswith('scope:'+slug+':') or not candidate['sourceUrl'].startswith(c['classUrl']+'#'):raise ValueError('Wrong candidate class namespace')
            if candidate['canonicalCatalogId'] is not None or candidate['fullRules']!='unverified':raise ValueError('Candidate moved beyond unverified stage')
            refs=[];local_id=None
            if slug=='wizard' and candidate['parent']=='class-features' and candidate['kind']=='base-feature':
                fragment=candidate['sourceUrl'].split('#',1)[1];local_id=LOCAL_LINKS.get(fragment)
                if local_id:
                    if local_id not in local or local[local_id]['classId']!='wizard':raise ValueError('Wrong class for local feature link')
                    if candidate['sourceIds']!=['102'] or candidate['sourceBasis']!='base-class-page-source':raise ValueError('Base source link cannot replace optional-source feature')
                if fragment=='feature.spellcasting':
                    refs=[{'path':INPUTS[3],'unitKey':key,'scope':'selected source scope only; may include a different sidebar/feature clause','sourceScope':{k:units[key][k] for k in ['source','pdfPage','start','stop']}} for key in SPELLCASTING_UNITS]
                    for ref in refs:
                        unit=units[ref['unitKey']];allowed=(['copyingUsesPreparableSpellLevel','bookRepositoryExcludesCantrips'] if ref['unitKey']=='wizard-errata-selected' else list(unit['facts']))
                        ref['correspondingFacts']={k:unit['facts'][k] for k in allowed};ref['excludedFactKeys']=[k for k in unit['facts'] if k not in allowed]
                        ref['sourceLimitations']=unit['limitations'];ref['spellbookSidebarContextOnly']=ref['unitKey']=='wizard-errata-selected'
                    refs.append({'path':INPUTS[5],'unitKey':ritual['unitId'],'scope':ritual['scope']})
                elif fragment=='feature.arcane-recovery':refs=[{'path':INPUTS[4],'unitKey':recovery['unitId'],'scope':recovery['scope']}]
                elif fragment=='feature.ASI':refs=[{'path':INPUTS[3],'unitKey':'wizard-asi-levels','scope':'selected SRD ASI clause; not candidate translation acceptance','sourceScope':{k:units['wizard-asi-levels'][k] for k in ['source','pdfPage','start','stop']}}]
            rows.append({'classSlug':slug,'candidateReference':{k:candidate[k] for k in ['id','kind','title','sourceUrl','headingOrdinal','parent','sourceIds','sourceBasis','observedInitialLevels']},
                'candidateSnapshotSha256':c['inputPageSha256'],'localSrdParentFeatureId':local_id,'localImplementationStatus':local[local_id]['status'] if local_id else None,
                'correspondingSourceComponents':refs,'evidenceState':'bounded-corresponding-source-components' if refs else 'local-srd-reference-only' if local_id else 'no-linked-primary-component-in-this-matrix',
                'originalCandidateTextOrTranslationCompared':False,'originalSourceClaimsValidatedByCorrespondence':False,
                'completeCandidateRulesAccepted':False,'automaticCapabilityAccepted':False,'manualDeviationAllowedWithWarning':True})
    by_id={r['candidateReference']['id']:r for r in rows if r['classSlug']=='artificer'};heading_rows=[]
    ordinals=[r['heading']['ordinal'] for r in headings['records']]
    if len(set(ordinals))!=len(ordinals):raise ValueError('Duplicate heading ordinals')
    for r in headings['records']:
        parent=r['parentFeatureObservationId'];target=by_id.get(parent)
        if parent and not parent.startswith('scope:artificer:'):raise ValueError('Cross-class parent cannot inherit Wizard evidence')
        if r['fullRulesVerified'] or r['accepted']:raise ValueError('Fresh heading proposal moved beyond inspected stage')
        heading_rows.append({'headingReference':r['heading'],'kind':r['kind'],'originalParentFeatureObservationId':parent,'originalParentBasis':r['parentBasis'],
            'parentReferenceState':'resolved-existing-artificer-candidate' if target else 'unresolved-parent-reference' if parent else 'no-parent-reference',
            'sameSecondarySnapshot':headings['snapshotPageSha256']==selected['artificer']['inputPageSha256'],
            'sourceComponentsInheritedFromWizard':False,'completeRulesVerified':False,'canonicalId':None})
    return {'schemaVersion':1,'status':'candidate-to-corresponding-source-scope-map-not-translation-or-class-acceptance','accepted':False,'complete':False,'approvedDenominator':None,
        'summary':{'selectedCandidateRecords':len(rows),'byClass':dict(Counter(r['classSlug'] for r in rows)),'byEvidenceState':dict(Counter(r['evidenceState'] for r in rows)),
            'preservedAdditionalArtificerHeadings':len(heading_rows),'resolvedArtificerParentReferences':sum(r['parentReferenceState']=='resolved-existing-artificer-candidate' for r in heading_rows),
            'canonicalUnitsAccepted':0,'completeCandidateRulesAccepted':0},
        'candidateRows':rows,'artificerHeadingRows':heading_rows,
        'sourceNamespaces':{'historical102':source_titles['102'],'historical117':source_titles['117'],'source117IsSrdOrProviderId':False},
        'limits':['Stable class/feature anchors link corresponding English source components, not Russian text identity, translation or claimed PHB/TCE source equivalence.',
            'One selected errata scope includes a separate Minor Conjuration correction; it is not part of Wizard base Spellcasting by adjacency.',
            'Equal Spellcasting/ASI labels never inherit Wizard rules for Artificer; optional TCE features do not become SRD omissions.',
            'Subclasses, choices, infusions and unsupported primary gaps remain visible; no new auto-grants, game-action blocks or real profile edits.',
            'This map inventories existing witnesses; it performs no new full-text retrieval or catalogue denominator acceptance.']}


def build(root=Path('.')):
    texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};d=resolve(*[json.loads(t) for t in texts.values()])
    d['inputSha256']={p:sha(t.encode()) for p,t in texts.items()};d['generator']={'path':'scripts/review-wizard-artificer-source-scopes-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))};return d

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path('.'));p.add_argument('--output');a=p.parse_args();d=build(a.root)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps(d['summary']))
