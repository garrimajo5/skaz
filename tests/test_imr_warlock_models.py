import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-imr-warlock-models.py'))
OLD='Врождённое колдовство. Харизма, без материальных компонентов. Неограниченно: доспехи [mage armor] (только на себя). 1/день каждое: врата [arcane gate], зрение [true seeing]. Использование заклинаний. Колдун является заклинателем 14-го уровня. Харизма (Сл спасброска от заклинания 15, +7 к попаданию атаками заклинаниями). Он восстанавливает свои ячейки заклинаний после короткого или продолжительного отдыха. 1–5 уровни (3 ячейки 5-го уровня): мысли [detect thoughts], дверь [dimension door]. Шепчущая аура. остальное'
NEW='Использование заклинаний. Колдун накладывает одно из следующих заклинаний, используя Харизму (Сл спасброска от заклинаний 15): Неограниченно: доспехи [mage armor] (только на себя); 1/день каждое: врата [arcane gate], мысли [detect thoughts], зрение [true seeing]. Описание остальное'
class ModelTests(unittest.TestCase):
 def test_two_budgets_stay_separate(self):
  r=m['parse_model'](OLD,True,['detect thoughts','dimension door']);self.assertEqual(r['slotPool'],{'count':3,'level':5,'recharge':['short-rest','long-rest']});self.assertEqual(r['dailySpellAbility'],'innate-spellcasting');self.assertEqual(r['dailyUsesPerSpell'],1);self.assertEqual(r['dailySpells'],['arcane gate','true seeing'])
 def test_new_model_has_unknown_slots_not_zero_or_legacy(self):
  r=m['parse_model'](NEW,False,[]);self.assertIsNone(r['slotPool']);self.assertIsNone(r['casterLevel']);self.assertIsNone(r['spellAttackBonus']);self.assertIsNone(r['innateMaterialsWaived']);self.assertIn('detect thoughts',r['dailySpells'])
 def test_short_rest_condition_cannot_disappear(self):
  with self.assertRaises(ValueError):m['parse_model'](OLD.replace('короткого или ',''),True,['detect thoughts'])
 def test_slot_spell_cannot_come_from_innate_list(self):
  with self.assertRaises(ValueError):m['parse_model'](OLD,True,['arcane gate'])
 def test_self_only_and_at_will_required(self):
  for text in [NEW.replace('(только на себя)',''),NEW.replace('Неограниченно:','3/день:'),NEW.replace('Неограниченно: доспехи [mage armor] (только на себя);','Неограниченно: другое;').replace('зрение [true seeing]','доспехи [mage armor] (только на себя)')]:
   with self.assertRaises(ValueError):m['parse_model'](text,False,[])
 def test_daily_each_not_shared_pool(self):
  with self.assertRaises(ValueError):m['parse_model'](NEW.replace('1/день каждое:','1/день всего:'),False,[])
 def test_new_model_rejects_imported_slots(self):
  with self.assertRaises(ValueError):m['parse_model'](NEW.replace('Неограниченно:', '3 ячейки. Неограниченно:'),False,[])
  with self.assertRaises(ValueError):m['parse_model'](NEW,False,['detect thoughts'])
 def test_duplicate_casting_or_spell_rejected(self):
  for text in [NEW+NEW,NEW.replace('зрение [true seeing]','зрение [true seeing], мысли [detect thoughts]')]:
   with self.assertRaises(ValueError):m['parse_model'](text,False,[])
 def test_fixed_witness_values_and_unknowns_match_manifest(self):
  d=json.loads((ROOT/'catalog/imr-warlock-models-2014.json').read_text(encoding='utf-8'))
  self.assertEqual(m['parse_model'](OLD,True,['detect thoughts','dimension door']),d['records'][0]['selectedModel'])
  self.assertEqual(m['parse_model'](NEW,False,[]),d['records'][2]['selectedModel'])
if __name__=='__main__':unittest.main()
