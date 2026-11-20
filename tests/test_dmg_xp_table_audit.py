import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-dmg-xp-table.py'))
# Independent factual table transcription, not generated from the manifest.
TABLE='''Monster XP
Ancient Black Dragon 33,000 [was 27,500]
Ancient Blue Dragon 50,000 [was 32,500]
Ancient Brass Dragon 25,000 [was 24,500]
Ancient Bronze Dragon 41,000 [was 30,000]
Ancient Copper Dragon 33,000 [was 27,500]
Ancient Gold Dragon 62,000 [was 36,500]
Ancient Green Dragon 41,000 [was 30,000]
Ancient Red Dragon 62,000 [was 36,500]
Ancient Silver Dragon 50,000 [was 32,500]
Ancient White Dragon 25,000 [was 24,500]'''
class DmgXpTableTests(unittest.TestCase):
 def manifest(self):return json.loads((ROOT/'catalog/dmg-appendix-xp-comparison-2014.json').read_text(encoding='utf-8-sig'))
 def test_all_ten_rows_preserve_old_and_corrected_values(self):
  rows=m['parse_table'](TABLE);self.assertEqual(m['audit'](self.manifest(),rows),10)
  self.assertEqual(rows[0]['primaryPreviousTableXp'],27500);self.assertEqual(rows[0]['primaryCorrectedTableXp'],33000)
 def test_missing_duplicate_or_extra_content_is_not_accepted(self):
  for text in [TABLE.rsplit('\n',1)[0],TABLE.replace('Ancient White','Ancient Black'),TABLE+'\nextra row',TABLE+' Monster XP',TABLE.replace('33,000','33000',1)]:
   with self.assertRaises(ValueError):m['parse_table'](text)
 def test_changed_number_or_swapped_history_fails_comparison(self):
  d=self.manifest()
  for text in [TABLE.replace('33,000','34,000',1),TABLE.replace('33,000 [was 27,500]','27,500 [was 33,000]')]:
   with self.assertRaises(ValueError):m['audit'](d,m['parse_table'](text))
 def test_secondary_mismatch_and_full_statblock_claim_are_not_hidden(self):
  rows=m['parse_table'](TABLE)
  for key,value in [('observedCurrentXp',27500),('fullStatBlockCompared',True),('canonicalId','made-up')]:
   d=self.manifest();d['records'][0][key]=value
   with self.assertRaises(ValueError):m['audit'](d,rows)
