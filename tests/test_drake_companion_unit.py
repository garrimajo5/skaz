import copy,json,runpy,unittest,tempfile,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
module=runpy.run_path(str(ROOT/'scripts/audit-drake-companion-unit.py'))
audit,verify_captures=module['audit'],module['verify_captures']
class DrakeUnitTests(unittest.TestCase):
 def setUp(self):
  self.p=json.loads((ROOT/'catalog/drake-companion-unit-proposal-2014.json').read_text(encoding='utf-8-sig'))
  self.s=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8-sig'))
  self.h={}
  for m,ru in zip(self.p['members'],['Маленький','Средний','Большой']):
   self.h[m['observationId']]=f'''<div class="card" data-id="{m['observationId'][6:]}" data-cardlink="{m['url'].replace('https://dnd.su','')}"><h2 class="card-title">Дрейк [Drake Companion]<span class="source-plaque" title="Fizban's Treasury of Dragons">FTD</span></h2><ul class="params card__article-body"><li>{ru} Дракон</li><li>Спутник архетипа следопыта наездник {m['rangerLevelThreshold']}-го уровня.</li></ul></div>'''
  self.primary='<ul><li>Drake Companion (3rd level): Small companion.</li><li>Bond of Fang and Scale (7th level): Medium companion.</li><li>Perfected Bond (15th level): Large companion.</li></ul>'
 def run_audit(self):return audit(self.p,self.s,self.h,self.primary)
 def test_three_pages_are_not_three_creatures_or_accepted_units(self):
  self.assertEqual(self.run_audit(),{'observations':3,'proposedEntities':1,'proposedStates':3,'accepted':False})
 def test_missing_duplicate_and_reassigned_members_fail(self):
  for change in [lambda p:p['members'].pop(),lambda p:p['members'].__setitem__(1,p['members'][0]),lambda p:p['members'][0].update(rangerLevelThreshold=7),lambda p:p['members'][0].update(countsAsSeparateCreature=True)]:
   original=copy.deepcopy(self.p);change(self.p)
   with self.assertRaises(ValueError):self.run_audit()
   self.p=original
 def test_wrong_source_and_wrong_card_fail(self):
  ident=self.p['members'][0]['observationId'];original=self.h[ident]
  for old,new in [("Fizban's Treasury of Dragons",'Unearthed Arcana'),('bestiary:4842','bestiary:14130'),('Маленький','Большой'),('3-го уровня','7-го уровня')]:
   self.h[ident]=original.replace(old,new)
   with self.assertRaises(ValueError):self.run_audit()
  self.h[ident]=original
 def test_adjacent_card_does_not_replace_target_and_duplicate_fails(self):
  ident=self.p['members'][0]['observationId'];original=self.h[ident]
  self.h[ident]=original.replace('bestiary:4842','bestiary:other').replace('3-го уровня','19-го уровня')+original
  self.assertEqual(self.run_audit()['observations'],3)
  self.h[ident]=original+original
  with self.assertRaises(ValueError):self.run_audit()
 def test_missing_or_changed_official_state_fails(self):
  original=self.primary
  for new in [original.replace('Medium','Small'),original.replace('7th','9th'),original+original]:
   self.primary=new
   with self.assertRaises(ValueError):self.run_audit()
 def test_preview_and_acceptance_cannot_be_promoted(self):
  for change in [lambda p:p.update(accepted=True),lambda p:p.update(canonicalId='invented'),lambda p:p.update(approvedDenominator=1),lambda p:p.update(automaticMerge=True),lambda p:p['previewCaution'].update(usedForFinalParameters=True)]:
   original=copy.deepcopy(self.p);change(self.p)
   with self.assertRaises(ValueError):self.run_audit()
   self.p=original
 def test_capture_set_is_exhaustive_unique_and_hashes_every_file(self):
  with tempfile.TemporaryDirectory() as td:
   directory=Path(td)
   for row in self.p['captures']:
    data=row['capture'].encode();(directory/row['capture']).write_bytes(data);row['sha256']=hashlib.sha256(data).hexdigest()
   verify_captures(self.p,directory)
   for change in [lambda p:p['captures'].pop(),lambda p:p['captures'].__setitem__(1,p['captures'][0]),lambda p:p['captures'][0].update(resolvedUrl='https://wrong.example/'),lambda p:p['captures'][0].update(sha256='0'*64)]:
    changed=copy.deepcopy(self.p);change(changed)
    with self.assertRaises(ValueError):verify_captures(changed,directory)
   (directory/'4842.html').write_bytes(b'changed')
   with self.assertRaises(ValueError):verify_captures(self.p,directory)
 def test_inputs_not_mutated(self):
  before=copy.deepcopy((self.p,self.s,self.h,self.primary));self.run_audit();self.assertEqual((self.p,self.s,self.h,self.primary),before)
if __name__=='__main__':unittest.main()
