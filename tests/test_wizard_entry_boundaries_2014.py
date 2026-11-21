import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('entry',ROOT/'scripts/audit-wizard-entry-boundaries-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def data():return json.loads((ROOT/'catalog/wizard-entry-boundaries-2014.json').read_text(encoding='utf-8'))
class WizardEntryTests(unittest.TestCase):
 def test_missing_or_ambiguous_start_or_stop_is_rejected(self):
  for args in [('x','missing','end'),('start start end','start','end'),('start noend','start','stop')]:
   with self.assertRaises(ValueError):M.span(*args)
 def test_stop_search_is_scoped_after_selected_start(self):
  self.assertEqual(M.span('stop before start selected stop after','start','stop'),'start selected')
 def test_changed_secondary_source_is_rejected(self):
  with self.assertRaises(ValueError):M.source_sections(b'not the retained Wizard')
 def test_complete_entry_and_partial_multiclass_are_distinct(self):
  rs=data()['secondaryScopes'];self.assertEqual([r['headingOrdinal'] for r in rs],[13,16,17]);self.assertEqual(rs[0]['comparedParagraphIndexes'],[2]);self.assertFalse(rs[0]['completeHeadingProseCompared']);self.assertEqual(sum(len(r['comparedParagraphIndexes']) for r in rs),9)
 def test_first_character_level_is_not_first_level_in_later_class(self):
  f=data()['ordinarySelectedFacts'];self.assertFalse(f['wizardClassFirstLevelAutomaticallyGetsCharacterFirstLevel6Hp']);self.assertEqual(f['laterLevelWizardFixedGainBeforeCon'],4);self.assertTrue(f['mixedHitDiceTypesKeptSeparate']);self.assertFalse(f['currentHpManufacturedFromMaximum'])
 def test_starting_saves_skills_and_items_are_not_generic_multiclass_grants(self):
  f=data()['ordinarySelectedFacts'];self.assertEqual(f['startingSavingThrows'],['Intelligence','Wisdom']);self.assertEqual(f['startingSkillChoices']['choose'],2);self.assertEqual(f['wizardMulticlassProficienciesGrantedBySelectedTableRow'],[]);self.assertFalse(f['wizardStartingSavingThrowsAutomaticallyGrantedOnMulticlass'] or f['startingEquipmentAutomaticallyRegrantedFromGenericClassStartingList'] or f['specificSpellbookFeatureGrantDecidedByThisContext'])
 def test_minimum1_is_carrier_specific_not_silently_inserted(self):
  f=data()['ordinarySelectedFacts'];self.assertFalse(f['minimum1ExplicitInSrdWizardClassParagraph']);self.assertTrue(f['minimum1ExplicitInBasicGenericRolledTotalSentence']);self.assertTrue(f['minimumMarkerNotSilentlyInsertedIntoSrdText'])
 def test_skill_sets_agree_but_literal_order_is_preserved(self):
  a=data()['manualAssessments'][1];self.assertNotEqual(a['primarySkillOrder'],a['secondarySkillOrder']);self.assertEqual(set(a['primarySkillOrder']),set(a['secondarySkillOrder']))
 def test_generator_inputs_and_acceptance_boundaries(self):
  d=data()
  for path,digest in {**d['inputSha256'],**d['upstreamParserSha256']}.items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
  self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')));self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator']);self.assertTrue(d['implementationBoundaries']['manualDeviationWarnAndAllow'])
if __name__=='__main__':unittest.main()
