import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-mm-selected-conditions.py'))
DATA=json.loads((ROOT/'catalog/mm-selected-errata-conditions-2014.json').read_text(encoding='utf-8'))
SCOPE=json.loads((ROOT/'catalog/scope-register-2014.json').read_text(encoding='utf-8'))
S={
'Banshee':'is now "creatures up to 5 miles away that aren\'t undead or constructs"',
'Doppelganger':'In the first round of a combat, the doppelganger has advantage on attack rolls against any creature it surprised',
'Kenku':'In the first round of a combat, the kenku has advantage on attack rolls against any creature it surprised',
'Intellect Devourer':'that isn\'t protected by protection from evil and good; is now "the host body dies"',
'Lich':'"living creature" is now "nonundead creature."',
'Otyugh':'Tentacle slam: Constitution saving throw [was Strength saving throw]',
'Rakshasa':'can\'t be affected or detected by spells of 6th level or lower unless it wishes to be',
'Revenant':'is changed to "animates another humanoid corpse."',
'Thri-kreen':'The poisoned target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success',
'Water Elemental':'Whelm: added the word "check" after "DC 14 Strength" in the final sentence',
'Werewolf':'Multiattack (Humanoid or Hybrid Form Only): two with its spear (humanoid form) or one with its bite and one with its claws (hybrid form)',
'Ettercap':'Web: the webbing is vulnerable to fire damage and immune to bludgeoning damage'}
def pages():
 p=['','']
 for name,(book,pdf) in m['LOCATORS'].items():p[pdf-1]+=name+' (p. '+str(book)+'). '+S[name]+'.\n'
 return p
class ConditionTests(unittest.TestCase):
 def test_selected_conditions_and_missing_round_are_distinct(self):
  self.assertEqual(m['audit'](DATA,S,SCOPE),{'primaryConditions':12,'secondaryMatches':10,'secondaryDifferences':1,'secondaryUnverified':1})
 def test_whelm_check_does_not_become_saving_throw(self):
  d=copy.deepcopy(DATA);next(r for r in d['records'] if r['primaryName']=='Water Elemental')['primarySelectedConditions']['rollKind']='saving-throw'
  with self.assertRaises(ValueError):m['audit'](d,S,SCOPE)
 def test_otyugh_strength_is_old_not_current_save(self):
  d=dict(S);d['Otyugh']=d['Otyugh'].replace('Constitution saving throw [was Strength','Strength saving throw [was Constitution')
  with self.assertRaises(ValueError):m['audit'](DATA,d,SCOPE)
 def test_missing_round_not_filled_from_another_ability(self):
  d=copy.deepcopy(DATA);r=next(r for r in d['records'] if r['primaryName']=='Doppelganger');r['comparison']='selected-conditions-match'
  with self.assertRaises(ValueError):m['audit'](d,S,SCOPE)
 def test_unread_secondary_cannot_be_called_match(self):
  d=copy.deepcopy(DATA);next(r for r in d['records'] if r['primaryName']=='Rakshasa')['comparison']='selected-conditions-match'
  with self.assertRaises(ValueError):m['audit'](d,S,SCOPE)
 def test_negation_and_optional_willingness_are_required(self):
  for name,old,new in [('Banshee',"aren't",'are'),('Intellect Devourer',"isn't",'is'),('Rakshasa','unless it wishes to be','always'),('Revenant','humanoid corpse','corpse')]:
   with self.assertRaises(ValueError):m['parse_condition'](name,S[name].replace(old,new))
 def test_poisoned_target_turn_and_forms_cannot_be_swapped(self):
  for name,old,new in [('Thri-kreen','poisoned target','any target'),('Thri-kreen','end of each','start of each'),('Werewolf','two with its spear','two with its claws'),('Ettercap','webbing','creature')]:
   with self.assertRaises(ValueError):m['parse_condition'](name,S[name].replace(old,new))
 def test_line_break_space_before_hyphen_and_quoted_punctuation(self):
  p=pages();p[1]=p[1].replace('creature it','crea -\nture it');parsed=m['sections'](p)
  self.assertEqual(m['audit'](DATA,parsed,SCOPE)['primaryConditions'],12)
 def test_boolean_not_equal_to_integer_one(self):
  d=copy.deepcopy(DATA);next(r for r in d['records'] if r['primaryName']=='Kenku')['primarySelectedConditions']['attackRollAdvantage']=1
  with self.assertRaises(ValueError):m['audit'](d,S,SCOPE)
 def test_duplicate_or_missing_headings_fail(self):
  p=pages();p[0]+='Banshee (p. 23). '+S['Banshee']
  with self.assertRaises(ValueError):m['sections'](p)
  p=pages();p[0]=p[0].replace('Banshee (p. 23).','Unknown (p. 23).')
  with self.assertRaises(ValueError):m['sections'](p)
 def test_full_ability_promotion_and_wrong_id_fail(self):
  for change in [lambda d:d['records'][0].update(fullAbilityVerified=True),lambda d:d['records'][0].update(observationId='dndsu:bestiary:208'),lambda d:d.update(accepted=True)]:
   d=copy.deepcopy(DATA);change(d)
   with self.assertRaises(ValueError):m['audit'](d,S,SCOPE)
if __name__=='__main__':unittest.main()
