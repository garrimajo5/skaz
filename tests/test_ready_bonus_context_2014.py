import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('ready',ROOT/'scripts/audit-ready-bonus-context-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)


def report():return json.loads((ROOT/'catalog/ready-bonus-context-2014.json').read_text(encoding='utf-8'))


def ready_fixture():return {93:'Ready Sometimes you act using your reaction before the start of your next turn. Choose a perceivable circumstance; react right after the trigger finishes or ignore the trigger. When you ready a spell, you cast it as normal; casting time of 1 action and',94:'requires concentration, release with your reaction; it dissipates without taking effect, your web spell ends. Search next'}


class ReadyBonusContextTest(unittest.TestCase):
    def test_full_ready_and_spell_excerpt_have_separate_hashes(self):
        d=M.ready_primary(ready_fixture());self.assertNotEqual(d['wholeContextSha256'],d['spellExcerptSha256']);self.assertGreater(d['wholeContextWordCount'],d['spellExcerptWordCount']);self.assertFalse(d['secondaryIsWholeReadyAction'])

    def test_page_continuation_trigger_deadline_and_spelling_conditions_required(self):
        for mutation in ['page','deadline','concentration','stop','duplicate']:
            pages=ready_fixture()
            if mutation=='page':pages.pop(94)
            elif mutation=='deadline':pages[93]=pages[93].replace('before the start of your next turn','later')
            elif mutation=='concentration':pages[94]=pages[94].replace('requires concentration','irrelevant')
            elif mutation=='stop':pages[94]=pages[94].replace('Search','Other')
            else:pages[94]+=' Ready Sometimes duplicate'
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):M.ready_primary(pages)

    def test_reaction_scope_stops_before_movement_and_carries_exact_reset(self):
        text='Reactions Certain special abilities permit reactions until the start of your next turn. Continue right after the reaction. Movement and Position other rules'
        d=M.reactions_primary(text);self.assertEqual(d['stopExcluded'],'Movement and Position')
        for changed in [text.replace('until the start of your next turn','round end'),text.replace('Movement and Position','Other')]:
            with self.assertRaises(ValueError):M.reactions_primary(changed)

    def test_ready_errata_deadline_is_bounded_and_already_present_in_srd(self):
        text='Ready (p. 193). Act using your reaction before the start of your next turn. Melee Attacks other'
        d=M.ready_errata(text);self.assertTrue(d['srdAlreadyContainsCorrection']);self.assertTrue(d['secondaryExcerptDoesNotContainThisFullActionSentence'])
        with self.assertRaises(ValueError):M.ready_errata(text.replace('before the start of your next turn','later this round'))

    def test_secondary_two_plus_one_paragraphs_keep_original_body_witnesses(self):
        d=report();self.assertEqual([len(r['paragraphSha256']) for r in d['secondaryObservations']],[2,1]);base=json.loads((ROOT/'catalog/spellcasting-reference-scopes-2014.json').read_text(encoding='utf-8'))['inventory']['blocks']
        for r in d['secondaryObservations']:self.assertEqual(r['bodyTextSha256'],base[r['headingOrdinal']]['bodyTextSha256'])

    def test_reaction_release_qualifier_omission_is_not_silently_fixed(self):
        f=report()['readyRelationship']['literalDifference'];self.assertTrue(f['secondaryFirstParagraphOmitsExplicitReleaseWithReactionClause'] and f['reactionStillAppearsInExample']);self.assertFalse(f['sourceSilentlyRewritten'])

    def test_bonus_observations_are_distinct_without_second_ability(self):
        d=report();b=d['bonusRelationship'];self.assertEqual((b['originalHeadingOrdinal'],b['repeatedHeadingOrdinal']),(14,18));self.assertNotEqual(b['originalHeadingBodySha256'],b['repeatedHeadingBodySha256']);self.assertFalse(b['secondRuleOrCapabilityCreated'] or b['fullSourceClauseReextracted'])
        source=json.loads((ROOT/'catalog/general-casting-clauses-2014.json').read_text(encoding='utf-8'));r=next(r for r in source['records'] if r['key']=='bonus-action');self.assertEqual(b['checkedPrimaryWitnessReused'],r['primary'])

    def test_slot_cast_timing_not_release_or_long_cast_refund(self):
        f=report()['ordinarySelectedFacts'];self.assertTrue(f['ordinarySlottedSpellCastAndSlotSpentWhenReadied']);self.assertFalse(f['releaseConsumesSecondSlot'] or f['concentrationFailureAfterReadyingRefundsSlot'] or f['noTriggerAutomaticallyRefundsSlot'] or f['itemChargeTimingInferred'])

    def test_ready_not_known_prepared_list_change_or_automatic_access(self):
        f=report()['ordinarySelectedFacts'];self.assertFalse(f['readyChangesKnownOrPreparedSpellLists']);self.assertTrue(f['normalSpellAccessComponentsAndCastingRequirementsStillApply']);self.assertFalse(report()['readyRelationship']['ordinaryReadyIsClassSpellPreparation'])

    def test_trigger_budget_and_bonus_turn_contexts_not_merged_into_round(self):
        f=report()['ordinarySelectedFacts'];self.assertTrue(f['canIgnoreTrigger'] and f['releaseAfterTriggerFinishesRequiresReaction'] and f['bonusRestrictionSameTurnBeforeAndAfter'] and f['bonusCantripAlsoTriggersSameTurnRestriction']);self.assertFalse(f['readyGrantsExtraReaction'] or f['roundBoundaryAloneResetsReaction'] or f['bonusClauseCreatesWholeRoundSpellBan'] or f['nonSpellBonusActivityTriggersSpellRestriction'])

    def test_changed_manual_context_cannot_inherit_decision(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for path in M.INPUT_PINS:
                p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/path).read_bytes())
            p=root/next(iter(M.INPUT_PINS));p.write_bytes(p.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'reassessment'):M.audit(b'fake',b'fake',b'fake',root,rendered_primary_pages_inspected=True)

    def test_inspection_and_exact_source_required(self):
        with self.assertRaisesRegex(ValueError,'Inspect'):M.audit(b'fake',b'fake',b'fake')
        with self.assertRaisesRegex(ValueError,'article'):M.audit(b'fake',b'fake',b'fake',rendered_primary_pages_inspected=True)

    def test_input_code_pins_and_partial_scope_holds(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for spec in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/spec['path']).read_bytes().replace(b'\r\n',b'\n')),spec['sha256'])
        self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged'] or d['readyRelationship']['fullReadyActionAccepted']);self.assertIsNone(d['approvedDenominator']);self.assertTrue(d['ordinarySelectedFacts']['manualDeviationAllowedWithWarning']);self.assertEqual(d['nextWorkItem']['phase'],'weave-narrative-and-current-scope-coverage')


if __name__=='__main__':unittest.main()
