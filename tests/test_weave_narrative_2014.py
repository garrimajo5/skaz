import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('weave',ROOT/'scripts/audit-weave-narrative-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def report():return json.loads((ROOT/'catalog/weave-narrative-2014.json').read_text(encoding='utf-8'))
class WeaveNarrativeTest(unittest.TestCase):
    def test_prelude_keeps_two_paragraphs_and_navigation_separate(self):
        ps,nav=M.prelude_parts('<p>one</p><p>two</p><ul class="new-article-menu"><li><a href="#one">one</a></li></ul>');self.assertEqual(ps,['one','two']);self.assertEqual(nav['hrefs'],['#one']);self.assertTrue(nav['retainedInOriginalBodyWitness']);self.assertFalse(nav['newRulesCreated'])
    def test_lost_unknown_or_duplicate_navigation_and_prose_fail(self):
        for raw in ['<p>one</p><p>two</p>','<p>one</p><ul class="new-article-menu"></ul>','<p>one</p><p>two</p><ul class="new-article-menu"></ul><ul class="new-article-menu"></ul>','<p>one</p><p>two</p><script>outside</script><ul class="new-article-menu"></ul>']:
            with self.assertRaises(ValueError):M.prelude_parts(raw)
    def test_weave_end_excludes_artist_credit_and_requires_complete_ending(self):
        t='before The Weave of Magic selected or not at all. RICHARD WHITTERS';d=M.weave_primary(t);self.assertEqual(d['selectedTextSha256'],M.sha(b'selected or not at all.'))
        for changed in [t.replace('or not at all.','incomplete'),t.replace('RICHARD WHITTERS','unknown'),t+' The Weave of Magic duplicate']:
            with self.assertRaises(ValueError):M.weave_primary(changed)
    def test_basic_new_carrier_requires_known_equal_potency_correction(self):
        t='Combining Magical Effects Or the most recent effect applies if the castings are equally potent and their durations overlap. The Weave of Magic next';d=M.basic_combination(t);self.assertTrue(d['knownEqualPotencyMostRecentSentencePresent']);self.assertFalse(d['existingSrdWitnessRewritten'] or d['wholeCarrierIdentityWithSrdClaimed'])
        with self.assertRaises(ValueError):M.basic_combination(t.replace('equally potent','unequal'))
    def test_seven_prose_paragraphs_keep_original_combined_body_witnesses(self):
        d=report();base=json.loads((ROOT/'catalog/spellcasting-reference-scopes-2014.json').read_text(encoding='utf-8'))['inventory']['blocks'];self.assertEqual([len(r['selectedProseParagraphSha256']) for r in d['records']],[2,5])
        for r in d['records']:self.assertEqual(r['originalCombinedBodySha256'],base[r['headingOrdinal']]['bodyTextSha256']);self.assertFalse(r['wholeCombinedBodyAcceptedAsRules'])
    def test_narrative_not_deity_grants_range_or_runtime_mutation(self):
        d=report();self.assertTrue(all(d['narrativeBoundaries'].values()));self.assertFalse(d['sources']['basic']['srdLicenseInherited']);self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertEqual(d['nextWorkItem']['phase'],'wizard-spell-list-reference')
    def test_context_drift_and_source_inspection_gates(self):
        with self.assertRaisesRegex(ValueError,'Inspect'):M.audit(b'fake',b'fake',b'fake')
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for path in M.INPUT_PINS:
                p=root/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/path).read_bytes())
            p=root/next(iter(M.INPUT_PINS));p.write_bytes(p.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'reassessment'):M.audit(b'fake',b'fake',b'fake',root,rendered_pages_inspected=True)
    def test_input_and_code_pins(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for spec in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/spec['path']).read_bytes().replace(b'\r\n',b'\n')),spec['sha256'])
if __name__=='__main__':unittest.main()
