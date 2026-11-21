import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('areas',ROOT/'scripts/audit-general-areas-effects-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)


def report():return json.loads((ROOT/'catalog/general-areas-effects-2014.json').read_text(encoding='utf-8'))


def row(key):return next(r for r in report()['records'] if r['key']==key)


class GeneralAreasEffectsTest(unittest.TestCase):
    def test_prose_captions_and_images_stay_separate_without_dropping_body_text(self):
        p=M.ParagraphMedia();d=p.result('<p>core <strong>rule</strong></p><p><img src="/diagram.png"></p><p>Схема 2.1: caption</p>')
        self.assertEqual([b['kind'] for b in d],['prose','diagram','caption']);self.assertEqual(d[0]['text'],'core rule');self.assertFalse(d[1]['images'][0]['fetchedOrAcceptedAsArt'])

    def test_unknown_outside_nested_empty_mixed_or_unclosed_paragraph_fails(self):
        for raw in ['<p>open','<p>one<p>two</p>','outside<p>one</p>','<p> </p>','<p>mixed<img src="/x"></p>','<img src="/x">','<table><tr><td>x</td></tr></table>','<p>Схема 8.9: changed</p>']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):M.ParagraphMedia().result(raw)

    def test_all_prose_and_all_separate_diagram_caption_references_retained(self):
        d=report();self.assertEqual(len(d['records']),9);self.assertEqual(sum(len(r['ordinaryProseParagraphSha256']) for r in d['records']),19);self.assertEqual(sum(len(r['diagramReferences']) for r in d['records']),7);self.assertEqual(sum(len(r['captionTextSha256']) for r in d['records']),6)
        original=json.loads((ROOT/'catalog/spellcasting-reference-scopes-2014.json').read_text(encoding='utf-8'))['inventory'];self.assertEqual([x for r in d['records'] for x in r['diagramReferences']],original['images'])
        for r in d['records']:self.assertEqual(r['bodyTextSha256'],original['blocks'][r['headingOrdinal']]['bodyTextSha256'])

    def test_partial_media_headings_do_not_become_full_reviewed_page(self):
        d=report();self.assertEqual(d['summary']['remainingHeadingsWithoutSelectedProseReview'],18);self.assertEqual(d['headingOrdinalsWithUnverifiedDiagramInsertions'],[34,35,36,37,39]);self.assertTrue(all(not r['wholeSecondaryHeadingAcceptedAsRules'] and not r['diagramAndCaptionRulesVerified'] for r in d['records']))

    def test_area_intro_has_both_primary_pages_not_only_continuation(self):
        self.assertEqual(row('areas')['primary']['pdfPages'],[102,103]);self.assertTrue(row('areas')['ordinaryFacts']['blockingRequiresTotalCover'])

    def test_origin_inclusion_and_line_width_are_shape_specific(self):
        for key in ['cone','cube','line']:
            self.assertFalse(row(key)['ordinaryFacts']['originIncludedByDefault']);self.assertTrue(row(key)['ordinaryFacts']['casterMayChooseToIncludeOrigin'])
        self.assertTrue(row('sphere')['ordinaryFacts']['originIncluded'] and row('cylinder')['ordinaryFacts']['originIncluded']);self.assertFalse(row('line')['ordinaryFacts']['everyLineHasFixedFiveFootWidth'])

    def test_cylinder_placement_and_save_wording_are_explicit_differences(self):
        r=row('cylinder');self.assertFalse(r['literalDifference']['exactPlacementEquivalenceAccepted'] or r['literalDifference']['sourceSilentlyRewritten']);self.assertEqual(row('saving-throws')['literalDifference']['kind'],'partial-versus-some-or-all-avoidance-wording');self.assertFalse(row('saving-throws')['ordinaryFacts']['successfulSaveAlwaysHalvesDamage'])

    def test_attack_disadvantage_needs_hostile_seeing_caster_and_not_incapacitated(self):
        f=row('attack-rolls')['ordinaryFacts'];self.assertTrue(f['rangedSpellAttackDisadvantageNeedsHostileWithinFiveFeetThatSeesCasterAndIsNotIncapacitated']);self.assertFalse(f['allSpellAttacksAreRanged'] or f['nearbyHostileMustBeTheAttackTarget'])

    def test_equal_potency_patch_does_not_inherit_srd_or_rewrite_source(self):
        r=row('combining-effects');self.assertTrue(r['secondaryAndSrdOmitEqualPotencyMostRecentClause']);self.assertEqual(r['additionalPrimaryEvidence']['pdfPage'],4);f=r['ordinaryFacts'];self.assertTrue(f['equallyPotentOverlappingMostRecentPerSeparateErrata']);self.assertFalse(f['equalTieRuleEstablishedBySrdTextAlone'] or f['sameSpellEffectsStack'] or f['lessPotentCastingAutomaticallyDispelledOrDeleted'] or f['combiningEffectsSumsEveryResourceAutomatically'])

    def test_errata_scope_requires_both_equal_potency_and_overlap(self):
        text='Combining Magical Effects (p. 205). The most recent effect applies if castings are equally potent and their durations overlap. Spells next'
        self.assertEqual(M.combining_errata(text)['pdfPage'],4)
        with self.assertRaises(ValueError):M.combining_errata(text.replace('equally potent and their durations overlap','simply newest'))

    def test_changed_manual_context_cannot_inherit_old_assessment(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for path in M.INPUT_PINS:
                p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/path).read_bytes())
            p=root/next(iter(M.INPUT_PINS));p.write_bytes(p.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'manual assessment'):M.audit(b'fake',b'fake',b'fake',root,rendered_pages_inspected=True)

    def test_visual_and_source_sha_gates(self):
        with self.assertRaisesRegex(ValueError,'Inspect'):M.audit(b'fake',b'fake',b'fake')
        with self.assertRaisesRegex(ValueError,'article SHA'):M.audit(b'fake',b'fake',b'fake',rendered_pages_inspected=True)

    def test_input_and_code_pins_current(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for spec in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/spec['path']).read_bytes().replace(b'\r\n',b'\n')),spec['sha256'])

    def test_manual_path_and_remaining_rules_stay_open(self):
        d=report();self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertTrue(all(r['ordinaryFacts']['manualDeviationAllowedWithWarning'] for r in d['records']));self.assertFalse(d['preservedHolds']['diagramSourceOrGeometryAccepted'] or d['preservedHolds']['runtimeEffectsOrConditionsDeleted']);self.assertEqual(d['nextWorkItem']['phase'],'general-core-introductions-and-schools');self.assertIsNone(d['approvedDenominator'])


if __name__=='__main__':unittest.main()
