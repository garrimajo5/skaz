import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('concentration',ROOT/'scripts/audit-general-concentration-targets-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)


def report():return json.loads((ROOT/'catalog/general-concentration-targets-2014.json').read_text(encoding='utf-8'))


def row(key):return next(r for r in report()['records'] if r['key']==key)


class GeneralConcentrationTargetsTest(unittest.TestCase):
    def test_full_text_with_lists_keeps_order_and_does_not_double_count_nested_paragraph(self):
        p=M.TextBlocks();d=p.result('<p>before</p><ul><li><p>damage</p><p>each source</p></li><li>death</li></ul><p>after</p>')
        self.assertEqual([(b['kind'],b['text']) for b in d],[('p','before'),('li','damage each source'),('li','death'),('p','after')]);self.assertEqual((p.paragraphs,p.list_items),(4,2))

    def test_unclosed_nested_unknown_or_outside_content_fails(self):
        for raw in ['<p>open','<p>outer<p>inner</p>','outside<p>one</p>','<table><tr><td>x</td></tr></table>','<li>outer<li>inner</li>','<p> </p>']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):M.TextBlocks().result(raw)

    def test_all_thirteen_paragraphs_and_three_list_items_are_retained(self):
        d=report();self.assertEqual(sum(r['secondary']['paragraphCount'] for r in d['records']),13);self.assertEqual(sum(r['secondary']['listItemCount'] for r in d['records']),3);r=row('concentration');self.assertEqual(r['secondary']['listItemCount'],3);self.assertEqual([b['kind'] for b in r['secondary']['textBlocks']].count('li'),3)

    def test_body_hashes_match_original_inventory_without_dropping_lists(self):
        old=json.loads((ROOT/'catalog/spellcasting-reference-scopes-2014.json').read_text(encoding='utf-8'))['inventory']['blocks']
        for r in report()['records']:self.assertEqual(r['secondary']['bodyTextSha256'],old[r['headingOrdinal']]['bodyTextSha256'])

    def test_named_marker_distinguishes_duration_heading_from_later_reference(self):
        t='Duration A spell’s duration text Instantaneous next Concentration refers to Duration later'
        self.assertEqual(M.named_primary(t,'Duration','Duration A spell’s duration','Instantaneous'),'A spell’s duration text')
        with self.assertRaises(ValueError):M.named_primary(t+' Duration A spell’s duration','Duration','Duration A spell’s duration','Instantaneous')
        with self.assertRaises(ValueError):M.named_primary('Duration A spell’s duration no stop','Duration','Duration A spell’s duration','Instantaneous')

    def test_inspected_pages_and_exact_sources_required(self):
        with self.assertRaisesRegex(ValueError,'Inspect'):M.audit(b'changed',b'changed',b'changed')
        with self.assertRaisesRegex(ValueError,'secondary'):M.audit(b'changed',b'changed',b'changed',rendered_pages_inspected=True)

    def test_rounding_has_its_own_basic_witness_and_no_srd_license_inheritance(self):
        d=report();f=row('concentration')['ordinaryFacts'];self.assertEqual(f['ordinaryDamageDC'],'max(10,floor(damage/2))');w=row('concentration')['additionalPrimaryEvidence'];self.assertEqual((w['source'],w['pdfPage']),('basic2018',5));self.assertFalse(d['sources']['basic']['srdLicenseInherited'])

    def test_damage_sources_incapacitation_and_environment_are_distinct(self):
        f=row('concentration')['ordinaryFacts'];self.assertTrue(f['differentDamageSourcesRequireSeparateSaves'] and f['incapacitationOrDeathEndsConcentration']);self.assertEqual((f['damageCheckAbility'],f['damageCheckType']),('constitution','saving-throw'));self.assertFalse(f['everyEnvironmentEventAutomaticallyCallsSave']);self.assertEqual(f['dmMayCallEnvironmentSaveDC'],10)

    def test_concentration_not_ended_by_normal_movement_or_action_cost(self):
        f=row('concentration')['ordinaryFacts'];self.assertTrue(f['canEndAnytimeWithoutAction'] and f['anotherConcentrationSpellEndsPrevious']);self.assertFalse(f['normalMovementOrAttackingAutomaticallyBreaks'] or f['ordinaryTwoConcentrationSpellsAllowed'])

    def test_instantaneous_duration_does_not_decide_counterspell_or_undo_all_changes(self):
        f=row('instantaneous')['ordinaryFacts'];self.assertTrue(f['instantaneousEffectNotDispelledByDurationRule']);self.assertFalse(f['counterspellBeforeCompletionRuledOutByThisSection'] or f['allResultingChangesRevertedInstantly'])

    def test_target_perceptibility_subject_shift_is_explicit_not_rewritten(self):
        r=row('targets');self.assertEqual(r['literalDifference']['kind'],'perceptible-effect-referent-shift');self.assertEqual((r['literalDifference']['secondaryRefersTo'],r['literalDifference']['primaryRefersTo']),('target','spell'));self.assertFalse(r['literalDifference']['sourceSilentlyRewritten']);self.assertTrue(r['ordinaryFacts']['perceptibleEffectClauseRefersToSpellInPrimary'])

    def test_cover_visibility_and_self_range_are_not_collapsed(self):
        self.assertFalse(row('clear-path')['ordinaryFacts']['invisibilityAutomaticallyEqualsTotalCover']);self.assertTrue(row('clear-path')['ordinaryFacts']['targetCannotBeBehindTotalCoverByOrdinaryRule']);self.assertFalse(row('self-target')['ordinaryFacts']['rangeSelfAlwaysMeansOnlyCasterCanBeAffected'])

    def test_scope_acceptance_and_manual_path_are_preserved(self):
        d=report();self.assertEqual(d['summary']['remainingUnreviewedHeadingBodies'],27);self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator']);self.assertTrue(all(r['ordinaryFacts']['manualDeviationAllowedWithWarning'] and not r['acceptedForRuntime'] for r in d['records']));self.assertEqual(d['nextWorkItem']['phase'],'general-areas-saves-attacks-combination')

    def test_all_input_and_code_pins_current(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for spec in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/spec['path']).read_bytes().replace(b'\r\n',b'\n')),spec['sha256'])


if __name__=='__main__':unittest.main()
