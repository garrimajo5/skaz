import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('d05_triage',ROOT/'scripts/review-d05-current-triage-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))

class D05CurrentTriageTest(unittest.TestCase):
    def test_current_work_preserves_all_original_refs_and_historical_id_order(self):
        d=M.build(ROOT);context=read(M.CONTEXT)
        self.assertEqual([r['originalProviderReference'] for r in d['records']],context['remainingUnlinkedProviderReferences'])
        self.assertEqual(d['historicalSourceIdSequence'],[r['dndsuSourceId'] for r in context['historicalSourceLedger']])
        self.assertEqual(d['unlinkedHistoricalRowsPreserved'],context['remainingHistoricalRows'])
        self.assertEqual(len(d['records']),15);self.assertEqual(len(d['historicalSourceIdSequence']),70)

    def test_fifteen_reviewed_bounded_witnesses_do_not_erase_their_remaining_criteria(self):
        d=M.build(ROOT);rows=[r for r in d['records'] if r['triageState']=='independently-reviewed-bounded-witness-present']
        self.assertEqual({r['providerSourceId'] for r in rows},{1,34,37,53,62,92,93,94,105,116,122,126,128,129,135})
        self.assertTrue(all(r['remainingCriteria'] and not r['canonicalUnitAccepted'] and not r['missingPublicationProven'] for r in rows))
        self.assertFalse(d['accepted']);self.assertIsNone(d['approvedDenominator']);self.assertEqual(d['summary']['canonicalUnitsAccepted'],0)

    def test_empty_kind_queue_does_not_mean_missing_books_or_catalog_acceptance(self):
        d=M.build(ROOT)
        self.assertEqual([r['providerSourceId'] for r in d['primaryKindWorkQueue']],[])
        self.assertIsNone(d['nextUntriagedProviderSourceId'])
        self.assertTrue(all(not r['missingPublicationProven'] for r in d['records']))
        self.assertNotIn('missingPublicationCount',d['summary'])

    def test_selected_rule_is_not_a_sixteenth_kind_witness_or_enabled_runtime(self):
        d=M.build(ROOT);row=next(r for r in d['records'] if r['providerSourceId']==1)
        self.assertEqual(row['additionalSelectedRuleComparison']['unitId'],'wizard-arcane-recovery')
        self.assertFalse(row['additionalSelectedRuleComparison']['acceptedForRuntime'])
        self.assertEqual(d['summary']['withReviewedBoundedKindWitness'],15);self.assertEqual(d['summary']['selectedCompleteRuleComparisons'],1)

    def test_changed_report_cannot_inherit_old_independent_review(self):
        spec=M.WITNESSES[62];text=(ROOT/spec['path']).read_text(encoding='utf-8')
        self.assertEqual(M.reviewed_json(text,spec['sha256']),json.loads(text))
        altered=json.loads(text);altered['relationship']['childDndsuSourceId']='62'
        with self.assertRaisesRegex(ValueError,'inherit'):M.reviewed_json(json.dumps(altered),spec['sha256'])
        self.assertEqual(M.reviewed_json(text.replace('\n','\r\n'),spec['sha256']),json.loads(text))

    def test_wrong_provider_or_automatic_attribution_is_rejected(self):
        original=read(M.WITNESSES[105]['path'])
        for mutate in [lambda d:d['relationship'].update(childProviderSourceId=189),lambda d:d['relationship'].update(automaticRecordAttribution=True),lambda d:d.update(accepted=True)]:
            d=copy.deepcopy(original);mutate(d)
            with self.assertRaises(ValueError):M.validate_identity(105,d)

    def test_changed_original_residual_is_not_silently_repaired(self):
        original=read(M.CONTEXT)
        for mutate in [lambda d:d['remainingUnlinkedProviderReferences'].pop(),lambda d:d['remainingUnlinkedProviderReferences'].reverse(),lambda d:d['remainingUnlinkedProviderReferences'][0].update(providerSourceId=34)]:
            d=copy.deepcopy(original);mutate(d)
            with self.assertRaises(ValueError):M.validate_context(d)

    def test_changed_ledger_or_accepted_context_requires_new_stage_decision(self):
        original=read(M.CONTEXT)
        for mutate in [lambda d:d['historicalSourceLedger'].pop(),lambda d:d['historicalSourceLedger'][0].update(dndsuSourceId=d['historicalSourceLedger'][1]['dndsuSourceId']),lambda d:d.update(accepted=True)]:
            d=copy.deepcopy(original);mutate(d)
            with self.assertRaises(ValueError):M.validate_context(d)

    def test_rule_comparison_cannot_enable_runtime_by_carrying_old_review(self):
        original=read(M.RULE['path']);M.validate_rule(original)
        for field,value in [('acceptedForRuntime',True),('runtimeChanged',True),('accepted',True),('unitId','another-class-rule')]:
            d={**original,field:value}
            with self.assertRaises(ValueError):M.validate_rule(d)

    def test_root_provider_with_introductory_book_relation_is_not_the_book_provider(self):
        d=read(M.WITNESSES[34]['path']);M.validate_identity(34,d)
        wrong=copy.deepcopy(d);wrong['providerSourceId']=33
        with self.assertRaises(ValueError):M.validate_identity(34,wrong)

    def test_introduced_book_or_generic_al_id_cannot_be_inherited_as_own_numeric_id(self):
        original=read(M.WITNESSES[34]['path'])
        for field,value in [('numericDndsuSourceId','113'),('numericDndsuSourceId','169'),('canonicalSourceId','book:mtof')]:
            wrong={**original,field:value}
            with self.assertRaises(ValueError):M.validate_identity(34,wrong)

    def test_paired_document_preserves_both_independent_provider_references(self):
        d=M.build(ROOT);rows={r['providerSourceId']:r for r in d['records']}
        self.assertEqual(rows[94]['witnessPath'],rows[128]['witnessPath'])
        self.assertNotEqual(rows[94]['publicationKindWitness'],rows[128]['publicationKindWitness'])
        self.assertEqual(len(d['inputSha256']),16)
        for pid in [94,128]:
            self.assertIn('HTTP status/final URL unretained',rows[pid]['provenanceCaveat'])
            M.validate_identity(pid,read(M.WITNESSES[pid]['path']))

    def test_pair_rejects_dropped_swapped_or_accepted_member_identity(self):
        original=read(M.WITNESSES[94]['path'])
        changes=[lambda d:d['providerSourceIds'].pop(),lambda d:d['perProviderWitnesses'].pop('128'),
                 lambda d:d['perProviderWitnesses']['94'].update(providerSourceId=128),
                 lambda d:d['perProviderWitnesses']['94'].update(numericDndsuSourceId='94'),
                 lambda d:d['perProviderWitnesses']['94'].update(fullRulesReviewed=True),
                 lambda d:d['perProviderWitnesses']['94'].update(automaticAttribution=True)]
        for mutate in changes:
            d=copy.deepcopy(original);mutate(d)
            with self.assertRaises(ValueError):M.validate_identity(94,d)
        with self.assertRaises(ValueError):M.validate_identity(116,original)

    def test_empty_primary_pass_advances_to_existing_remaining_criteria(self):
        d=M.build(ROOT);self.assertEqual(d['primaryKindWorkQueue'],[]);self.assertIsNone(d['nextUntriagedProviderSourceId'])
        self.assertEqual([r['providerSourceId'] for r in d['remainingCriteriaWorkQueue']],M.EXPECTED_RESIDUAL)
        self.assertTrue(all(r['remainingCriteria'] and not r['canonicalUnitAccepted'] for r in d['remainingCriteriaWorkQueue']))
        self.assertEqual(d['nextWorkItem']['phase'],'publication-version-and-record-inventory');self.assertEqual(d['nextWorkItem']['providerSourceId'],1)
        self.assertIn('Arcane Recovery',d['nextWorkItem']['doNotRepeat']);self.assertFalse(d['complete'])

    def test_primary_pass_cannot_drop_remaining_criteria_or_accept_full_rules(self):
        from unittest.mock import patch
        with patch.dict(M.WITNESSES,{1:{**M.WITNESSES[1],'remaining':[]}}):
            with self.assertRaises(ValueError):M.build(ROOT)
        d=read(M.WITNESSES[135]['path']);d['fullRulesReviewed']=True
        with self.assertRaises(ValueError):M.validate_identity(135,d)

    def test_related_provider_is_not_added_to_the_original_work_denominator(self):
        from unittest.mock import patch
        with patch.dict(M.WITNESSES,{132:M.WITNESSES[135]}):
            with self.assertRaises(ValueError):M.build(ROOT)

    def test_committed_report_reproduces_and_provenance_stays_json_only(self):
        d=read('catalog/d05-current-publication-triage-2014.json');self.assertEqual(d,M.build(ROOT))
        self.assertTrue(all(path.endswith('.json') for path in d['inputSha256']))
        self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))

if __name__=='__main__':unittest.main()
