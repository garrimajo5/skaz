import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('general',ROOT/'scripts/audit-general-casting-clauses-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)


def report():return json.loads((ROOT/'catalog/general-casting-clauses-2014.json').read_text(encoding='utf-8'))


def record(key):return next(r for r in report()['records'] if r['key']==key)


class GeneralCastingClausesTest(unittest.TestCase):
    def test_exact_thirteen_scopes_all_thirty_two_paragraphs_and_original_body_witnesses(self):
        d=report();base=json.loads((ROOT/'catalog/spellcasting-reference-scopes-2014.json').read_text(encoding='utf-8'))
        self.assertEqual([r['key'] for r in d['records']],[s[0] for s in M.SPECS]);self.assertEqual(sum(len(r['paragraphSha256']) for r in d['records']),32)
        for row in d['records']:
            self.assertEqual(row['bodyTextSha256'],base['inventory']['blocks'][row['headingOrdinal']]['bodyTextSha256']);self.assertTrue(row['completeSelectedSecondarySubsectionReviewed']);self.assertFalse(row['fullTranslationAccepted'] or row['acceptedForRuntime'])

    def test_named_span_does_not_confuse_casting_time_with_longer_casting_times(self):
        text='Longer Casting Times earlier Casting Time selected body Bonus Action next'
        self.assertEqual(M.selected_span({101:text},[101],'Casting Time','Bonus Action'),'selected body')

    def test_somatic_cross_page_continuation_is_required_and_retained(self):
        pages={101:'before Somatic (S) starts',102:'continues Material (M) next'}
        self.assertEqual(M.selected_span(pages,[101,102],'Somatic (S)','Material (M)'),'starts continues')
        with self.assertRaisesRegex(ValueError,'continuation'):M.selected_span({101:pages[101]},[101,102],'Somatic (S)','Material (M)')
        self.assertEqual(record('somatic')['primary']['pdfPages'],[101,102])

    def test_missing_or_duplicate_start_and_missing_stop_are_errors(self):
        for text in ['Start no stop','Start first Start second Stop next','Stop wrong order Start body']:
            with self.assertRaises(ValueError):M.selected_span({1:text},[1],'Start','Stop')

    def test_first_named_stop_after_start_does_not_include_later_duration_reference(self):
        text='Material (M) selected Duration next Concentration mentions Duration later'
        self.assertEqual(M.selected_span({1:text},[1],'Material (M)','Duration'),'selected')

    def test_rendered_inspection_and_exact_public_sources_are_required(self):
        with self.assertRaisesRegex(ValueError,'Inspect'):M.audit(b'fake',b'fake',b'fake')
        with self.assertRaisesRegex(ValueError,'secondary'):M.secondary_units(b'changed',{})
        with self.assertRaisesRegex(ValueError,'PDF'):M.primary_pages(b'changed',M.SRD_SHA,[101])

    def test_changed_manually_assessed_input_cannot_inherit_old_decision(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for path in M.INPUT_PINS:
                p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/path).read_bytes())
            self.assertEqual(len(M.load_inputs(root)),4);p=root/next(iter(M.INPUT_PINS));p.write_bytes(p.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'reassessment'):M.load_inputs(root)

    def test_errata_scaling_does_not_inherit_srd_cantrip_origin(self):
        r=record('cantrips');self.assertEqual(r['secondaryCoreParagraphIndexes'],[0]);self.assertEqual(r['secondaryAdditionalParagraphIndexes'],[1]);self.assertEqual(r['additionalPrimaryEvidence']['pdfPage'],3);self.assertEqual(r['additionalPrimaryEvidence']['source'],'phb2014-errata-v3.0-2021');self.assertFalse(r['ordinaryFacts']['scalingClauseEstablishedBySrdCantripSubsectionAlone']);self.assertTrue(r['ordinaryFacts']['scalingWhenSpellSpecifiesHigherLevelsUsesCharacterLevel']);self.assertFalse(r['ordinaryFacts']['allCantripsScaleAutomatically'])

    def test_errata_repairs_only_the_one_inspected_word_wrap(self):
        text='Spells Known and Prepared (p. 164). If a cantrip increases, it is based on your character level, not your level in a particu\ufffelar class. Feats next'
        d=M.errata_cantrip(text);self.assertEqual(d['visuallyCheckedBoundedRepair']['count'],1)
        self.assertNotEqual(d['rawSelectedTextSha256'],d['normalizedSelectedTextSha256'])
        with self.assertRaisesRegex(ValueError,'no generic'):M.errata_cantrip(text.replace('particu\ufffelar','particular'))

    def test_material_omitted_hold_focus_clause_is_explicit_not_source_rewrite(self):
        r=record('material');self.assertEqual(r['literalDifference']['kind'],'explicit-qualifier-omission');self.assertEqual(r['literalDifference']['secondaryParagraphIndex'],2);self.assertFalse(r['literalDifference']['sourceSilentlyRewritten']);self.assertTrue(r['ordinaryFacts']['handMustAccessMaterialOrHoldFocus']);self.assertFalse(r['ordinaryFacts']['focusErasesCostOrConsumption'])

    def test_slotless_and_slot_upcast_paths_are_not_generic_resource_rules(self):
        slots=record('spell-slots')['ordinaryFacts'];up=record('upcasting')['ordinaryFacts'];self.assertTrue(slots['warlockTableExceptionRetained'] and slots['slotlessSpecificFeaturesRemainSeparate']);self.assertFalse(slots['allItemChargesOrUnknownCountersRestoredByThisRule']);self.assertFalse(up['everySpellAutomaticallyGainsDamageDice'] or up['higherMulticlassSlotsExpandClassLearning'])

    def test_ritual_preparation_exception_is_class_specific(self):
        f=record('rituals')['ordinaryFacts'];self.assertTrue(f['ritualTagRequired'] and f['grantingFeatureRequired']);self.assertEqual(f['additionalMinutes'],10);self.assertFalse(f['ordinarySlotExpended'] or f['ordinaryUpcastAllowed'] or f['wizardBookExceptionTransferredToArtificer'])

    def test_bonus_rule_is_same_turn_not_round_or_global_one_leveled_cap(self):
        f=record('bonus-action')['ordinaryFacts'];self.assertTrue(f['sameTurnOtherSpellsLimitedToCantripWithOneActionCastingTime']);self.assertFalse(f['restrictionIsWholeRound'] or f['genericOneLeveledSpellPerTurnRuleEstablished']);self.assertTrue(record('reactions')['ordinaryFacts']['spellDescriptionDefinesTrigger'])

    def test_long_cast_failure_is_not_generic_refund_or_ready_procedure(self):
        f=record('longer-casting')['ordinaryFacts'];self.assertTrue(f['actionEachTurnRequired'] and f['concentrationWhileCastingRequired'] and f['retryMustStartOver']);self.assertFalse(f['failedLongCastExpendsSlot'] or f['allItemChargesOrOtherResourcesRefunded'] or f['readyActionAlreadyCastSpellProcedureInferred'])

    def test_range_and_hand_requirements_keep_limits_and_manual_path(self):
        f=record('range')['ordinaryFacts'];self.assertFalse(f['gridCellRequiredByPrimary']);self.assertTrue(f['spellDescriptionCanLimitContinuingEffectRange']);self.assertFalse(record('somatic')['ordinaryFacts']['holdingFocusAutomaticallyWaivesSomaticOnlyHandRequirement']);self.assertTrue(all(r['ordinaryFacts']['manualDeviationAllowedWithWarning'] for r in report()['records']))

    def test_remaining_mixed_scopes_and_original_context_are_not_accepted(self):
        d=report();self.assertEqual(len(d['remainingHeadingOrdinals']),33);self.assertTrue(set([7,8,9,17,18,31,32,33,40,46]).issubset(d['remainingHeadingOrdinals']));self.assertFalse(d['preservedBoundaryHolds']['artificerFullRulesInferred'] or d['preservedBoundaryHolds']['originalSourceArraysRewritten'] or d['preservedBoundaryHolds']['fullPagePhbClaimAccepted']);self.assertEqual(d['nextWorkItem']['phase'],'general-duration-concentration-targets')

    def test_current_input_and_code_hashes(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for spec in [d['generator'],d['upstreamParser']]:self.assertEqual(M.sha((ROOT/spec['path']).read_bytes().replace(b'\r\n',b'\n')),spec['sha256'])
        self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator'])


if __name__=='__main__':unittest.main()
