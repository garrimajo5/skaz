import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('multiclass',ROOT/'scripts/audit-wizard-multiclass-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)

def report():return json.loads((ROOT/'catalog/wizard-multiclass-2014.json').read_text(encoding='utf-8'))
def wizard_rows():return json.loads((ROOT/M.WIZARD_TABLE).read_text(encoding='utf-8'))['table']['rows']
def contexts():
 return {56:'System Reference Document 5.1 56 Multiclassing Multiclassing allows you to choose. Prerequisites To qualify both your current class and your new one need prerequisites. Multiclassing Prerequisites Class Ability Score Minimum Wizard Intelligence 13',57:'System Reference Document 5.1 57 Spellcasting Your capacity for spellcasting is class-bound. If you multiclass',58:'System Reference Document 5.1 58 but have the Spellcasting feature from only one class use class rules. Pact Magic lets slots cross-cast to cast warlock spells you know. Multiclass Spellcaster: Spell Slots per Spell Level'}
BASIC='The combination of ability scores, race, class, and background. There are two optional sets of rules. Your DM decides whether these options are available in a campaign. Multiclassing Multiclassing allows you to choose.'
def table_text():
 head='Multiclass Spellcaster: Spell Slots per Spell Level Lvl. 1st 2nd 3rd 4th 5th 6th 7th 8th 9th '
 for row in wizard_rows():
  n=row['level'];head+=str(n)+{1:'st',2:'nd',3:'rd'}.get(n,'th')+' '+' '.join(str(v) if v else '—' for v in row['spellSlots'])+' '
 return head+'Alignment A typical creature'

class WizardMulticlassTests(unittest.TestCase):
 def test_page_header_is_removed_without_losing_cross_page_single_class_condition(self):
  rows=M.full_context(contexts(),BASIC);self.assertEqual(len(rows),4)
  text='Spellcasting Your capacity for spellcasting is class-bound. If you multiclass but have the Spellcasting feature from only one class use class rules. Pact Magic lets slots cross-cast to cast warlock spells you know.'
  self.assertEqual(rows[2]['textSha256'],M.sha(text.encode()))
 def test_missing_continuation_page_fails(self):
  p=contexts();del p[58]
  with self.assertRaises(ValueError):M.full_context(p,BASIC)
 def test_wrong_header_or_lost_single_class_condition_fails(self):
  for replacement in ['System Reference Document 5.1 59','']:
   p=contexts();p[58]=p[58].replace('System Reference Document 5.1 58',replacement)
   with self.assertRaises(ValueError):M.full_context(p,BASIC)
  p=contexts();p[58]=p[58].replace('only one class','many classes')
  with self.assertRaises(ValueError):M.full_context(p,BASIC)
 def test_both_classes_prerequisite_must_not_disappear(self):
  p=contexts();p[56]=p[56].replace('both your current class and your new one','new class only')
  with self.assertRaises(ValueError):M.full_context(p,BASIC)
 def test_truncated_pact_magic_or_missing_optional_rule_context_fails(self):
  p=contexts();p[58]=p[58].replace('to cast warlock spells you know.','')
  with self.assertRaises(ValueError):M.full_context(p,BASIC)
  with self.assertRaises(ValueError):M.full_context(contexts(),BASIC.replace('two optional sets of rules','two requirements'))
 def test_all_twenty_rows_and_180_cells_match_reused_numeric_projection(self):
  t=M.slot_table(table_text(),wizard_rows());self.assertEqual(len(t['rows']),20);self.assertEqual(t['numericCellsCompared'],180);self.assertEqual(t['explicitDashGlyphsRepresentedAsZero'],['—'])
 def test_missing_row_or_foreign_dash_is_not_zero(self):
  for text in [table_text().replace('1st 2 — — — — — — — — ',''),table_text().replace('—','?',1),table_text().replace('—','0',1)]:
   with self.assertRaises(ValueError):M.slot_table(text,wizard_rows())
 def test_changed_level_order_or_numeric_projection_fails(self):
  with self.assertRaises(ValueError):M.slot_table(table_text().replace('20th 4','19th 4'),wizard_rows())
  rows=copy.deepcopy(wizard_rows());rows[0]['spellSlots'][0]=3
  with self.assertRaises(ValueError):M.slot_table(table_text(),rows)
 def test_known_prepared_example_is_not_book_capacity_or_higher_circle_grant(self):
  d=report();f=d['ordinarySelectedFacts'];self.assertTrue(f['eachClassKnownAndPreparedAsSingleClassIndividually']);self.assertFalse(f['exampleWizardBookTenSpellsIsHardCapacityLimit']);e=d['syntheticDecisionCases'][0];self.assertEqual(e['slotsFirstThreeCircles'],[4,3,2]);self.assertFalse(e['thirdCircleKnownSpellsAutomaticallyGranted'])
 def test_pact_interoperability_does_not_merge_recovery_or_add_levels(self):
  f=report()['ordinarySelectedFacts'];self.assertTrue(f['pactSlotsCanCastKnownOrPreparedSpellcastingClassSpells'] and f['spellcastingSlotsCanCastKnownWarlockSpells']);self.assertFalse(f['pactMagicAddsWarlockLevelsToThisGeneralFormula'] or f['pactRechargeCountsOrPoolMergingEstablishedByThisScope'])
 def test_artificer_source_gap_is_not_filled_with_zero_or_runtime_hard_lock(self):
  f=report()['ordinarySelectedFacts'];self.assertFalse(f['unsupportedClassContributionSilentlyTreatedAsZero'] or f['artificerRoundingOrEldritchKnightArcaneTricksterRulesAccepted']);e=next(x for x in report()['syntheticDecisionCases'] if x['case']=='artificer3-wizard6-source-gap');self.assertIsNone(e['effectiveCasterLevelVerifiedFromTheseSources']);self.assertTrue(e['manualProfileSaveAllowed'])
 def test_proficiency_paragraph_is_reused_not_counted_as_new(self):
  d=report();prior=json.loads((ROOT/M.ENTRY).read_text(encoding='utf-8'))['secondaryScopes'][0];s=d['secondaryHeading'];self.assertEqual(s['newComparedParagraphIndexes'],[0,1,3]);self.assertEqual(s['reusedProficiencyParagraph']['paragraphSha256'],prior['comparedParagraphSha256'][0]);self.assertFalse(s['wholePrimaryMulticlassRulesRepresentedByThisHeading'])
 def test_exact_inputs_generator_and_bounded_status(self):
  d=report()
  for path,digest in {**d['inputSha256'],**d['upstreamParserSha256']}.items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
  self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')));self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator']);self.assertEqual(d['summary']['canonicalUnitsAccepted'],0)

 def test_higher_slot_casting_does_not_require_enhanced_effect(self):
  d=report();f=d['ordinarySelectedFacts'];self.assertTrue(f['higherSlotsCanCastKnownOrPreparedLowerCircleSpellsWithoutEnhancement']);self.assertTrue(f['enhancedEffectRequiresSpellSpecificText']);self.assertNotIn('higherSlotsCanUpcastKnownLowerSpellsOnlyWhenSpellProvidesEnhancement',f)
  case=next(c for c in d['syntheticDecisionCases'] if c['case']=='higher-slot-lower-known-spell-without-scaling');self.assertTrue(case['higherSlotUseAllowed']);self.assertFalse(case['enhancedEffectAutomaticallyInvented'])

if __name__=='__main__':unittest.main()
