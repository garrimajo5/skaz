import copy,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-imr-secondary-headers.py'))
def observation(ident='7066',source='158'):
 return {'observationId':'dndsu:bestiary:'+ident,'observedName':'Warlock of the Fiend','sourceIds':[source],'readUrl':'https://dnd.su/'+('multiverse/' if source=='158' else '')+'bestiary/'+ident+'-warlock-of-the-fiend/','selectedFields':{'armorClass':13,'hitPoints':78,'challengeRating':'7','passivePerception':11,'walkingSpeedFeet':30,'armorClassWithMageArmor':16}}
def card(o,ac=13,buffed=16):
 path=o['readUrl'].replace('https://dnd.su','')
 return f'''<div class="card" data-id="{o['observationId'][6:]}" data-cardlink="{path}"><h2 class="card-title">Колдун [Warlock of the Fiend]<span class="source-plaque" title="{m['LABELS'][o['sourceIds'][0]]}">source</span></h2><ul class="params card__article-body"><li><strong>Класс Доспеха</strong> {ac} ({buffed} с доспехами мага)</li><li><strong>Хиты</strong> <span>78</span> (12к8+24)</li><li><strong>Скорость</strong> 30 футов</li><li><strong>Чувства</strong> тёмное зрение60 футов, пассивное Восприятие11</li><li><strong>Опасность</strong> 7 (2900 опыта)</li></ul></div>'''.replace('Восприятие11','Восприятие 11')
class SecondaryHeaderTests(unittest.TestCase):
 def test_exact_card_ignores_adjacent_version_even_if_first(self):
  o=observation();old=observation('639','111');page=card(old,12,15)+card(o)
  self.assertEqual(m['audit_observation'](page,o),6)
 def test_missing_target_does_not_fall_back_to_matching_name(self):
  with self.assertRaises(ValueError):m['audit_observation'](card(observation('639','111'),12,15),observation())
 def test_duplicate_target_rejected(self):
  o=observation()
  with self.assertRaises(ValueError):m['audit_observation'](card(o)*2,o)
 def test_source_label_and_card_path_required(self):
  o=observation()
  for page in [card(o).replace(m['LABELS']['158'],m['LABELS']['111']),card(o).replace("data-cardlink=\"/multiverse/", "data-cardlink=\"/")]:
   with self.assertRaises(ValueError):m['audit_observation'](page,o)
 def test_conditional_ac_cannot_replace_base_or_be_omitted(self):
  o=observation()
  for page in [card(o,16,16),card(o).replace('(16 с доспехами мага)','')]:
   with self.assertRaises(ValueError):m['audit_observation'](page,o)
 def test_duplicate_stat_field_rejected(self):
  o=observation();page=card(o).replace('</ul>','<li><strong>Хиты</strong>78</li></ul>')
  with self.assertRaises(ValueError):m['audit_observation'](page,o)
 def test_zero_speed_not_filled_from_later_card(self):
  o=observation();o['selectedFields']['walkingSpeedFeet']=0;page=card(o).replace('30 футов','0 футов, летая40 футов')+card(observation('639','111'),12,15)
  self.assertEqual(m['audit_observation'](page,o),6)
 def test_manifest_unchanged_and_wrong_expected_value_rejected(self):
  o=observation();before=copy.deepcopy(o);m['audit_observation'](card(o),o);self.assertEqual(o,before)
  o['selectedFields']['hitPoints']=80
  with self.assertRaises(ValueError):m['audit_observation'](card(o),o)
if __name__=='__main__':unittest.main()
