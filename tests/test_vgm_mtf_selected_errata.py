import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-vgm-mtf-selected-errata.py'))
DATA=json.loads((ROOT/'catalog/vgm-mtf-selected-errata-2014.json').read_text(encoding='utf-8'))
SCOPE=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8'))
VGM={'Kobold Scale Sorcerer':'It regains all its spent sorcery points when it finishes a long rest.','Neogi Master':'the parentheses is now "11d8 + 22."','Yuan-ti Mind Whisperer':'Wisdom score is now 14.','Champion':'"Light Crossbow" is now "Shortbow." Damage is now "5 (1d6 + 2)."','Conjurer':'the cantrips now have no asterisks.','Evoker':'is now "forces other creatures it can see to make a saving throw."','Grassland Creatures':'In the Flind entry, Challenge is now "9 (5,000 XP)."','Hill Creatures':'In the Flind entry, Challenge is now "9 (5,000 XP)."'}
MTF={'Orcus':'In Orcus\'s first lair action, "(save DC 23)" has been removed.','Red Abishai':'bite attack "(5d10 + 6)" has changed to "(3d10 + 6)".','Hellfire Engine':"flesh-crushing stride. On a successful save, the creature is pushed to the nearest space out of the hellfire engine's path.",'Zariel':'javelin attack is now "reach 10 ft. or range 30/120 ft."'}
def text(source,values):return '\n'.join(name+' (p. '+str(m['LOCATORS'][source][name])+'). '+value for name,value in values.items())
class PrimaryErrataTests(unittest.TestCase):
 def test_twelve_units_eleven_candidates(self):
  self.assertEqual(m['audit'](DATA,{'vgtm':VGM,'mtf':MTF},SCOPE),{'correctionUnits':12,'distinctCreatureCandidates':11,'environmentUnits':2})
 def test_actual_heading_structure_drop_caps_and_newline_hyphens(self):
  self.assertEqual(set(m['sections'](text('vgtm',VGM),'vgtm')),set(VGM))
  parsed=m['sections'](text('mtf',MTF).replace('Orcus (','O rcus (').replace('Red Abishai (','R ed Abishai (').replace('Zariel (','Z ariel (').replace('engine\'s','en -\ngine\'s'),'mtf')
  self.assertEqual(m['fields']('Hellfire Engine',parsed['Hellfire Engine']),DATA['records'][10]['primarySelectedCorrection'])
 def test_old_bite_dice_not_new_value(self):
  self.assertEqual(m['fields']('Red Abishai',MTF['Red Abishai']),{'biteDamageDice':'3d10+6'})
 def test_dropping_conditions_rejected(self):
  for name,old,new in [('Orcus','first lair','second lair'),('Hellfire Engine','successful','failed'),('Evoker','saving throw','ability check'),('Kobold Scale Sorcerer','long rest','short rest')]:
   with self.assertRaises(ValueError):m['fields'](name,{**VGM,**MTF}[name].replace(old,new))
 def test_environment_is_not_extra_creature(self):
  d=copy.deepcopy(DATA);d['records'][6]['unitKind']='named-stat-block-correction'
  with self.assertRaises(ValueError):m['audit'](d,{'vgtm':VGM,'mtf':MTF},SCOPE)
 def test_mixed_source_or_canonical_promotion_rejected(self):
  for edit in [lambda d:d['records'][0]['observationCandidate'].update(sourceIds=['158']),lambda d:d['records'][0].update(secondaryCompared=True),lambda d:d['records'][0].update(canonicalId='x'),lambda d:d.update(accepted=True),lambda d:d['records'].pop()]:
   d=copy.deepcopy(DATA);edit(d)
   with self.assertRaises(ValueError):m['audit'](d,{'vgtm':VGM,'mtf':MTF},SCOPE)
 def test_wrong_location_duplicate_and_missing_headings_rejected(self):
  for s in [text('mtf',MTF).replace('(p. 152)','(p. 153)'),text('mtf',MTF)+'\nOrcus (p. 152). duplicate',text('mtf',{k:v for k,v in MTF.items() if k!='Orcus'})]:
   with self.assertRaises(ValueError):m['sections'](s,'mtf')
 def test_inputs_not_mutated(self):
  before=copy.deepcopy(DATA);m['audit'](DATA,{'vgtm':VGM,'mtf':MTF},SCOPE);self.assertEqual(DATA,before)
if __name__=='__main__':unittest.main()
