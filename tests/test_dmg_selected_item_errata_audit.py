import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-dmg-selected-item-errata.py'))
class DmgItemErrataAuditTests(unittest.TestCase):
 def manifest(self):return json.loads((ROOT/'catalog/dmg-selected-item-errata-2014.json').read_text(encoding='utf-8-sig'))
 def rows(self,d):return [{k:r[k] for k in ('primaryHeading','bookPage','primaryFields')} for r in d['records']]
 def test_empty_incomplete_or_reordered_headings_fail_before_fields_are_accepted(self):
  for value in ['', 'Amulet of Health (p. 150). Constitution is19', 'Spell Scroll (p. 200). Amulet of Health (p. 150).']:
   with self.assertRaises(ValueError):m['parse_items'](value)
 def test_missing_or_ambiguous_numeric_witnesses_fail(self):
  self.assertEqual(m['capture'](r'DC (\d+)','DC 15'),'15')
  for value in ['DC unknown','DC 15 and DC 17']:
   with self.assertRaises(ValueError):m['capture'](r'DC (\d+)',value)
 def test_changed_primary_fields_or_page_do_not_match_the_manifest(self):
  d=self.manifest();rows=self.rows(d);self.assertEqual(m['audit'](d,rows),11)
  rows[0]=copy.deepcopy(rows[0]);rows[0]['primaryFields']['noEffectWhenWithoutItemAtLeast']=20
  with self.assertRaises(ValueError):m['audit'](d,rows)
  rows=self.rows(d);rows[0]=copy.deepcopy(rows[0]);rows[0]['bookPage']=151
  with self.assertRaises(ValueError):m['audit'](d,rows)
 def test_timeout_cannot_be_reported_as_secondary_match(self):
  d=self.manifest();rows=self.rows(d);r=next(r for r in d['records'] if r['observationId']=='dndsu:items:108');r['secondaryFieldsMatched']=True
  with self.assertRaises(ValueError):m['audit'](d,rows)
 def test_whole_item_acceptance_and_edition_changes_are_rejected(self):
  for field in ['accepted','fullRulesVerified','wholeItemCompared','automaticPatch']:
   d=self.manifest();rows=self.rows(d);d['records'][0][field]=True
   with self.assertRaises(ValueError):m['audit'](d,rows)
  d=self.manifest();rows=self.rows(d);d['ruleset']='5e-2024'
  with self.assertRaises(ValueError):m['audit'](d,rows)
 def test_interrupting_cast_is_not_failed_check_or_copying(self):
  d=self.manifest();scroll=next(r for r in d['records'] if r['observationId']=='dndsu:items:210')['primaryFields']
  self.assertFalse(scroll['consumedOnInterruptedCasting']);self.assertTrue(scroll['consumedAfterCasting'])
  self.assertNotIn('consumedOnFailedCheck',scroll);self.assertNotIn('consumedOnCopying',scroll)
  pearl=next(r for r in d['records'] if r['observationId']=='dndsu:items:50')['primaryFields'];self.assertEqual((pearl['expendedLevelAtLeast'],pearl['recoveredLevelForThatCase']),(4,3))
