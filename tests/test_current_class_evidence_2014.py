import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('current',ROOT/'scripts/review-current-class-evidence-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)

def data():return M.load_reviewed(ROOT)

class CurrentClassEvidenceTest(unittest.TestCase):
    def test_original_candidate_order_source_claim_digest_and_headings_are_preserved(self):
        source=data();before=copy.deepcopy(source);d=M.combine(source,M.load_concordance(ROOT),M.load_table(ROOT));rows=source['candidateMap']['candidateRows']
        self.assertEqual(d['preservedCandidateIdSequence'],[r['candidateReference']['id'] for r in rows]);self.assertEqual(len(d['preservedCandidateIdSequence']),130);self.assertEqual(source,before);self.assertEqual(d['summary']['preservedArtificerHeadingObservations'],23)
        ledger=[{k:r['candidateReference'][k] for k in ['id','sourceIds','sourceBasis']} for r in rows]
        self.assertEqual(d['preservedClaimLedgerSha256'],M.sha(json.dumps(ledger,ensure_ascii=False,separators=(',',':')).encode()))
    def test_five_supplemental_candidates_and_one_unattached_choice_are_not_new_units(self):
        d=M.combine(data(),M.load_concordance(ROOT),M.load_table(ROOT));self.assertEqual(len(d['supplementalCandidateLinks']),5);self.assertEqual(len(d['unattachedCorrections']),1);self.assertEqual(d['unattachedCorrections'][0]['correctionKey'],'repeating-shot-ammunition');self.assertEqual(d['summary']['canonicalUnitsAccepted'],0)
        self.assertTrue(all(not r['completeCandidateTextAccepted'] and not r['wholeFeatureAccepted'] and not r['runtimeAccepted'] for r in d['supplementalCandidateLinks']))
    def test_artificer_keeps_both_source_specific_spellcasting_patches_with_version_holds(self):
        d=M.combine(data(),M.load_concordance(ROOT),M.load_table(ROOT));r=next(r for r in d['supplementalCandidateLinks'] if r['candidateId']=='scope:artificer:class-features:feature.spellcasting')
        self.assertEqual(r['additionalEvidenceKeys'],['artificerErrata']);self.assertEqual([c['historicalBookSourceId'] for c in r['sourceSpecificCorrections']],['119','117']);self.assertTrue(all(not c['appliesToCandidatePublicationVerified'] for c in r['sourceSpecificCorrections']))
    def test_closed_sidebar_reference_does_not_close_other_reference_tasks_or_whole_feature(self):
        source=data();d=M.combine(source,M.load_concordance(ROOT),M.load_table(ROOT));g=d['wizardReferenceGraph'];self.assertEqual(g['originalGraphPreserved'],source['spellcastingInventory']['openReferenceGraph']);self.assertEqual(g['remainingGraph'],['Wizard table','general spellcasting rules','Wizard spell list']);self.assertFalse(g['wholeFeatureRulesAccepted']);self.assertFalse(g['literalWholeSourceEqualityClaimed'])
    def test_changed_original_graph_requires_new_explicit_mapping(self):
        source=data();source['spellcastingInventory']['openReferenceGraph'].append(source['spellcastingInventory']['openReferenceGraph'][-1])
        with self.assertRaises(ValueError):M.combine(source,M.load_concordance(ROOT),M.load_table(ROOT))
    def test_runtime_full_candidate_or_errata_applicability_cannot_be_promoted(self):
        for mutate in [lambda d:d['spellbookSidebar'].update(acceptedForRuntime=True),lambda d:d['candidateMap']['candidateRows'][0].update(completeCandidateRulesAccepted=True),lambda d:d['artificerErrata']['records'][0].update(appliesToCandidatePublicationVerified=True)]:
            source=data();mutate(source)
            with self.assertRaises(ValueError):M.combine(source,M.load_concordance(ROOT),M.load_table(ROOT))
    def test_unknown_or_cross_class_errata_candidate_cannot_be_assigned(self):
        for target in ['scope:wizard:class-features:feature.spellcasting','scope:artificer:class-features:feature.unknown']:
            source=data();source['artificerErrata']['records'][0]['correspondingCandidateId']=target
            with self.assertRaises(ValueError):M.combine(source,M.load_concordance(ROOT),M.load_table(ROOT))
    def test_changed_artifact_cannot_inherit_previous_independent_review(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for spec in M.EVIDENCE.values():
                p=root/spec['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/spec['path']).read_bytes())
            self.assertEqual(set(M.load_reviewed(root)),set(M.EVIDENCE));p=root/M.EVIDENCE['spellbookSidebar']['path'];p.write_bytes(p.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'inherit'):M.load_reviewed(root)
    def test_next_task_is_concordance_with_snapshot_hold_and_no_repeated_work(self):
        d=M.combine(data(),M.load_concordance(ROOT),M.load_table(ROOT));n=d['nextWorkItem'];self.assertEqual(n['role'],'content');self.assertEqual(n['phase'],'wizard-general-spellcasting-reference');self.assertIn('own SHA',n['sourceSnapshotRequirement']);self.assertIn('TCE/Artificer',n['parallelRemainingCriterion']);self.assertIn('415word sidebar',n['doNotRepeat']);self.assertIn('19assessment',n['doNotRepeat'])
    def test_co_versioned_concordance_does_not_inherit_previous_review(self):
        d=M.combine(data(),M.load_concordance(ROOT),M.load_table(ROOT));self.assertFalse(d['coVersionedConcordance']['priorIndependentReviewInherited']);self.assertFalse(d['coVersionedConcordance']['wholeCandidateAccepted'])

    def test_changed_concordance_scope_is_rejected(self):
        for field,value in [('accepted',True),('acceptedForRuntime',True)]:
            c=M.load_concordance(ROOT);c[field]=value
            with self.assertRaises(ValueError):M.combine(data(),c,M.load_table(ROOT))

    def test_table_has_no_inherited_review_and_remains_bounded(self):
        d=M.combine(data(),M.load_concordance(ROOT),M.load_table(ROOT));self.assertFalse(d['coVersionedTable']['priorIndependentReviewInherited']);self.assertFalse(d['coVersionedTable']['wholeFeatureAccepted']);self.assertIn('220numeric',d['nextWorkItem']['doNotRepeat'])

    def test_bad_table_scope_cannot_be_promoted(self):
        for mutation in ['runtime','count']:
            t=M.load_table(ROOT)
            if mutation=='runtime':t['acceptedForRuntime']=True
            else:t['summary']['numericCellsComparedExcludingLevel']=200
            with self.assertRaises(ValueError):M.combine(data(),M.load_concordance(ROOT),t)

    def test_current_general_overlay_advances_only_checked_selected_scopes(self):
        d=M.build(ROOT);self.assertEqual(d['nextWorkItem']['phase'],'wizard-multiclass-prerequisite-and-slot-context');self.assertFalse(d['coVersionedGeneralReference']['fullReferenceRulesAccepted'] or d['coVersionedGeneralReference']['priorIndependentReviewInherited']);self.assertIn('48heading',d['nextWorkItem']['doNotRepeat'])

    def test_mixed_general_reference_cannot_be_accepted_from_phb_header(self):
        g=json.loads((ROOT/M.GENERAL).read_text(encoding='utf-8'));g['sourceBoundaryObservations']['wholePageSourceInheritanceAllowed']=True
        with self.assertRaises(ValueError):M.add_general_context({},g)

    def test_casting_context_advances_without_accepting_full_chapter(self):
        d=M.build(ROOT);self.assertFalse(d['coVersionedCastingClauses']['fullGeneralChapterAccepted'] or d['coVersionedCastingClauses']['priorIndependentReviewInherited']);self.assertIn('32secondary',d['nextWorkItem']['doNotRepeat'])

    def test_bad_casting_scope_or_runtime_promotion_is_rejected(self):
        for mutation in ['runtime','count']:
            c=json.loads((ROOT/M.CASTING).read_text(encoding='utf-8'))
            if mutation=='runtime':c['acceptedForRuntime']=True
            else:c['summary']['newSecondaryParagraphs']=31
            with self.assertRaises(ValueError):M.add_casting_context({},c)

    def test_concentration_overlay_keeps_lists_and_advances_only_selected_work(self):
        d=M.build(ROOT);self.assertFalse(d['coVersionedConcentrationTargets']['fullGeneralChapterAccepted']);self.assertIn('3list',d['nextWorkItem']['doNotRepeat'])

    def test_lost_concentration_list_item_cannot_be_accepted(self):
        c=json.loads((ROOT/M.CONCENTRATION).read_text(encoding='utf-8'));c['summary']['newSecondaryListItems']=2
        with self.assertRaises(ValueError):M.add_concentration_context({},c)

    def test_area_overlay_preserves_prose_media_distinction_and_next_work(self):
        d=M.build(ROOT);self.assertFalse(d['coVersionedAreasEffects']['fullGeneralChapterAccepted']);self.assertIn('diagrams/captions',d['nextWorkItem']['doNotRepeat'])

    def test_unverified_diagrams_cannot_be_promoted_with_prose(self):
        c=json.loads((ROOT/M.AREAS).read_text(encoding='utf-8'));c['preservedHolds']['diagramSourceOrGeometryAccepted']=True
        with self.assertRaises(ValueError):M.add_areas_context({},c)

    def test_intro_overlay_preserves_categories_not_class_grants(self):
        d=M.build(ROOT);self.assertFalse(d['coVersionedIntroductionsSchools']['fullGeneralChapterAccepted']);self.assertIn('eight explicitly mapped',d['nextWorkItem']['doNotRepeat'])

    def test_school_category_cannot_become_automatic_spell_access(self):
        c=json.loads((ROOT/M.INTRODUCTIONS).read_text(encoding='utf-8'));c['ordinarySelectedFacts']['schoolMembershipAutomaticallyGrantsClassSpellAccess']=True
        with self.assertRaises(ValueError):M.add_introduction_context({},c)

    def test_ready_overlay_keeps_partial_action_and_reused_bonus_scope(self):
        d=M.build(ROOT);self.assertFalse(d['coVersionedReadyBonus']['fullGeneralChapterAccepted']);self.assertIn('Ready17 spell excerpt',d['nextWorkItem']['doNotRepeat'])

    def test_bonus_duplicate_cannot_become_new_capability(self):
        c=json.loads((ROOT/M.READY).read_text(encoding='utf-8'));c['bonusRelationship']['secondRuleOrCapabilityCreated']=True
        with self.assertRaises(ValueError):M.add_ready_context({},c)

    def test_narrative_coverage_is_not_full_chapter_or_denominator(self):
        d=M.build(ROOT);self.assertFalse(d['coVersionedNarrativeCoverage']['fullGeneralChapterAccepted']);self.assertIn('49source-body',d['nextWorkItem']['doNotRepeat'])

    def test_pending_partition_or_denominator_cannot_be_promoted(self):
        n=json.loads((ROOT/M.NARRATIVE).read_text(encoding='utf-8'));c=json.loads((ROOT/M.SCOPE_COVERAGE).read_text(encoding='utf-8'));c['approvedDenominator']=49
        with self.assertRaises(ValueError):M.add_narrative_coverage_context({},n,c)
        c['approvedDenominator']=None;c['summary']['awaitingOwnPrimaryBodyComparison']=0
        with self.assertRaises(ValueError):M.add_narrative_coverage_context({},n,c)

    def test_wizard_list_and_core_scopes_remain_bounded(self):
        d=M.build(ROOT);self.assertFalse(d['coVersionedWizardListChoices']['fullSecondaryClassListAccepted'] or d['coVersionedWizardListChoices']['fullWizardRulesAccepted']);self.assertIn('198paginated+6targeted',d['nextWorkItem']['doNotRepeat']);self.assertEqual(d['remainingSpecificCriteria']['generalPrimaryBodyComparisons'],11)

    def test_name_coverage_cannot_accept_secondary_catalog_or_spell_rules(self):
        for mutation in ['whole-list','rule']:
            l=json.loads((ROOT/M.SPELL_LIST).read_text(encoding='utf-8'));c=json.loads((ROOT/M.CORE_CHOICES).read_text(encoding='utf-8'))
            if mutation=='whole-list':l['summary']['completeSecondaryClassListAccepted']=True
            else:l['secondaryScope']['entries'][0]['wholeSpellRulesCompared']=True
            with self.assertRaises(ValueError):M.add_wizard_list_and_choice_context({},l,c)

    def test_class_choice_cannot_reapply_imported_asi(self):
        l=json.loads((ROOT/M.SPELL_LIST).read_text(encoding='utf-8'));c=json.loads((ROOT/M.CORE_CHOICES).read_text(encoding='utf-8'));c['manualAssessments'][1]['importedAsiAppliedAgain']=True
        with self.assertRaises(ValueError):M.add_wizard_list_and_choice_context({},l,c)

    def test_entry_cannot_turn_starting_saves_into_multiclass_grants(self):
        e=json.loads((ROOT/M.ENTRY).read_text(encoding='utf-8'));e['ordinarySelectedFacts']['wizardStartingSavingThrowsAutomaticallyGrantedOnMulticlass']=True
        with self.assertRaises(ValueError):M.add_wizard_entry_context({},e)

    def test_equipment_cannot_grant_both_wealth_and_standard_lists(self):
        e=json.loads((ROOT/M.EQUIPMENT).read_text(encoding='utf-8'));e['ordinarySelectedFacts']['standardAndWealthOptionsSimultaneouslyGranted']=True
        with self.assertRaises(ValueError):M.add_wizard_equipment_context({},e)

    def test_committed_report_and_all_pins_reproduce(self):
        d=json.loads((ROOT/'catalog/wizard-artificer-current-evidence-2014.json').read_text(encoding='utf-8'));self.assertEqual(d,M.build(ROOT))
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))

if __name__=='__main__':unittest.main()
