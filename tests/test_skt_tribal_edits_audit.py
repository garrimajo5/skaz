import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-skt-tribal-edits.py'))
EXPECTED={'removals':{'Black Lion':['animate dead'],'Black Raven':['feather fall'],'Griffon':['feather fall'],'Sky Pony':['feather fall','divine favor'],'Elk':['expeditious retreat'],'Great Worm':['divine favor'],'Red Tiger':['beast sense'],'Thunderbeast':['stoneskin'],'Tree Ghost':['druidcraft','plant growth']},'replacement':{'Sky Pony':['gust of wind','witch bolt']},'additions':{'Griffon':[{'spell':'beast sense','before':'fly'}]},'overrides':{'Black Raven':{'polymorph':{'target':'self only; raven only'}},'Elk':{'find steed':{'castingTime':'1 action','form':'elk only'}},'Griffon':{'beast sense':{'target':'birds only'}}},'claimSpellsPerTribe':2,'castingTimeOverride':'1 action'}
class TribalEditAuditTests(unittest.TestCase):
 def manifest(self):return json.loads((ROOT/'catalog/skt-tribal-spell-reconstruction-2014.json').read_text(encoding='utf-8-sig'))
 def test_nested_commas_do_not_split_one_spell_into_multiple_instructions(self):
  self.assertEqual(m['split_outside_parentheses']('first (One, Two), second (Three)'),['first (One, Two)','second (Three)'])
  for value in ['first (One','first One)']:
   with self.assertRaises(ValueError):m['split_outside_parentheses'](value)
 def test_explicit_removals_are_eleven_even_when_full_replacement_discards_another_name(self):
  self.assertEqual(m['audit'](self.manifest(),EXPECTED),11)
 def test_unsupported_deletion_to_force_two_spells_is_rejected(self):
  d=self.manifest();d['tribes'][0]['remove'].append('chill touch')
  with self.assertRaisesRegex(ValueError,'Removal scope'):m['audit'](d,EXPECTED)
 def test_replacement_insert_position_and_target_restriction_cannot_drift(self):
  mutations=[lambda d:d['tribes'][7]['replaceWith'].append('lightning bolt'),lambda d:d['tribes'][6]['add'][0].update(before='other'),lambda d:d['tribes'][1]['primaryOverrides']['polymorph'].update(target='any target')]
  for mutate in mutations:
   d=self.manifest();mutate(d)
   with self.assertRaises(ValueError):m['audit'](d,EXPECTED)
 def test_incomplete_source_or_claims_fail_closed(self):
  with self.assertRaises(ValueError):m['parse_edits']('Uthgardt Shaman: some changes')
  for key,value in [('accepted',True),('primaryClaimSpellsPerTribe',3),('primaryCastingTimeOverride','1 minute')]:
   d=self.manifest();d[key]=value
   with self.assertRaises(ValueError):m['audit'](d,EXPECTED)
