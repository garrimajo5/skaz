"""Current class-source evidence overlay: preserve old observations and advance only checked scopes."""
import argparse
import hashlib
import json
from pathlib import Path
EVIDENCE={'candidateMap': {'path': 'catalog/wizard-artificer-source-scopes-2014.json', 'sha256': '35cd01d9e040f995d980a655ca900492ffd8d211a88ed040d2cd5323f4bc9bd5', 'pr': 227, 'head': '01876659e4be009e645095c677cebbdcf52d278d', 'review': 'https://github.com/garrimajo5/skaz/pull/227#issuecomment-7063197013', 'scope': '130candidate/23heading preservation and bounded correspondence only'}, 'artificerErrata': {'path': 'catalog/artificer-errata-scopes-2014.json', 'sha256': 'fe1bdeaeee905651e8ddd60199d315ad090bde9aa23746d516f11da673f2c026', 'pr': 228, 'head': '005ae93bffb442208867fef8ad9926cd16c685d0', 'review': 'https://github.com/garrimajo5/skaz/pull/228#issuecomment-7063307174', 'scope': 'six source-specific selected clauses/PDFpage1 only'}, 'spellcastingInventory': {'path': 'catalog/wizard-spellcasting-scope-2014.json', 'sha256': 'd55f3e9b999d31abfc9b98ab76a3331c9e3c5fd205390b1f18bb646ebd0baddb', 'pr': 229, 'head': '6687601a979918f3cb514328a682973f8b786bc8', 'review': 'https://github.com/garrimajo5/skaz/pull/229#issuecomment-7063425731', 'scope': '9block21paragraph digital inventory and3selected comparisons only'}, 'spellbookSidebar': {'path': 'catalog/wizard-spellbook-sidebar-2014.json', 'sha256': '029e5bbb68162230d73159188cb1fda0af9f2c6966beac9b414ca61bf15b1917', 'pr': 230, 'head': '99f7da0987e91e6a0bceef15b8ea5cce185072fa', 'review': 'https://github.com/garrimajo5/skaz/pull/230#issuecomment-7063541170', 'scope': 'complete7paragraph415word sidebar with preserved literal carrier difference'}}


def sha(raw):return hashlib.sha256(raw).hexdigest()

def load_reviewed(root):
    data={}
    for key,spec in EVIDENCE.items():
        raw=(root/spec['path']).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=spec['sha256']:raise ValueError('Changed class evidence cannot inherit exact independent review')
        data[key]=json.loads(raw)
    return data

def combine(data):
    for d in data.values():
        if d.get('accepted') or d.get('complete') or d.get('approvedDenominator') is not None or d.get('acceptedForRuntime') or d.get('runtimeChanged'):raise ValueError('Bounded class evidence cannot become runtime/canonical acceptance')
    matrix=data['candidateMap'];errata=data['artificerErrata'];inventory=data['spellcastingInventory'];sidebar=data['spellbookSidebar']
    candidates=matrix['candidateRows'];ids=[r['candidateReference']['id'] for r in candidates];by_id={r['candidateReference']['id']:r for r in candidates}
    if len(ids)!=130 or len(set(ids))!=130 or len(matrix['artificerHeadingRows'])!=23 or any(r['completeCandidateRulesAccepted'] or r['automaticCapabilityAccepted'] for r in candidates):raise ValueError('Changed original candidate-stage boundaries')
    if inventory['summary']['digitalComponentBlocks']!=9 or inventory['summary']['digitalParagraphsIncludingSidebarTitle']!=21 or inventory['summary']['wholeFeatureAccepted']:raise ValueError('Changed feature inventory scope')
    if sidebar['unitId']!='source-comparison:wizard-your-spellbook' or sidebar['existingManualParent']['rewritten'] or sidebar['existingManualParent']['newFeatureCreated']:raise ValueError('Changed complete sidebar/manual scope')
    if len(errata['records'])!=6 or any(r['appliesToCandidatePublicationVerified'] or r['acceptedForRuntime'] for r in errata['records']):raise ValueError('Errata applicability remains unverified for candidates')
    wizard='scope:wizard:class-features:feature.spellcasting'
    if wizard not in by_id:raise ValueError('Missing existing Wizard parent')
    links={wizard:{'candidateId':wizard,'sourceClaims':by_id[wizard]['candidateReference']['sourceIds'],'additionalEvidenceKeys':['spellcastingInventory','spellbookSidebar'],
            'completeCandidateTextAccepted':False,'wholeFeatureAccepted':False,'runtimeAccepted':False}}
    unattached=[]
    for r in errata['records']:
        target=r['correspondingCandidateId']
        item={'correctionKey':r['key'],'historicalBookSourceId':r['historicalBookSourceId'],'appliesToCandidatePublicationVerified':False,'scopeKind':r['scopeKind']}
        if target is None:unattached.append(item);continue
        if target not in by_id or by_id[target]['classSlug']!='artificer':raise ValueError('Wrong/unknown class for errata candidate')
        row=links.setdefault(target,{'candidateId':target,'sourceClaims':by_id[target]['candidateReference']['sourceIds'],'additionalEvidenceKeys':['artificerErrata'],
            'completeCandidateTextAccepted':False,'wholeFeatureAccepted':False,'runtimeAccepted':False,'sourceSpecificCorrections':[]})
        row['sourceSpecificCorrections'].append(item)
    old_graph=inventory['openReferenceGraph'];closed='remaining complete Your Spellbook sidebar/version comparison'
    if old_graph.count(closed)!=1:raise ValueError('Changed explicit reference graph; no heuristic removal')
    remaining=[r for r in old_graph if r!=closed]
    claim_ledger=[{k:r['candidateReference'][k] for k in ['id','sourceIds','sourceBasis']} for r in candidates]
    return {'schemaVersion':1,'status':'current-class-evidence-overlay-not-full-rules-or-original-source-acceptance','accepted':False,'complete':False,'approvedDenominator':None,
        'summary':{'preservedCandidateRecords':130,'preservedArtificerHeadingObservations':23,'supplementedCandidateReferences':len(links),
            'selectedArtificerCorrections':6,'unattachedCorrectionsRetained':len(unattached),'canonicalUnitsAccepted':0},
        'baseCandidateMap':EVIDENCE['candidateMap'],'preservedCandidateIdSequence':ids,
        'preservedClaimLedgerSha256':sha(json.dumps(claim_ledger,ensure_ascii=False,separators=(',',':')).encode()),
        'supplementalCandidateLinks':list(links.values()),'unattachedCorrections':unattached,
        'wizardReferenceGraph':{'originalGraphPreserved':old_graph,'completedSelectedReference':closed,'completionEvidenceKey':'spellbookSidebar',
            'remainingGraph':remaining,'literalWholeSourceEqualityClaimed':False,'wholeFeatureRulesAccepted':False},
        'nextWorkItem':{'role':'content','phase':'wizard-candidate-clause-concordance','candidateId':wizard,
            'action':'Compare the secondary Wizard Spellcasting body clause by clause against checked corresponding English scopes, keeping snapshot and source claims separate.',
            'requiredInputs':['catalog/dndsu-reviewed-class-proposals.json','catalog/wizard-artificer-source-scopes-2014.json'],
            'sourceSnapshotRequirement':'Use the retained candidate snapshot if available; a new public capture keeps its own SHA and must not inherit the old snapshot identity.',
            'parallelRemainingCriterion':'Exact TCE/Artificer full-text/version applicability is still unverified; do not substitute Eberron/Wizard/UA/2024.',
            'doNotRepeat':'130/23source map, six errata scopes,9/21inventory,three short comparisons,415word sidebar and prior Arcane/Ritual/preparation/learning/ASI/copying scopes.'},
        'limits':['New links overlay the original map; no candidate ID, source array, heading parent or unknown record is removed or canonized.',
            'Six Artificer corrections retain their own119/117 provenance and candidate applicability holds, including one unattached choice correction.',
            'Completed English sidebar comparison closes only that named reference task; original graph remains and whole-class/source rights stay open.',
            'No secondary translation/PHB-TCE source equivalence, feature automation, profile edit, publication rights or owner milestone accepted.']}


def build(root=Path('.')):
    data=load_reviewed(root);d=combine(data);d['reviewedEvidence']=EVIDENCE;d['inputSha256']={s['path']:s['sha256'] for s in EVIDENCE.values()}
    d['generator']={'path':'scripts/review-current-class-evidence-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))};return d

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path('.'));p.add_argument('--output');a=p.parse_args();d=build(a.root)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps(d['summary']))
