import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('equipment',ROOT/'scripts/audit-wizard-equipment-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def report():return json.loads((ROOT/'catalog/wizard-equipment-2014.json').read_text(encoding='utf-8'))
def body():return '<p>Class plus background</p><ul>'+''.join(f'<li>choice {i}</li>' for i in range(4))+'</ul><p>Alternate gold</p>'
class WizardEquipmentTests(unittest.TestCase):
 def test_intro_four_list_items_and_alternate_paragraph_preserve_order(self):
  rs=M.EquipmentParts().result(body());self.assertEqual([r['kind'] for r in rs],['p','li','li','li','li','p']);self.assertEqual(rs[-1]['text'],'Alternate gold')
 def test_missing_choice_or_wealth_paragraph_cannot_count_as_complete(self):
  for b in [body().replace('<li>choice 2</li>',''),body().replace('<p>Alternate gold</p>','')]:
   with self.assertRaises(ValueError):M.EquipmentParts().result(b)
 def test_unknown_semantic_or_unaccounted_prose_fails(self):
  for b in [body()+'unaccounted',body()+'<table><tr><td>another rule</td></tr></table>']:
   with self.assertRaises(ValueError):M.EquipmentParts().result(b)
 def test_truncated_or_nested_pieces_fail(self):
  for b in [body()[:-4],body().replace('choice 0','<p>nested</p>')]:
   with self.assertRaises(ValueError):M.EquipmentParts().result(b)
 def test_changed_snapshot_is_rejected_before_reusing_old_source_claim(self):
  with self.assertRaises(ValueError):M.secondary(b'<p>new Wizard</p>')
 def test_gold_replaces_both_starting_lists_not_additional_gold(self):
  f=report()['ordinarySelectedFacts'];a=f['alternateWealth'];self.assertEqual((a['diceCount'],a['dieSides'],a['multiplier'],a['currency']),(4,4,10,'gp'));self.assertTrue(a['replacesBothClassAndBackgroundStartingEquipment']);self.assertFalse(a['isAdditionalFreeGoldAlongWithBothEquipmentSets'] or f['standardAndWealthOptionsSimultaneouslyGranted'])
 def test_multiclass_and_specific_feature_boundaries_remain_separate(self):
  f=report()['ordinarySelectedFacts'];self.assertFalse(f['equipmentRegrantedOnMulticlass'] or f['specificSpellbookFeatureGrantSettled'] or f['automaticChoiceOrGoldRollMade'])
 def test_manual_exceptions_and_exact_data_pins_are_retained(self):
  d=report();self.assertTrue(d['implementationBoundaries']['manualDeviationsWarnAndAllow']);self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator'])
  for path,digest in {**d['inputSha256'],**d['upstreamParserSha256']}.items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
  self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))
if __name__=='__main__':unittest.main()
