import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
audit=runpy.run_path(str(ROOT/'scripts/audit-mixed-script-names.py'))['audit']
def primary(name,url,source):
 return '<div class="monster-name"><a href="'+url+'">'+name+'</a><span class="source">'+source+'</span></div>'
def card(ident,name):return '<div class="card" data-id="'+ident+'"><h2 class="card-title">['+name+']</h2></div>'
class MixedNames(unittest.TestCase):
 def setUp(self):
  self.m=json.loads((ROOT/'catalog/mixed-script-name-evidence-2014.json').read_text(encoding='utf-8'))
  self.s=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8'))
  self.d=json.loads((ROOT/'catalog/observed-name-review-2014.json').read_text(encoding='utf-8'))
  self.h={'nilbog-index':primary('Nilbog','/monsters/17292-nilbog',"Volo's Guide to Monsters")+primary('Nilbog','/monsters/2560889-nilbog','Mordenkainen Presents: Monsters of the Multiverse'),'cranium-index':primary('Cranium Rat Squeaker Swarm','/monsters/3883523-cranium-rat-squeaker-swarm','Planescape: Adventures in the Multiverse'),'568':card('bestiary:6883','Nilbog'),'6883':card('bestiary:6883','Nilbog'),'13077':card('bestiary:13077','\u0421ranium rat squeaker swarm'),'20456':card('bestiary:20456','Swarm of \u0421reeping \u0421oins'),'6459':card('items:6459','Prehistoric Figurines of Wondrous Power'),'figurines-article':'<h2>Prehistoric Figurines of Wondrous Power</h2><ul><li>Carnelian Triceratops (Very Rare)</li><li>Jasper Tyrannosaurus Rex (Legendary)</li><li>Kyanite Pteranodon (Rare)</li><li>Pyrite Plesiosaurus (Uncommon)</li></ul>'}
 def run_audit(self):return audit(self.m,self.s,self.d,self.h)
 def test_preserves_unresolved_rows_and_originals(self):
  before=copy.deepcopy((self.m,self.s,self.d,self.h));result=self.run_audit()
  self.assertEqual(result,dict(diagnostics=5,primaryNames=4,exactSecondaryHeadings=4,primarySupportedWithExactSecondaryHeading=3,pendingPrimaryNames=1,missingLegacySecondaryCards=1,proposedFigurineVariants=4,canonicalAccepted=0));self.assertEqual(before,(self.m,self.s,self.d,self.h))
 def test_missing_legacy_card_is_not_replaced_with_modern_heading(self):
  self.h['568']=card('bestiary:568','Nilbog')
  with self.assertRaisesRegex(ValueError,'stale'):self.run_audit()
 def test_wrong_primary_version_rejected(self):
  self.h['nilbog-index']=self.h['nilbog-index'].replace("Volo's Guide to Monsters",'Mordenkainen Presents: Monsters of the Multiverse')
  with self.assertRaisesRegex(ValueError,'version'):self.run_audit()
 def test_partial_name_not_a_witness(self):
  self.h['cranium-index']=self.h['cranium-index'].replace('>Cranium Rat Squeaker Swarm<','>Cranium Rat Squeaker<')
  with self.assertRaisesRegex(ValueError,'name/version'):self.run_audit()
 def test_duplicate_and_missing_diagnostics_fail(self):
  self.m['records'][1]=copy.deepcopy(self.m['records'][0])
  with self.assertRaisesRegex(ValueError,'Diagnostics'):self.run_audit()
 def test_no_automatic_transliteration_for_pending_coins(self):
  next(r for r in self.m['records'] if r['observationId'].endswith(':20456'))['proposedEnglishName']='Swarm of Creeping Coins'
  with self.assertRaisesRegex(ValueError,'Unsupported'):self.run_audit()
 def test_no_silent_identity_acceptance(self):
  self.m['records'][0]['identityAccepted']=True
  with self.assertRaisesRegex(ValueError,'identity'):self.run_audit()
 def test_variant_inventory_missing_duplicate_or_wrong_rarity_fails(self):
  self.h['figurines-article']=self.h['figurines-article'].replace('<li>Pyrite Plesiosaurus (Uncommon)</li>','')
  with self.assertRaises(ValueError):self.run_audit()
 def test_unrelated_original_fields_are_not_rewritten(self):
  self.m['records'][0]['sourceIds']=['169']
  with self.assertRaisesRegex(ValueError,'Original'):self.run_audit()
if __name__=='__main__':unittest.main()
