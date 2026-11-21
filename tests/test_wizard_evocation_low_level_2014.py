import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('evocation',ROOT/'scripts/audit-wizard-evocation-low-level-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def report():return json.loads((ROOT/'catalog/wizard-evocation-low-level-2014.json').read_text(encoding='utf-8'))
TEXT='Evocation Savant Beginning when you select this school copy-gold-time-half. Sculpt Spells Beginning at 2nd level other visible affected creatures. Potent Cantrip Starting at 6th level successful save. Empowered Evocation Beginning at 10th level excluded.'
class EvocationLowLevelTests(unittest.TestCase):
 def test_complete_selected_scopes_stop_before_higher_level_feature(self):
  r=M.primary(TEXT);self.assertEqual([x['key'] for x in r],['evocation-savant','sculpt-spells','potent-cantrip']);self.assertEqual(r[-1]['textSha256'],M.sha('Potent Cantrip Starting at 6th level successful save.'.encode()))
 def test_missing_or_duplicate_boundary_fails(self):
  for text in [TEXT.replace('Empowered Evocation Beginning at 10th level','missing'),TEXT+' Evocation Savant Beginning when you select this school extra']:
   with self.assertRaises(ValueError):M.primary(text)
 def test_changed_secondary_snapshot_is_rejected(self):
  with self.assertRaises(ValueError):M.secondary(b'<p>New Wizard</p>',{})
 def test_original_candidate_ids_parent_and_claims_are_preserved(self):
  d=report();m=json.loads((ROOT/M.MATRIX).read_text(encoding='utf-8'));by={r['candidateReference']['id']:r['candidateReference'] for r in m['candidateRows']};self.assertEqual([r['headingOrdinal'] for r in d['secondaryScopes']],[37,38,39])
  for r in d['secondaryScopes']:self.assertEqual(r['originalCandidateReferencePreserved'],by[r['originalCandidateReferencePreserved']['id']]);self.assertEqual(r['originalCandidateReferencePreserved']['parent'],'tradition.evocation');self.assertFalse(r['fullSubclassOrOriginalPublicationAccepted'])
 def test_copy_discount_does_not_become_all_school_or_casting_material_discount(self):
  a=report()['manualAssessments'][0];self.assertTrue(a['goldAndTimeBothHalved']);self.assertFalse(a['allSpellSchoolsHalfPrice'] or a['castingComponentsOrItemPricesHalved'] or a['newVsBackupCopyAdjudicationAddedByThisScope'])
 def test_sculpt_retains_evocation_visibility_other_creature_and_half_save_qualifiers(self):
  a=report()['manualAssessments'][1];self.assertTrue(a['operationalSentenceRequiresEvocationSchoolInBoth'] and a['otherCreaturesRequired'] and a['creaturesAffectedByTheCastSpellRequired'] and a['casterMustSeeChosenCreatures']);self.assertTrue(a['zeroDamageOnlyWhenSuccessfulSaveNormallyHalvesDamage']);self.assertFalse(a['selfAutomaticallyProtected'] or a['universalImmunityToAnyDamageOrOtherSpells'] or a['literalIntroEqualityClaimed'])
 def test_potent_cantrip_is_successful_save_not_attack_miss_or_extra_effects(self):
  a=report()['manualAssessments'][2];self.assertTrue(a['damagingCantripRequired'] and a['targetSuccessfulSavingThrowRequired'] and a['halfDamageIfAny']);self.assertFalse(a['attackRollMissTriggersHalfDamage'] or a['additionalEffectsOnSuccessfulSave'] or a['evocationOrWizardOnlyQualifierPresentInThisClause'])
 def test_source_pins_no_runtime_or_full_subclass_promotion(self):
  d=report()
  for path,digest in {**d['inputSha256'],**d['upstreamParserSha256']}.items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
  self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')));self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator']);self.assertTrue(d['implementationBoundaries']['manualDeviationWarnAndAllow'])
if __name__=='__main__':unittest.main()
