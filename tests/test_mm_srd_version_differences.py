import copy, importlib.util, json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('version_audit',ROOT/'scripts/audit-mm-srd-version-differences.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class SourceVersionTests(unittest.TestCase):
 def setUp(self):
  self.data=json.loads((ROOT/'catalog/mm-srd-version-differences-2014.json').read_text(encoding='utf-8-sig'))
  self.catalogs={p:json.loads((ROOT/p).read_text(encoding='utf-8-sig')) for p in self.data['inputSha256']}
  # Independent minimal source excerpts test parsing; CLI separately verifies the pinned PDFs.
  self.pages={'srd':{401:'Priest Medium humanoid Speed 25 ft. Skills Religion +4 Challenge 2 (450 XP)',325:'Lich Medium undead Skills Arcana +18 Challenge 21 (33,000 XP)'},'mm':{2:'Lich (p. 202). Skills: Arcana +19 [was +18]. Magmin (p. 212). Touch: target. Priest (p. 348). Speed: 30 ft. [was 25 ft.]. Skills: Religion +5 [was +4]. Purple Worm (p. 255). Bite: +14.'}}
 def run_audit(self):return m.audit(self.data,self.pages,self.catalogs)
 def test_real_entries_match_declared_source_and_inputs_unchanged(self):
  before=copy.deepcopy((self.data,self.pages,self.catalogs));self.assertEqual(self.run_audit(),(2,3));self.assertEqual(before,(self.data,self.pages,self.catalogs))
 def test_wrong_primary_value_rejected(self):
  self.pages['srd'][401]=self.pages['srd'][401].replace('25 ft.','30 ft.')
  with self.assertRaises(ValueError):self.run_audit()
 def test_old_errata_bracket_not_new_value(self):
  self.pages['mm'][2]=self.pages['mm'][2].replace('Arcana +19','Arcana +18')
  with self.assertRaises(ValueError):self.run_audit()
 def test_neighbor_statblock_does_not_supply_missing_speed(self):
  self.pages['srd'][401]='Noble Medium humanoid Speed 30 ft. Challenge 1 (200 XP) Priest Medium humanoid Skills Religion +4 Challenge 2 (450 XP)'
  with self.assertRaises(ValueError):self.run_audit()
 def test_wrong_existing_source_rejected(self):
  # Locate the intended entry explicitly; ordering is not part of source identity.
  e=next(e for e in self.catalogs['catalog/srd51-npc-roles.json']['entries'] if e['id'].endswith(':priest'));e['source']['url']='other'
  with self.assertRaises(ValueError):self.run_audit()
 def test_duplicate_record_rejected(self):
  self.data['records'].append(copy.deepcopy(self.data['records'][0]))
  with self.assertRaises(ValueError):self.run_audit()
 def test_silent_upgrade_rejected(self):
  e=next(e for e in self.catalogs['catalog/srd51-npc-roles.json']['entries'] if e['id'].endswith(':priest'));e['monster']['speed']['walk']=30
  with self.assertRaises(ValueError):self.run_audit()
 def test_completion_claim_rejected(self):
  self.data['complete']=True
  with self.assertRaises(ValueError):self.run_audit()
 def test_wrong_location_rejected(self):
  self.data['records'][0]['srdPage']=400
  with self.assertRaises(ValueError):self.run_audit()
if __name__=='__main__':unittest.main()
