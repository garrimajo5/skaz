import importlib.util
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('context',ROOT/'scripts/review-library-publication-context-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def inputs():return [json.loads((ROOT/p).read_text(encoding='utf-8')) for p in M.INPUTS]

class PublicationContextTest(unittest.TestCase):
    def test_both_original_adventures_survive_a_shared_compilation(self):
        values=inputs();before=deepcopy(values);r=M.review(*values)
        origins=[x for x in r['relations'] if x['relationType']=='later-refined-compilation']
        self.assertEqual([x['origin']['id'] for x in origins],['105','106'])
        self.assertEqual({t['providerSourceId'] for x in origins for t in x['targets']},{102})
        self.assertEqual(len(r['historicalSourceLedger']),70);self.assertEqual(values,before)

    def test_grung_race_is_not_numeric_AL_source(self):
        r=M.review(*inputs());grung=next(x for x in r['namedPublicationLedger'] if x['observationId']=='dndsu:race:169')
        self.assertEqual(grung['observedSourceIds'],[]);self.assertIsNone(grung['numericSourceId'])
        self.assertEqual(grung['currentNamedPublicationDisposition'],'needs-official-rules-status-review')
        al=next(x for x in r['remainingHistoricalRows'] if x['dndsuSourceId']=='169')
        self.assertEqual(al['existingPolicyDisposition'],'needs-publication-identification')

    def test_bundle_cannot_lose_items_or_gain_dice(self):
        values=inputs();row=next(x for x in values[-1]['relations'] if x['origin']['id']=='191');row['targets'].pop()
        with self.assertRaisesRegex(ValueError,'both rule'):M.review(*values)
        values=inputs();row=next(x for x in values[-1]['relations'] if x['origin']['id']=='191');row['excludedNonRuleComponents']=[]
        with self.assertRaisesRegex(ValueError,'both rule'):M.review(*values)

    def test_changed_witness_cannot_inherit_old_semantics(self):
        values=inputs();next(x for x in values[2]['records'] if x['sourceId']=='105')['evidenceSummary']='Changed claim'
        with self.assertRaisesRegex(ValueError,'semantic witness'):M.review(*values)

    def test_unnumbered_origin_cannot_acquire_numeric_source(self):
        values=inputs();values[3]['relations'][0]['observedSourceIds']=['169']
        with self.assertRaisesRegex(ValueError,'numeric source'):M.review(*values)

    def test_ua_exclusion_does_not_accept_wotc_labelled_experimental_material(self):
        r=M.review(*inputs());row=next(x for x in r['relations'] if x['relationType']=='existing-experimental-exclusion')
        self.assertEqual(row['targets'][0]['providerSourceId'],100);self.assertFalse(row['experimentalAllowed'])
        values=inputs();values[4]['policy']['experimental']=True
        with self.assertRaisesRegex(ValueError,'Owner policy'):M.review(*values)

    def test_replacement_acceptance_and_wrong_targets_fail(self):
        values=inputs();values[-1]['relations'][0]['automaticSourceReplacement']=True
        with self.assertRaisesRegex(ValueError,'Premature'):M.review(*values)
        values=inputs();values[-1]['relations'][0]['targets'][0]['title']='Wrong'
        with self.assertRaisesRegex(ValueError,'target identity'):M.review(*values)

    def test_residual_conservation_is_not_a_missing_rule_count(self):
        r=M.review(*inputs());s=r['summary']
        self.assertEqual(s['priorUnlinkedProviderReferences'],s['additionalLinkedProviderReferences']+s['existingOwnerExcludedProviderReferences']+s['remainingUnlinkedProviderReferences'])
        self.assertFalse(r['accepted']);self.assertFalse(r['complete']);self.assertIsNone(r['approvedDenominator'])
        self.assertTrue(all(not x['accepted'] and x['canonicalPublicationCount'] is None for x in r['relations']))

    def test_generator_pin_is_current(self):
        d=json.loads((ROOT/'catalog/library-current-publication-context-2014.json').read_text(encoding='utf-8'))
        self.assertEqual(hashlib.sha256((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')).hexdigest(),d['generator']['sha256'])

if __name__=='__main__':unittest.main()
