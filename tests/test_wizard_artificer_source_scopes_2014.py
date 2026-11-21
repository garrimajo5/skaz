import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('map',ROOT/'scripts/review-wizard-artificer-source-scopes-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def inputs():return [json.loads((ROOT/p).read_text(encoding='utf-8')) for p in M.INPUTS]
def candidate(d,slug,fragment):return next(r for r in d['candidateRows'] if r['candidateReference']['id']=='scope:'+slug+':class-features:'+fragment)

class WizardArtificerSourceScopesTest(unittest.TestCase):
    def test_all_selected_ids_source_arrays_order_and_extra_headings_are_preserved(self):
        data=inputs();before=copy.deepcopy(data);d=M.resolve(*data)
        expected=[r for c in data[0]['classes'] if c['classUrl'] in M.CLASS_URLS.values() for r in c['records']]
        # Selected class order is declared Wizard then Artificer; raw source arrays and original records remain unchanged.
        expected=[r for slug in M.CLASS_URLS for c in data[0]['classes'] if c['classUrl']==M.CLASS_URLS[slug] for r in c['records']]
        self.assertEqual([r['candidateReference']['id'] for r in d['candidateRows']],[r['id'] for r in expected])
        self.assertEqual([r['candidateReference']['sourceIds'] for r in d['candidateRows']],[r['sourceIds'] for r in expected])
        self.assertEqual([r['headingReference'] for r in d['artificerHeadingRows']],[r['heading'] for r in data[1]['records']]);self.assertEqual(data,before)
        self.assertEqual((len(d['candidateRows']),len(d['artificerHeadingRows'])),(130,23))
    def test_equal_spellcasting_labels_never_transfer_wizard_rules_to_artificer(self):
        d=M.resolve(*inputs());w=candidate(d,'wizard','feature.spellcasting');a=candidate(d,'artificer','feature.spellcasting')
        self.assertEqual(w['candidateReference']['title'],a['candidateReference']['title']);self.assertTrue(w['correspondingSourceComponents']);self.assertEqual(a['correspondingSourceComponents'],[]);self.assertIsNone(a['localSrdParentFeatureId'])
    def test_equal_asi_label_keeps_source102_and117_separate(self):
        d=M.resolve(*inputs());w=candidate(d,'wizard','feature.ASI');a=candidate(d,'artificer','feature.ASI')
        self.assertEqual(w['candidateReference']['sourceIds'],['102']);self.assertEqual(a['candidateReference']['sourceIds'],['117']);self.assertTrue(w['correspondingSourceComponents']);self.assertFalse(a['correspondingSourceComponents'])
    def test_tce_optional_wizard_features_are_not_missing_srd_or_base_phb_aliases(self):
        d=M.resolve(*inputs())
        for fragment in ['feature.extra-spells','feature.cantrip-formulas']:
            r=candidate(d,'wizard',fragment);self.assertEqual(r['candidateReference']['sourceIds'],['117']);self.assertEqual(r['candidateReference']['sourceBasis'],'explicit-option-TCE-marker');self.assertIsNone(r['localSrdParentFeatureId']);self.assertFalse(r['completeCandidateRulesAccepted'])
    def test_minor_conjuration_errata_is_excluded_from_base_spellcasting_facts(self):
        r=candidate(M.resolve(*inputs()),'wizard','feature.spellcasting');e=next(x for x in r['correspondingSourceComponents'] if x['unitKey']=='wizard-errata-selected')
        self.assertTrue(e['spellbookSidebarContextOnly']);self.assertNotIn('minorConjurationEndsWhenObjectTakesOrDealsAnyDamage',e['correspondingFacts']);self.assertIn('minorConjurationEndsWhenObjectTakesOrDealsAnyDamage',e['excludedFactKeys']);self.assertTrue(e['sourceLimitations'])
    def test_complete_english_unit_does_not_accept_candidate_translation_or_claimed_phb_source(self):
        r=candidate(M.resolve(*inputs()),'wizard','feature.arcane-recovery');self.assertTrue(r['correspondingSourceComponents'])
        for k in ['originalCandidateTextOrTranslationCompared','originalSourceClaimsValidatedByCorrespondence','completeCandidateRulesAccepted','automaticCapabilityAccepted']:self.assertFalse(r[k])
    def test_local_choice_entry_is_not_automatically_a_complete_rule(self):
        r=candidate(M.resolve(*inputs()),'wizard','feature.arcane-tradition');self.assertEqual(r['evidenceState'],'local-srd-reference-only');self.assertFalse(r['completeCandidateRulesAccepted'])
    def test_cross_class_heading_parent_is_rejected_and_missing_parent_retained(self):
        data=inputs();r=next(x for x in data[1]['records'] if x['parentFeatureObservationId']);r['parentFeatureObservationId']='scope:wizard:class-features:feature.spellcasting'
        with self.assertRaises(ValueError):M.resolve(*data)
        r['parentFeatureObservationId']='scope:artificer:class-features:feature.missing';d=M.resolve(*data);self.assertIn('unresolved-parent-reference',[x['parentReferenceState'] for x in d['artificerHeadingRows']])
    def test_duplicate_ids_headings_or_wrong_class_namespace_do_not_silently_merge(self):
        changes=[lambda d:d[0]['classes'][1]['records'].append(copy.deepcopy(d[0]['classes'][1]['records'][0])),lambda d:d[1]['records'].append(copy.deepcopy(d[1]['records'][0]))]
        for mutate in changes:
            data=inputs();mutate(data)
            with self.assertRaises(ValueError):M.resolve(*data)
    def test_changed_secondary_snapshot_does_not_inherit_text_identity(self):
        data=inputs();data[1]['snapshotPageSha256']='0'*64;d=M.resolve(*data);self.assertTrue(all(not r['sameSecondarySnapshot'] for r in d['artificerHeadingRows']));self.assertTrue(all(not r['completeRulesVerified'] for r in d['artificerHeadingRows']))
    def test_source_evidence_acceptance_or_class_reassignment_requires_review(self):
        for mutate in [lambda d:d[5].update(acceptedForRuntime=True),lambda d:d[4].update(accepted=True),lambda d:d[2]['features'][0].update(id='wizard-spellcasting')]:
            data=inputs();mutate(data)
            with self.assertRaises(ValueError):M.resolve(*data)
    def test_all_unlinked_choices_subclasses_and_manual_routes_stay_visible(self):
        d=M.resolve(*inputs());self.assertEqual(d['summary']['byClass'],{'wizard':87,'artificer':43});self.assertEqual(d['summary']['completeCandidateRulesAccepted'],0)
        self.assertTrue(all(r['manualDeviationAllowedWithWarning'] for r in d['candidateRows']));self.assertTrue(any(r['candidateReference']['kind']=='subclass-feature' and not r['correspondingSourceComponents'] for r in d['candidateRows']))
    def test_committed_report_reproduces_and_pins_match(self):
        d=json.loads((ROOT/'catalog/wizard-artificer-source-scopes-2014.json').read_text(encoding='utf-8'));self.assertEqual(d,M.build(ROOT))
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))

if __name__=='__main__':unittest.main()
