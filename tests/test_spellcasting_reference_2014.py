import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('reference',ROOT/'scripts/audit-spellcasting-reference-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)


def report():return json.loads((ROOT/'catalog/spellcasting-reference-scopes-2014.json').read_text(encoding='utf-8'))


def article(body):return '<div class="desc card__article-body">'+body+'</div>'


class SpellcastingReferenceTest(unittest.TestCase):
    def test_inventory_preserves_prelude_duplicate_titles_lists_tables_and_images(self):
        d=M.Inventory().result(article('<p>intro</p><h2>same</h2><p>one</p><ul><li>two</li></ul><table><tr><td>three</td></tr></table><h3>same</h3><p>four</p><img src="/public.png" alt="art">'))
        self.assertEqual([r['ordinal'] for r in d['blocks']],[0,1,2]);self.assertEqual([r['title'] for r in d['blocks'][1:]],['same','same']);self.assertEqual(d['blocks'][1]['bodyTextSha256'],M.sha(b'one two three'));self.assertFalse(d['images'][0]['fetchedOrAcceptedAsArt'])

    def test_visible_words_outside_paragraphs_are_still_in_inventory(self):
        d=M.Inventory().result(article('before<h2>section</h2>outside<p>inside</p>after'));self.assertEqual(d['blocks'][1]['bodyTextSha256'],M.sha(b'outside inside after'));self.assertEqual(d['blocks'][0]['bodyTextSha256'],M.sha(b'before'))

    def test_unknown_or_executable_semantics_are_not_silently_ignored(self):
        for raw in [article('<script>lost</script>'),article('<aside>lost</aside>')]:
            with self.assertRaises(ValueError):M.Inventory().result(raw)

    def test_missing_duplicated_unclosed_container_and_headings_fail(self):
        for raw in ['<p>not article</p>',article('<p>x</p>')+article('<p>y</p>'),'<div class="desc card__article-body"><h2>x',article('<h2><h3>x</h3></h2>'),article('<h2></h2>')]:
            with self.subTest(raw=raw),self.assertRaises(ValueError):M.Inventory().result(raw)

    def test_nested_container_does_not_end_body_early(self):
        d=M.Inventory().result(article('<div><p>inner</p></div><h2>next</h2><p>tail</p>'));self.assertEqual(len(d['blocks']),2);self.assertEqual(d['blocks'][-1]['bodyTextSha256'],M.sha(b'tail'))

    def test_receipt_errors_source_drift_or_wrong_url_cannot_pass(self):
        for field,value in [('status',206),('outcome','started'),('finalUrl','https://example.invalid'),('bytes',1),('sha256','0'*64)]:
            receipt=report()['source'];receipt[field]=value
            with self.subTest(field=field),self.assertRaises(ValueError):M.validate_receipt(b'fake',receipt)
        with self.assertRaises(ValueError):M.validate_receipt(b'fake',report()['source'])

    def test_primary_visual_inspection_and_exact_pdf_required(self):
        with self.assertRaisesRegex(ValueError,'visual'):M.primary_units(b'fake')
        with self.assertRaisesRegex(ValueError,'SRD'):M.primary_units(b'fake',rendered_page_inspected=True)

    def test_mixed_source_observations_do_not_inherit_header_phb(self):
        d=report();o=d['sourceBoundaryObservations'];self.assertEqual(o['observedPageHeaderClaim'],"Player's Handbook");self.assertFalse(o['wholePageSourceInheritanceAllowed'] or o['neighboringHeadingSourceInheritanceAllowed']);self.assertEqual([r['ordinal'] for r in o['explicitSupplementalHeadings']],[31,32,33,40,46]);self.assertEqual(o['spellPointsVariantHeadingOrdinals'],[7,8,9]);self.assertFalse(o['variantPrimaryPublicationAndVersionVerified'])

    def test_repeated_bonus_action_and_ready_scopes_are_not_deduplicated(self):
        o=report()['sourceBoundaryObservations'];self.assertEqual(o['readyActionAndRepeatedBonusActionHeadingsPreserved'],[14,17,18]);self.assertFalse(o['deduplicatedOrAcceptedAsOneRule'])

    def test_selected_complete_subsections_keep_all_four_secondary_paragraphs(self):
        d=report();self.assertEqual([len(r['secondaryParagraphSha256']) for r in d['selectedComparisons']],[3,1]);self.assertEqual(d['summary']['completeSelectedSubsectionComparisons'],2);self.assertEqual(d['summary']['selectedSecondaryParagraphs'],4);self.assertTrue(all(r['primary']['completeSelectedSubsection'] for r in d['selectedComparisons']))

    def test_ordinary_facts_leave_class_item_and_manual_paths_separate(self):
        f=report()['ordinarySelectedFacts'];self.assertTrue(f['knownOrPreparedAccessAndMagicItemAccessDistinct'] and f['classDescriptionsDetermineProcedure']);self.assertFalse(f['sharedKnownPreparedCountInferred'] or f['armorRuleAppliedAsRuntimeBlock']);self.assertTrue(f['armorProficiencyRequiredByOrdinaryRule'] and f['manualDeviationAllowedWithWarning'])

    def test_current_input_code_and_source_receipt_pins(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for spec in [d['generator'],d['upstreamParser']]:self.assertEqual(M.sha((ROOT/spec['path']).read_bytes().replace(b'\r\n',b'\n')),spec['sha256'])
        self.assertEqual(d['source']['sha256'],M.ARTICLE_SHA);self.assertEqual(d['source']['status'],200);self.assertFalse(d['source']['retried'])

    def test_inventory_does_not_become_forty_eight_accepted_rules(self):
        d=report();self.assertEqual(d['summary']['headingsInventoried'],48);self.assertEqual(len(d['inventory']['blocks']),49);self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertEqual(d['summary']['canonicalUnitsAccepted'],0);self.assertEqual(d['nextWorkItem']['phase'],'general-spell-slots-and-upcasting')


if __name__=='__main__':unittest.main()
