import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('coverage',ROOT/'scripts/review-spellcasting-scope-coverage-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def data():return M.load_inputs(ROOT)[:2]
class ScopeCoverageTest(unittest.TestCase):
    def test_original_order_title_hash_and_all_49_identities_preserved(self):
        source,n=data();before=copy.deepcopy(source);d=M.combine(source,n);old=source['generalReference']['inventory']['blocks'];self.assertEqual(len(d['rows']),49);self.assertEqual(source,before)
        for a,b in zip(d['rows'],old):self.assertEqual((a['observationReference']['ordinal'],a['observationReference']['title'],a['observationReference']['bodyTextSha256']),(b['ordinal'],b['title'],b['bodyTextSha256']))
    def test_38_11_partition_is_not_catalog_denominator(self):
        d=M.combine(*data());self.assertEqual(sum(r['state']=='selected-body-witness-present' for r in d['rows']),38);self.assertEqual(d['pendingHeadingOrdinals'],[7,8,9,31,32,33,40,41,42,46,47]);self.assertIsNone(d['approvedDenominator']);self.assertEqual(d['summary']['canonicalUnitsAccepted'],0);self.assertTrue(all(r['canonicalId'] is None and not r['canonicalRuleMissingProven'] for r in d['rows']))
    def test_partial_media_and_captions_retained_not_accepted(self):
        d=M.combine(*data());self.assertEqual(d['unverifiedMediaHeadingOrdinals'],[34,35,36,37,39]);self.assertEqual(sum(r.get('diagramCountUnverified',0) for r in d['rows']),7);self.assertEqual(sum(r.get('captionCountUnverified',0) for r in d['rows']),6);self.assertTrue(all(not r['fullRulesAccepted'] for r in d['rows']))
    def test_excerpt_duplicate_and_narrative_not_equal_rule_capabilities(self):
        d=M.combine(*data());self.assertIn('excerpt',d['rows'][17]['scopeKind']);self.assertIn('not-new-capability',d['rows'][18]['scopeKind']);self.assertIn('navigation',d['rows'][0]['scopeKind']);self.assertIn('narrative',d['rows'][48]['scopeKind']);self.assertFalse(d['coVersionedNarrative']['priorIndependentReviewInherited'])
    def test_unknown_ordinals_duplicates_and_wrong_body_digest_fail(self):
        base=[{'bodyTextSha256':str(n)} for n in range(49)];assigned={};M.claim(assigned,base,1,'1','e','/x','scope')
        for n,digest in [(1,'1'),(49,'49'),(True,'1'),(2,'wrong')]:
            with self.assertRaises(ValueError):M.claim(assigned,base,n,digest,'e','/x','scope')
    def test_snapshot_or_original_sequence_change_cannot_inherit(self):
        for mutation in ['snapshot','order']:
            d,n=data()
            if mutation=='snapshot':d['castingClauses']['sources']['secondary']['sha256']='0'*64
            else:d['generalReference']['inventory']['blocks'].reverse()
            with self.assertRaises(ValueError):M.combine(d,n)
    def test_duplicate_assignment_lost_media_and_changed_body_are_rejected(self):
        for mutation in ['duplicate','media','body']:
            d,n=data()
            if mutation=='duplicate':d['introductionsSchools']['records'][0]['headingOrdinal']=3
            elif mutation=='media':next(r for r in d['areasEffects']['records'] if r['diagramReferences'])['diagramReferences'].pop()
            else:d['castingClauses']['records'][0]['bodyTextSha256']='0'*64
            with self.assertRaises(ValueError):M.combine(d,n)
    def test_full_or_runtime_acceptance_cannot_be_promoted(self):
        for mutation in ['accepted','complete','acceptedForRuntime']:
            d,n=data();n[mutation]=True
            with self.assertRaises(ValueError):M.combine(d,n)
    def test_changed_report_does_not_inherit_independent_review(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            for spec in M.EVIDENCE.values():
                p=root/spec['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/spec['path']).read_bytes())
            p=root/next(iter(M.EVIDENCE.values()))['path'];p.write_bytes(p.read_bytes()+b' ')
            with self.assertRaisesRegex(ValueError,'independent review'):M.load_inputs(root)
    def test_reproduction_and_all_pins(self):
        d=json.loads((ROOT/'catalog/spellcasting-scope-coverage-2014.json').read_text(encoding='utf-8'));self.assertEqual(d,M.build(ROOT))
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))
if __name__=='__main__':unittest.main()
