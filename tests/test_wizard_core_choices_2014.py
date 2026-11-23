import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('core_choices',ROOT/'scripts/audit-wizard-core-choices-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)

def report():return json.loads((ROOT/'catalog/wizard-core-choices-2014.json').read_text(encoding='utf-8'))

def pages():return {53:'Arcane Tradition tradition paragraph Ability Score Improvement ASI paragraph Spell Mastery following excluded',75:'Feats optional rule and prerequisites. For example the Grappler feat is mentioned here. Grappler Prerequisite: Strength 13 or higher following benefits excluded'}


class WizardCoreChoicesTests(unittest.TestCase):
 def test_inline_feat_example_does_not_truncate_context_at_the_first_grappler_word(self):
  rows=M.selected_primary(pages());self.assertEqual([r['kind'] for r in rows],['tradition','asi-reused','optional-feats-context'])
  expected='optional rule and prerequisites. For example the Grappler feat is mentioned here.'
  self.assertEqual(rows[2]['textSha256'],M.sha(expected.encode()));self.assertFalse(rows[2]['wholeFollowingFeatureIncluded'])
 def test_both_context_pages_are_required(self):
  with self.assertRaises(ValueError):M.selected_primary({53:pages()[53]})
 def test_duplicate_start_or_missing_stop_is_rejected(self):
  for changed in ['Arcane Tradition '+pages()[53],pages()[53].replace('Spell Mastery','No boundary')]:
   p=pages();p[53]=changed
   with self.assertRaises(ValueError):M.selected_primary(p)
 def test_missing_complete_feat_context_stop_is_rejected(self):
  p=pages();p[75]=p[75].replace('Grappler Prerequisite: Strength 13 or higher','Grappler')
  with self.assertRaises(ValueError):M.selected_primary(p)
 def test_changed_secondary_snapshot_cannot_be_accepted(self):
  with self.assertRaises(ValueError):M.secondary_sections(b'<p>Changed Wizard</p>')
 def test_asi_primary_context_is_reused_not_rediscovered(self):
  d=report();r=json.loads((ROOT/M.REUSED).read_text(encoding='utf-8'));u=next(x for x in r['units'] if x['key']=='wizard-asi-levels')
  self.assertEqual(d['primaryAsiContextReused']['sourceFacts'],u['facts']);self.assertFalse(d['primaryAsiContextReused']['newPrimaryAsiDiscoveryClaimed']);self.assertEqual(d['summary']['newSelectedPrimaryScopes'],2)
 def test_complete_selected_secondary_scopes_do_not_include_adjacent_tce_feature(self):
  d=report();self.assertEqual([r['secondaryWitness']['headingOrdinal'] for r in d['secondaryScopes']],[30,32]);self.assertEqual(d['summary']['secondaryRuleProseParagraphs'],4)
  for r in d['secondaryScopes']:self.assertEqual(r['originalCandidateReferencePreserved']['sourceIds'],['102']);self.assertFalse(r['candidateFullClassOrOriginalPublicationAccepted'] or r['automationAccepted'])
 def test_feature_cap_and_multiclass_progression_do_not_become_global_locks_or_reapplication(self):
  d=report();a=d['manualAssessments'][1]
  self.assertFalse(a['capIsUniversalForEveryItemBuffOrManualProfile'] or a['characterTotalLevelsUsedInsteadOfWizardLevels'] or a['importedAsiAppliedAgain']);self.assertEqual(a['ordinaryWizardClassLevels'],[4,8,12,16,19]);self.assertTrue(d['implementationBoundaries']['ordinaryGameDeviationsWarnAndAllowManual']);self.assertFalse(d['implementationBoundaries']['gmAgreementCheckboxRequired'])
 def test_optional_feat_insert_does_not_accept_all_feat_rules_or_grappler_benefits(self):
  a=report()['manualAssessments'][2];self.assertTrue(a['inLieuOfAsiNotAnAdditionalAsi']);self.assertFalse(a['wholeFeatContextTranslatedByThisSingleParagraph'] or a['grapplerBenefitsOrAllFeatsAccepted'])
 def test_original_candidate_identity_is_preserved(self):
  d=report();matrix=json.loads((ROOT/M.MATRIX).read_text(encoding='utf-8'));original={r['candidateReference']['id']:r['candidateReference'] for r in matrix['candidateRows']}
  for r in d['secondaryScopes']:self.assertEqual(r['originalCandidateReferencePreserved'],original[r['originalCandidateReferencePreserved']['id']])
 def test_all_pins_and_generator_match_without_runtime_or_denominator(self):
  d=report()
  for path,digest in {**d['inputSha256'],**d['upstreamParserSha256']}.items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
  self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')));self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator'])

if __name__=='__main__':unittest.main()
