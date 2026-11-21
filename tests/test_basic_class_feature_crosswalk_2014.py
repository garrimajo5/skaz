import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('crosswalk',ROOT/'scripts/review-basic-class-feature-crosswalk-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)

def inputs():return [json.loads((ROOT/p).read_text(encoding='utf-8')) for p in M.INPUTS]
def row(d,slug):return next(r for r in d['classRows'] if r['slug']==slug)

class BasicClassFeatureCrosswalkTest(unittest.TestCase):
    def test_existing_table_references_resolve_without_full_rule_acceptance(self):
        d=M.crosswalk(*inputs());self.assertEqual(d['summary']['existingLocalFeatureRecords'],125);self.assertEqual(d['summary']['tableFeatureOccurrences'],247)
        self.assertEqual(d['summary']['referenceResolution'],{'local-key-resolves-uniquely':247})
        self.assertTrue(all(not r['fullClassTextCompared'] and not r['automaticCapabilitiesAccepted'] for r in d['classRows']))
        self.assertEqual(d['summary']['canonicalUnitsAccepted'],0);self.assertIsNone(d['approvedDenominator'])
    def test_shared_spellcasting_key_stays_scoped_to_own_class(self):
        d=M.crosswalk(*inputs())
        for slug in ['wizard','bard','cleric']:
            references=[r for r in row(d,slug)['tableFeatureReferences'] if r['label']=='Spellcasting'];self.assertTrue(references)
            self.assertTrue(all(all(id.startswith(slug+'-') for id in r['candidateFeatureIds']) for r in references))
    def test_two_local_candidates_are_retained_as_ambiguous_without_choosing_first(self):
        data=inputs();f=copy.deepcopy(next(x for x in data[2]['features'] if x['classId']=='fighter'));f['id']='fighter-synthetic-alternative';data[2]['features'].append(f)
        d=M.crosswalk(*data);amb=[r for r in row(d,'fighter')['tableFeatureReferences'] if r['state']=='ambiguous-local-key'];self.assertTrue(amb)
        self.assertTrue(all(len(r['candidateFeatureIds'])==2 and not r['fullTextEquivalenceEstablished'] for r in amb))
    def test_duplicate_alias_inside_one_record_is_not_two_candidates(self):
        data=inputs();f=next(x for x in data[2]['features'] if x['classId']=='fighter');f['keys'].append(f['keys'][0]);d=M.crosswalk(*data)
        self.assertNotIn('ambiguous-local-key',d['summary']['referenceResolution']);self.assertEqual(d['summary']['tableFeatureOccurrences'],247)
    def test_case_change_is_unresolved_and_not_an_automatic_alias(self):
        data=inputs();wizard=next(c for c in data[1]['classes'] if c['slug']=='wizard');wizard['levels'][0]['featuresEn']=[x.lower() if x=='Arcane Recovery' else x for x in wizard['levels'][0]['featuresEn']]
        d=M.crosswalk(*data);r=next(r for r in row(d,'wizard')['tableFeatureReferences'] if r['label']=='arcane recovery')
        self.assertEqual(r['state'],'unresolved-local-key');self.assertEqual(r['candidateFeatureIds'],[]);self.assertIn('wizard-arcane-recovery',row(d,'wizard')['unreferencedLocalFeatureIds'])
    def test_local_orphan_is_a_reference_diagnostic_not_a_missing_book(self):
        data=inputs();f=copy.deepcopy(next(x for x in data[2]['features'] if x['classId']=='fighter'));f.update(id='fighter-synthetic-orphan',keys=['Synthetic unmatched choice']);data[2]['features'].append(f)
        d=M.crosswalk(*data);self.assertIn(f['id'],row(d,'fighter')['unreferencedLocalFeatureIds']);self.assertNotIn('missingPublicationCount',d['summary'])
    def test_duplicate_feature_id_or_foreign_class_is_not_silently_discarded(self):
        for mutate in [lambda d:d[2]['features'].append(copy.deepcopy(d[2]['features'][0])),lambda d:d[2]['features'][0].update(classId='artificer')]:
            data=inputs();mutate(data)
            with self.assertRaises(ValueError):M.crosswalk(*data)
    def test_unknown_status_or_reordered_missing_levels_requires_review(self):
        for mutate in [lambda d:d[2]['features'][0].update(status='automatic'),lambda d:d[1]['classes'][0]['levels'].pop(),lambda d:d[1]['classes'].reverse()]:
            data=inputs();mutate(data)
            with self.assertRaises(ValueError):M.crosswalk(*data)
    def test_srd_license_cannot_be_reassigned_to_basic_pdf_or_digital(self):
        for mutate in [lambda d:d[0]['relations'].update(srdLicenseExtendsToOtherDocuments=True),lambda d:d[2]['source'].update(sha256='0'*64),lambda d:d[1]['source'].update(usage='assumed-common-license')]:
            data=inputs();mutate(data)
            with self.assertRaises(ValueError):M.crosswalk(*data)
        self.assertFalse(M.crosswalk(*inputs())['rightsBoundary']['licenseTransferredToOtherBasicRulesCarriers'])
    def test_selected_unit_never_accepts_the_whole_wizard_or_enables_runtime(self):
        d=M.crosswalk(*inputs());self.assertTrue(d['selectedRuleBoundary']['existingManualTextUnchanged']);self.assertFalse(d['selectedRuleBoundary']['runtimeEnabled'])
        for mutate in [lambda d:d[3]['existingManualFeature'].update(fullClassAccepted=True),lambda d:d[3].update(acceptedForRuntime=True),lambda d:d[3]['witnesses'].pop('srd')]:
            data=inputs();mutate(data)
            with self.assertRaises(ValueError):M.crosswalk(*data)
    def test_changed_existing_manual_text_cannot_inherit_source_comparison(self):
        data=inputs();next(f for f in data[2]['features'] if f['id']=='wizard-arcane-recovery')['text']='synthetic changed text'
        with self.assertRaises(ValueError):M.crosswalk(*data)
    def test_pdf_heading_and_existing_table_pages_are_separate_for_rogue(self):
        r=row(M.crosswalk(*inputs()),'rogue')['carrierReferences'];self.assertEqual((r['basicPdfTocEntry']['page'],r['existingSrdTableExtractionPage'],r['srdHeadingPage']),(28,38,39))
    def test_manual_choice_and_unsupported_statuses_and_artificer_boundary_are_retained(self):
        d=M.crosswalk(*inputs());self.assertEqual(d['summary']['existingLocalFeatureStatusCounts'],{'manual':85,'choice':38,'unsupported':2})
        self.assertFalse(d['artificerBoundary']['excludedFromProjectOrProvenMissing']);self.assertFalse(d['artificerBoundary']['presentInTheseSrdCarriers'])
    def test_committed_report_is_reproducible_and_all_pins_match(self):
        d=json.loads((ROOT/'catalog/basic-class-feature-crosswalk-2014.json').read_text(encoding='utf-8'));self.assertEqual(d,M.build(ROOT))
        for p,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')),digest)
        self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))

if __name__=='__main__':unittest.main()
