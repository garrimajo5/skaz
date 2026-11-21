"""Current class-source evidence overlay: preserve old observations and advance only checked scopes."""
import argparse
import hashlib
import json
from pathlib import Path
EVIDENCE={'candidateMap': {'path': 'catalog/wizard-artificer-source-scopes-2014.json', 'sha256': '35cd01d9e040f995d980a655ca900492ffd8d211a88ed040d2cd5323f4bc9bd5', 'pr': 227, 'head': '01876659e4be009e645095c677cebbdcf52d278d', 'review': 'https://github.com/garrimajo5/skaz/pull/227#issuecomment-7063197013', 'scope': '130candidate/23heading preservation and bounded correspondence only'}, 'artificerErrata': {'path': 'catalog/artificer-errata-scopes-2014.json', 'sha256': 'fe1bdeaeee905651e8ddd60199d315ad090bde9aa23746d516f11da673f2c026', 'pr': 228, 'head': '005ae93bffb442208867fef8ad9926cd16c685d0', 'review': 'https://github.com/garrimajo5/skaz/pull/228#issuecomment-7063307174', 'scope': 'six source-specific selected clauses/PDFpage1 only'}, 'spellcastingInventory': {'path': 'catalog/wizard-spellcasting-scope-2014.json', 'sha256': 'd55f3e9b999d31abfc9b98ab76a3331c9e3c5fd205390b1f18bb646ebd0baddb', 'pr': 229, 'head': '6687601a979918f3cb514328a682973f8b786bc8', 'review': 'https://github.com/garrimajo5/skaz/pull/229#issuecomment-7063425731', 'scope': '9block21paragraph digital inventory and3selected comparisons only'}, 'spellbookSidebar': {'path': 'catalog/wizard-spellbook-sidebar-2014.json', 'sha256': '029e5bbb68162230d73159188cb1fda0af9f2c6966beac9b414ca61bf15b1917', 'pr': 230, 'head': '99f7da0987e91e6a0bceef15b8ea5cce185072fa', 'review': 'https://github.com/garrimajo5/skaz/pull/230#issuecomment-7063541170', 'scope': 'complete7paragraph415word sidebar with preserved literal carrier difference'}, 'candidateConcordance': {'path': 'catalog/wizard-candidate-clause-concordance-2014.json', 'sha256': 'a056d5d38ed7574cd05b3aaa292c409929994804f4bc70ef07dbe1cdd6461013', 'pr': 232, 'head': 'f999fed4f8ae19fb23d2899cfdb0146dd17b9dbd', 'review': 'https://github.com/garrimajo5/skaz/pull/232#issuecomment-7063957699', 'scope': '8selected secondary sections/19paragraphs/19manual clause assessments; DMG insertion and two omissions retained'}, 'wizardTable': {'path': 'catalog/wizard-table-concordance-2014.json', 'sha256': 'e0eb3230426253d2239dcd5cd2fa0a350d33358acacd38f6fa6c933f5b913872', 'pr': 233, 'head': '198f8d795a9da4882a3ac6541efc53e303a22da4', 'review': 'https://github.com/garrimajo5/skaz/pull/233#issuecomment-7064114661', 'scope': '20Wizard rows/220numeric cells,4literal name deltas,2optional TCE cells and localized intro navigation'}, 'generalReference': {'path': 'catalog/spellcasting-reference-scopes-2014.json', 'sha256': '0e20ecfc18534dcc94752854e8ff018d8ad109eeabe9290036d04a6c57d925d3', 'pr': 234, 'head': '80e16bcac195f52761a47de2a83f868e7926b400', 'review': 'https://github.com/garrimajo5/skaz/pull/234#issuecomment-7064250485', 'scope': '48heading inventory and two complete selected KnownPrepared/Armor scopes(4secondary paragraphs),not full mixed page'}, 'castingClauses': {'path': 'catalog/general-casting-clauses-2014.json', 'sha256': 'aa6815ec47e2cb963c1c30e5fc50082bb20a6fc47861bc6c6f502dfcd59c97cf', 'pr': 236, 'head': '344a66a37aee1f3151384cc230922ec606c1d848', 'review': 'https://github.com/garrimajo5/skaz/pull/236#issuecomment-7064939796', 'scope': '13selected general casting scopes/32secondary paragraphs,cantrip errata/material qualifier caveat retained'}, 'concentrationTargets': {'path': 'catalog/general-concentration-targets-2014.json', 'sha256': '0913dd9d2f06d30f69bd60d32451d89117170f1a6a354d82029bf64d87c5330b', 'pr': 237, 'head': '5cab5effb2f28340abd868ce483efdd62c7b1034', 'review': 'https://github.com/garrimajo5/skaz/pull/237#issuecomment-7065116486', 'scope': '6selected full scopes/13paragraphs/3list items,Basic rounding and referent caveat retained'}, 'areasEffects': {'path': 'catalog/general-areas-effects-2014.json', 'sha256': '64aef4dd8001785004414ed3cee11cb7d1d0a7084563294d1a7db2cee5139896', 'pr': 238, 'head': '3968c43ed70dc850cf68f59fc3da2604aa959156', 'review': 'https://github.com/garrimajo5/skaz/pull/238#issuecomment-7065234416', 'scope': '9ordinary-prose scopes/19paragraphs;7diagrams/6captions unverified;equal-potency errata separate'}, 'introductionsSchools': {'path': 'catalog/general-introductions-schools-2014.json', 'sha256': '8618b63a316e83bdc40eebc5124f1826244bad5a32e341f74c6998ddf4a01dc1', 'pr': 239, 'head': 'cb3455094a9ab8b26d1a25ed5be14c18f8ccf9ff', 'review': 'https://github.com/garrimajo5/skaz/pull/239#issuecomment-7065896663', 'scope': '4selected full scopes/18paragraphs/eight explicit school mappings;article boundary excludes UI'}, 'readyBonus': {'path': 'catalog/ready-bonus-context-2014.json', 'sha256': 'd921d0707996439739a7e678fc6da9406c108424b2669db0446d05d5d9dbae5a', 'pr': 240, 'head': 'e06c5b13cc479e1bc80f802e73df51cae6042d22', 'review': 'https://github.com/garrimajo5/skaz/pull/240#issuecomment-7066100829', 'scope': 'Ready17 spell excerpt/bonus18 condensation with full combat/reaction/errata context'}}


def sha(raw):return hashlib.sha256(raw).hexdigest()

def load_reviewed(root):
    data={}
    for key,spec in EVIDENCE.items():
        raw=(root/spec['path']).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=spec['sha256']:raise ValueError('Changed class evidence cannot inherit exact independent review')
        data[key]=json.loads(raw)
    return data

CONCORDANCE = 'catalog/wizard-candidate-clause-concordance-2014.json'


def load_concordance(root):
    raw=(root/CONCORDANCE).read_bytes().replace(b'\r\n',b'\n')
    d=json.loads(raw)
    if d['generator']['sha256']!=sha((root/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):
        raise ValueError('Concordance generator changed; rebuild and review this co-versioned evidence')
    return d


TABLE='catalog/wizard-table-concordance-2014.json'


def load_table(root):
    d=json.loads((root/TABLE).read_text(encoding='utf-8'))
    if d['generator']['sha256']!=sha((root/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed table generator; rebuild co-versioned evidence')
    return d


def combine(data,concordance,table):
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
    if concordance.get('accepted') or concordance.get('complete') or concordance.get('acceptedForRuntime') or concordance['summary']['canonicalUnitsAccepted'] or concordance['summary']['clauseAssessments']!=19 or concordance['candidateReference']['id']!=wizard:
        raise ValueError('Changed bounded concordance scope')
    if table.get('accepted') or table.get('complete') or table.get('acceptedForRuntime') or table['summary']['canonicalUnitsAccepted'] or table['summary']['numericCellsComparedExcludingLevel']!=220 or table['summary']['optionalTceObservationsPreserved']!=2 or table['introduction']['candidateReferencePreserved']['id']!=wizard:
        raise ValueError('Changed bounded table/intro scope')
    links[wizard]['additionalEvidenceKeys'].extend(['candidateConcordance','coVersionedTable'])
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
        'coVersionedConcordance':{'path':CONCORDANCE,'scope':'8retained secondary sections/19paragraphs/19manual assessments; independently reviewed in PR232, not inherited from prior four PRs','evidenceKey':'candidateConcordance',
            'wholeCandidateAccepted':False,'priorIndependentReviewInherited':False},
        'coVersionedTable':{'path':TABLE,'evidenceKey':'wizardTable','scope':'20Wizard rows/220numeric cells with4literal feature-name deltas,2optionalTCE cells and localized intro navigation; independently reviewed in PR233','priorIndependentReviewInherited':False,'wholeFeatureAccepted':False},
        'nextWorkItem':{**table['nextWorkItem'],'candidateId':wizard,
            'requiredInputs':[TABLE,'catalog/wizard-artificer-source-scopes-2014.json'],
            'sourceSnapshotRequirement':'Retained source keeps its own SHA; preserve historical/fresh identities.',
            'parallelRemainingCriterion':'Exact TCE/Artificer full-text/version applicability remains unverified.',
            'doNotRepeat':'130/23mapping,six errata,9/21inventory,415word sidebar and8section/19paragraph/19assessment concordance; 20Wizard rows/220numeric cells,4literal-name deltas,2optionalTCE cells and intro19; preserve DMG insert and both learning qualifier findings.'},
        'limits':['New links overlay the original map; no candidate ID, source array, heading parent or unknown record is removed or canonized.',
            'Six Artificer corrections retain their own119/117 provenance and candidate applicability holds, including one unattached choice correction.',
            'Completed English sidebar comparison closes only that named reference task; original graph remains and whole-class/source rights stay open.',
            'No secondary translation/PHB-TCE source equivalence, feature automation, profile edit, publication rights or owner milestone accepted.']}


GENERAL='catalog/spellcasting-reference-scopes-2014.json'


def add_general_context(d,general):
    if general.get('accepted') or general.get('complete') or general.get('acceptedForRuntime') or general['summary']['canonicalUnitsAccepted'] or general['summary']['headingsInventoried']!=48 or general['summary']['completeSelectedSubsectionComparisons']!=2 or general['summary']['selectedSecondaryParagraphs']!=4 or general['sourceBoundaryObservations']['wholePageSourceInheritanceAllowed']:
        raise ValueError('Changed selected general-reference scope')
    d['coVersionedGeneralReference']={'path':GENERAL,'scope':'48heading inventory only; two complete selected subsections/4secondary paragraphs, not full mixed page','priorIndependentReviewInherited':False,'fullReferenceRulesAccepted':False}
    d['nextWorkItem'].update(general['nextWorkItem'])
    d['nextWorkItem']['requiredInputs']=[GENERAL,TABLE]
    d['nextWorkItem']['doNotRepeat']+=' General Spellcasting48heading inventory and two KnownPrepared/Armor complete selected subsections/4secondary paragraphs.'
    return d


CASTING='catalog/general-casting-clauses-2014.json'


def add_casting_context(d,casting):
    if casting.get('accepted') or casting.get('complete') or casting.get('acceptedForRuntime') or casting['summary']['canonicalUnitsAccepted'] or casting['summary']['newSelectedSubsections']!=13 or casting['summary']['newSecondaryParagraphs']!=32 or casting['preservedBoundaryHolds']['fullPagePhbClaimAccepted']:
        raise ValueError('Changed selected casting-clause scope')
    d['coVersionedCastingClauses']={'path':CASTING,'scope':'13selected complete scopes/32secondary paragraphs with separate cantrip errata and retained material qualifier omission','priorIndependentReviewInherited':False,'fullGeneralChapterAccepted':False}
    d['nextWorkItem'].update(casting['nextWorkItem']);d['nextWorkItem']['requiredInputs']=[CASTING,GENERAL]
    d['nextWorkItem']['doNotRepeat']+='13general casting scopes/32secondary paragraphs,including cantrip errata and material qualifier finding.'
    return d


CONCENTRATION='catalog/general-concentration-targets-2014.json'


def add_concentration_context(d,selected):
    if selected.get('accepted') or selected.get('complete') or selected.get('acceptedForRuntime') or selected['summary']['canonicalUnitsAccepted'] or selected['summary']['newSelectedSubsections']!=6 or selected['summary']['newSecondaryParagraphs']!=13 or selected['summary']['newSecondaryListItems']!=3 or selected['preservedHolds']['sourceArraysRewritten']:
        raise ValueError('Changed duration/concentration/target selected scope')
    d['coVersionedConcentrationTargets']={'path':CONCENTRATION,'scope':'6complete selected scopes/13paragraphs/3list items; Basic rounding and target referent caveat separate','priorIndependentReviewInherited':False,'fullGeneralChapterAccepted':False}
    d['nextWorkItem'].update(selected['nextWorkItem']);d['nextWorkItem']['requiredInputs']=[CONCENTRATION,CASTING,GENERAL]
    d['nextWorkItem']['doNotRepeat']+='6duration/concentration/target scopes/13paragraphs/3list items; Basic rounding and target referent caveat.'
    return d


AREAS='catalog/general-areas-effects-2014.json'


def add_areas_context(d,selected):
    s=selected['summary']
    if selected.get('accepted') or selected.get('complete') or selected.get('acceptedForRuntime') or s['canonicalUnitsAccepted'] or s['selectedOrdinaryProseScopes']!=9 or s['selectedOrdinaryProseParagraphs']!=19 or s['diagramReferencesPreservedNotAccepted']!=7 or s['captionsPreservedNotAccepted']!=6 or selected['preservedHolds']['diagramSourceOrGeometryAccepted']:
        raise ValueError('Changed ordinary-prose versus diagram scope')
    d['coVersionedAreasEffects']={'path':AREAS,'scope':'9complete ordinary-prose scopes/19paragraphs;7diagrams/6captions retained unverified;equal-potency errata separate','priorIndependentReviewInherited':False,'fullGeneralChapterAccepted':False}
    d['nextWorkItem'].update(selected['nextWorkItem']);d['nextWorkItem']['requiredInputs']=[AREAS,CONCENTRATION,GENERAL]
    d['nextWorkItem']['doNotRepeat']+='9ordinary area/save/attack/effect prose scopes/19paragraphs; diagrams/captions and equal-potency errata remain distinct.'
    return d


INTRODUCTIONS='catalog/general-introductions-schools-2014.json'


def add_introduction_context(d,selected):
    s=selected['summary']
    if selected.get('accepted') or selected.get('complete') or selected.get('acceptedForRuntime') or s['canonicalUnitsAccepted'] or s['selectedScopes']!=4 or s['secondaryParagraphs']!=18 or s['schoolCategoriesExplicitlyMapped']!=8 or selected['ordinarySelectedFacts']['schoolMembershipAutomaticallyGrantsClassSpellAccess']:
        raise ValueError('Changed introduction/school selected scope')
    d['coVersionedIntroductionsSchools']={'path':INTRODUCTIONS,'scope':'4complete selected text scopes/18paragraphs/eight explicitly mapped categories; narrative not grants','priorIndependentReviewInherited':False,'fullGeneralChapterAccepted':False}
    d['nextWorkItem'].update(selected['nextWorkItem']);d['nextWorkItem']['requiredInputs']=[INTRODUCTIONS,GENERAL]
    d['nextWorkItem']['doNotRepeat']+='4common introduction/school scopes/18paragraphs/eight explicitly mapped categories.'
    return d


READY='catalog/ready-bonus-context-2014.json'


def add_ready_context(d,selected):
    s=selected['summary']
    if selected.get('accepted') or selected.get('complete') or selected.get('acceptedForRuntime') or s['canonicalUnitsAccepted'] or s['secondaryObservationsCompared']!=2 or s['secondaryParagraphs']!=3 or s['newBonusAbilitiesCreated'] or selected['readyRelationship']['fullReadyActionAccepted'] or selected['bonusRelationship']['secondRuleOrCapabilityCreated']:
        raise ValueError('Changed partial Ready/bonus context scope')
    d['coVersionedReadyBonus']={'path':READY,'scope':'2secondary observations/3paragraphs;full Ready93-94 context,not whole secondary action or second bonus rule','priorIndependentReviewInherited':False,'fullGeneralChapterAccepted':False}
    d['nextWorkItem'].update(selected['nextWorkItem']);d['nextWorkItem']['requiredInputs']=[READY,INTRODUCTIONS,GENERAL]
    d['nextWorkItem']['doNotRepeat']+='Ready17 spell excerpt/bonus18 condensed clause with full combat/errata/reaction context.'
    return d


NARRATIVE='catalog/weave-narrative-2014.json'
SCOPE_COVERAGE='catalog/spellcasting-scope-coverage-2014.json'


def add_narrative_coverage_context(d,narrative,coverage):
    n=narrative['summary'];s=coverage['summary']
    if any(x.get('accepted') or x.get('complete') or x.get('acceptedForRuntime') or x.get('approvedDenominator') is not None for x in [narrative,coverage]) or n['selectedNarrativeProseScopes']!=2 or n['selectedSecondaryParagraphs']!=7 or s['originalBodyObservations']!=49 or s['withSelectedBodyWitness']!=38 or s['awaitingOwnPrimaryBodyComparison']!=11 or s['unverifiedDiagramsRetained']!=7 or s['unverifiedCaptionsRetained']!=6 or s['canonicalUnitsAccepted']:
        raise ValueError('Changed bounded narrative/coverage partition')
    d['coVersionedNarrativeCoverage']={'narrativePath':NARRATIVE,'coveragePath':SCOPE_COVERAGE,'scope':'2narrative scopes/7paragraphs and49source-body map;38selected witnesses/11pending plus5media holds,not rule denominator','priorIndependentReviewInherited':False,'fullGeneralChapterAccepted':False}
    d['nextWorkItem'].update(coverage['nextWorkItem']);d['nextWorkItem']['requiredInputs']=[SCOPE_COVERAGE,NARRATIVE,INTRODUCTIONS]
    d['nextWorkItem']['doNotRepeat']+='Prelude/Weave7paragraphs,TOC/carrier witnesses and49source-body coverage map;pending variants/media are separate.'
    return d


SPELL_LIST='catalog/wizard-spell-list-reference-2014.json'
CORE_CHOICES='catalog/wizard-core-choices-2014.json'
ENTRY='catalog/wizard-entry-boundaries-2014.json'
EQUIPMENT='catalog/wizard-equipment-2014.json'


def add_wizard_list_and_choice_context(d,listing,choices):
 for selected in [listing,choices]:
  if selected.get('accepted') or selected.get('complete') or selected.get('acceptedForRuntime') or selected.get('runtimeChanged') or selected.get('approvedDenominator') is not None or selected['summary']['canonicalUnitsAccepted']:raise ValueError('Selected Wizard evidence cannot promote full class/runtime/denominator')
 s=listing['summary'];c=choices['summary']
 if s['primaryEntries']!=204 or s['secondaryObservations']!=333 or s['nameLevelCorrespondences']!=198 or s['primaryNamesNotObserved']!=6 or s['primaryNamesAccountedForWithTargetedControls']!=204 or s['wizardTceMarked']!=4 or s['completeSecondaryClassListAccepted'] or listing['secondaryScope']['completeSecondaryClassListAccepted'] or len(listing['targetedControlEvidence']['targetedPaginationAbsences'])!=6:raise ValueError('Changed bounded list/pagination/control scope')
 if any(r['wholeSpellRulesCompared'] or r['canonicalCatalogId'] is not None for r in listing['secondaryScope']['entries']):raise ValueError('Name witness cannot accept full spell rules/canonical ID')
 if c['selectedCandidateScopes']!=2 or c['secondaryParagraphsIncludingLevelLabels']!=6 or c['secondaryRuleProseParagraphs']!=4 or c['reusedAsiPrimaryScopes']!=1 or choices['manualAssessments'][1]['capIsUniversalForEveryItemBuffOrManualProfile'] or choices['manualAssessments'][1]['importedAsiAppliedAgain'] or not choices['implementationBoundaries']['ordinaryGameDeviationsWarnAndAllowManual']:raise ValueError('Changed class-local/manual core-choice boundary')
 d['coVersionedWizardListChoices']={'listPath':SPELL_LIST,'choicesPath':CORE_CHOICES,'scope':'204SRD names/circles,333paginated secondary observations+6targeted absences,17name correspondences and4Wizard-TCE labels;2complete selected secondary core scopes/6paragraphs with separate optional-feat context','priorIndependentReviewInherited':False,'fullSecondaryClassListAccepted':False,'fullWizardRulesAccepted':False,'originalFiveSupplementalLinksPreserved':True}
 d['nextWorkItem'].update({'role':'content','phase':'wizard-entry-and-multiclass-source-boundaries','action':'Compare complete selected Wizard entry HP/proficiencies/equipment against retained primary; keep first-class versus multiclass benefits and class/source/version boundaries explicit.','requiredInputs':[SPELL_LIST,CORE_CHOICES,'catalog/wizard-artificer-source-scopes-2014.json']})
 d['nextWorkItem']['doNotRepeat']+='204SRD list names/circles with198paginated+6targeted name witnesses,17bounded eponym correspondences,4Wizard TCE labels and Augury toggle; Wizard30/32 core choices with optional feat context,not TCE31.'
 d['remainingSpecificCriteria']={'fullSecondaryWizardList':'not established by pagination; all204 selected SRD names are accounted for, not a full WotC catalog','generalPrimaryBodyComparisons':11,'generalMediaHeadings':5,'cantripFormulas31':'exact TCE primary/version remains required','wholeWizardClass':'not accepted'}
 return d


def add_wizard_entry_context(d,entry):
 s=entry['summary'];f=entry['ordinarySelectedFacts']
 if entry.get('accepted') or entry.get('complete') or entry.get('acceptedForRuntime') or entry.get('runtimeChanged') or entry.get('approvedDenominator') is not None or s['canonicalUnitsAccepted'] or s['completeSecondaryEntryScopes']!=2 or s['completeEntryParagraphs']!=8 or s['selectedMulticlassParagraphs']!=1 or f['wizardStartingSavingThrowsAutomaticallyGrantedOnMulticlass'] or f['wizardClassFirstLevelAutomaticallyGetsCharacterFirstLevel6Hp'] or f['currentHpManufacturedFromMaximum'] or f['minimum1ExplicitInSrdWizardClassParagraph']:raise ValueError('Changed first-class/multiclass or carrier-specific HP scope')
 d['coVersionedWizardEntry']={'path':ENTRY,'scope':'2complete secondary HP/proficiency scopes/8paragraphs and only multiclass13paragraph2;SRD52/57 with separate Basic12minimum context','priorIndependentReviewInherited':False,'fullWizardRulesAccepted':False,'wholeMulticlassHeadingAccepted':False}
 d['nextWorkItem'].update({'phase':'wizard-starting-equipment-and-wealth','action':'Compare complete Wizard Equipment18 intro/four choices/alternate4d4x10wealth against exact primary equipment and starting-wealth scopes; do not regrant starting lists on multiclass. Keep full TCE and remaining class criteria separate.','requiredInputs':[ENTRY,CORE_CHOICES,SPELL_LIST]})
 d['nextWorkItem']['doNotRepeat']+='Wizard16/17HP/proficiencies8paragraphs and only13paragraph2; separate SRD52/57 and Basic12minimum1 carrier context.'
 return d


def add_wizard_equipment_context(d,equipment):
 s=equipment['summary'];f=equipment['ordinarySelectedFacts']
 if equipment.get('accepted') or equipment.get('complete') or equipment.get('acceptedForRuntime') or equipment.get('runtimeChanged') or equipment.get('approvedDenominator') is not None or s['canonicalUnitsAccepted'] or s['secondaryProseParagraphs']!=2 or s['secondaryListItems']!=4 or not f['alternateWealth']['replacesBothClassAndBackgroundStartingEquipment'] or f['standardAndWealthOptionsSimultaneouslyGranted'] or f['equipmentRegrantedOnMulticlass']:raise ValueError('Changed starting equipment/alternate-wealth boundary')
 d['coVersionedWizardEquipment']={'path':EQUIPMENT,'scope':'complete selected Equipment18 intro/four items or choices/alternate-wealth paragraph;SRD52 and selected Basic45Wizard4d4x10gp row','priorIndependentReviewInherited':False,'fullWizardRulesAccepted':False,'automaticInventoryGrantsAccepted':False}
 d['nextWorkItem'].update({'phase':'wizard-multiclass-prerequisite-and-slot-context','action':'Compare only remaining Wizard multiclass13 paragraphs0/1/3 with exact primary optional-rule/prerequisite/both-class and Spellcasting slot-versus-known/prepared scopes. Paragraph2 already compared; do not infer full Artificer or automatically grant higher-circle learning.','requiredInputs':[EQUIPMENT,ENTRY,SPELL_LIST]})
 d['nextWorkItem']['doNotRepeat']+='Equipment18two paragraphs/four list items with separate Basic45alternateWizardwealth,not other classes or pack contents.'
 return d


def build(root=Path('.')):
    data=load_reviewed(root);concordance=load_concordance(root);table=load_table(root);d=combine(data,concordance,table);d['reviewedEvidence']=EVIDENCE;d['inputSha256']={s['path']:s['sha256'] for s in EVIDENCE.values()}
    d['inputSha256'][CONCORDANCE]=sha((root/CONCORDANCE).read_bytes().replace(b'\r\n',b'\n'))
    d['inputSha256'][TABLE]=sha((root/TABLE).read_bytes().replace(b'\r\n',b'\n'))
    raw_general=(root/GENERAL).read_bytes().replace(b'\r\n',b'\n');general=json.loads(raw_general)
    if general['generator']['sha256']!=sha((root/general['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed general generator; rebuild co-versioned evidence')
    d=add_general_context(d,general);d['inputSha256'][GENERAL]=sha(raw_general)
    raw_casting=(root/CASTING).read_bytes().replace(b'\r\n',b'\n');casting=json.loads(raw_casting)
    if casting['generator']['sha256']!=sha((root/casting['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed casting generator; rebuild co-versioned evidence')
    d=add_casting_context(d,casting);d['inputSha256'][CASTING]=sha(raw_casting)
    raw_selected=(root/CONCENTRATION).read_bytes().replace(b'\r\n',b'\n');selected=json.loads(raw_selected)
    if selected['generator']['sha256']!=sha((root/selected['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed concentration generator; rebuild')
    d=add_concentration_context(d,selected);d['inputSha256'][CONCENTRATION]=sha(raw_selected)
    raw_areas=(root/AREAS).read_bytes().replace(b'\r\n',b'\n');areas=json.loads(raw_areas)
    if areas['generator']['sha256']!=sha((root/areas['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed areas generator; rebuild')
    d=add_areas_context(d,areas);d['inputSha256'][AREAS]=sha(raw_areas)
    raw_intro=(root/INTRODUCTIONS).read_bytes().replace(b'\r\n',b'\n');intro=json.loads(raw_intro)
    if intro['generator']['sha256']!=sha((root/intro['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed introduction generator; rebuild')
    d=add_introduction_context(d,intro);d['inputSha256'][INTRODUCTIONS]=sha(raw_intro)
    raw_ready=(root/READY).read_bytes().replace(b'\r\n',b'\n');ready=json.loads(raw_ready)
    if ready['generator']['sha256']!=sha((root/ready['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed Ready generator; rebuild')
    d=add_ready_context(d,ready);d['inputSha256'][READY]=sha(raw_ready)
    extra={}
    for path in [NARRATIVE,SCOPE_COVERAGE]:
        raw=(root/path).read_bytes().replace(b'\r\n',b'\n');extra[path]=json.loads(raw)
        if extra[path]['generator']['sha256']!=sha((root/extra[path]['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed narrative/coverage generator; rebuild')
        d['inputSha256'][path]=sha(raw)
    d=add_narrative_coverage_context(d,extra[NARRATIVE],extra[SCOPE_COVERAGE])
    new={}
    for path in [SPELL_LIST,CORE_CHOICES,ENTRY,EQUIPMENT]:
        raw=(root/path).read_bytes().replace(b'\r\n',b'\n');new[path]=json.loads(raw)
        if new[path]['generator']['sha256']!=sha((root/new[path]['generator']['path']).read_bytes().replace(b'\r\n',b'\n')):raise ValueError('Changed Wizard list/core generator; rebuild')
        d['inputSha256'][path]=sha(raw)
    d=add_wizard_list_and_choice_context(d,new[SPELL_LIST],new[CORE_CHOICES]);d=add_wizard_entry_context(d,new[ENTRY]);d=add_wizard_equipment_context(d,new[EQUIPMENT])
    d['generator']={'path':'scripts/review-current-class-evidence-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))};return d

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path('.'));p.add_argument('--output');a=p.parse_args();d=build(a.root)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps(d['summary']))
