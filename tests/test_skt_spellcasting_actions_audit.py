import copy
import json
import runpy
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
m = runpy.run_path(str(ROOT/'scripts/audit-skt-spellcasting-actions.py'))
# Synthetic, independently specified actions exercise parsing without publishing PDF text.
CASES = [
 (1,'Zephyros','Intelligence',17,11,'no material components'),
 (1,'Klauth','Charisma',22,None,'no material components'),
 (2,'Claugiyliamatar','Charisma',19,None,'no material components'),
 (2,'Turlang','Wisdom',15,None,'no material spell components'),
 (2,'Storvald','Wisdom',None,None,'no material components'),
 (2,'Sansuri','Intelligence',15,7,'no material components'),
 (2,'Slarkrethel','Intelligence',22,None,'no spell components'),
 (3,'Iymrith','Charisma',20,None,'no spell components'),
 (3,'Maegera','Charisma',19,None,'no material components'),
 (3,'The shaman','Wisdom',12,4,None),
 (4,'Naxene','Intelligence',13,5,None),
 (4,'Othovir','Charisma',13,5,None),
 (4,'The giant','Charisma',17,None,'no material spell components'),
]

def fixture():
 pages=['']*4
 for page,actor,ability,dc,attack,waiver in CASES:
  bundle=' (Requires a Sacred Bundle)' if actor=='The shaman' else ''
  if actor=='Maegera':
   action='Spellcasting. Maegera casts fireball (spell save DC 19), requiring no material components and using Charisma as the spellcasting ability.'
  else:
   req=('requiring '+waiver+' and ') if waiver else ''
   nums=(' (spell save DC '+str(dc)+(('; +'+str(attack)+' to hit with spell attacks') if attack is not None else '')+')') if dc else ''
   action=f'Spellcasting{bundle}. {actor} casts one of the following spells, {req}using {ability} as the spellcasting ability{nums}:\nAt will: mage hand\n1/day each: augury (cast as 1 action)'
  pages[page-1]+='[New] Synthetic section.\n'+action+'\n'
 return pages

class SpellcastingActionAuditTests(unittest.TestCase):
 def test_thirteen_actions_have_independent_fields_and_null_is_not_zero(self):
  rows=m['parse_actions'](fixture());self.assertEqual(len(rows),13)
  self.assertEqual(rows[0]['saveDc'],17);self.assertEqual(rows[0]['spellAttackBonus'],11)
  self.assertIsNone(rows[4]['saveDc']);self.assertIsNone(rows[4]['spellAttackBonus'])
  self.assertEqual(rows[-1]['bookPage'],256)
 def test_waivers_bundle_and_unstated_frequency_are_distinct(self):
  rows={r['actor']:r for r in m['parse_actions'](fixture())}
  self.assertEqual(rows['Iymrith']['componentWaiver'],'all-components')
  self.assertEqual(rows['Turlang']['componentWaiver'],'material-only')
  self.assertEqual(rows['The shaman']['componentWaiver'],'not-stated')
  self.assertTrue(rows['The shaman']['requiresSacredBundle'])
  self.assertEqual(rows['Maegera']['groups'][0]['frequency'],'not-stated')
 def test_local_overrides_and_pdf_line_wraps_preserve_names(self):
  pages=fixture();pages[0]=pages[0].replace('mage hand','Otiluke’s resilient sphere',1).replace('Intelligence','Intel-\nligence',1)
  pages[3]=pages[3].replace('mage hand','fire bolt (1d10 fire damage)',1)
  rows=m['parse_actions'](pages)
  self.assertEqual(rows[0]['groups'][0]['spells'][0]['name'],'Otiluke’s resilient sphere')
  self.assertEqual(rows[0]['groups'][1]['spells'][0]['override'],{'castingTime':'1 action'})
  self.assertEqual(rows[-3]['groups'][0]['spells'][0]['override'],{'damage':{'dice':'1d10','type':'fire'}})
 def test_missing_duplicate_unknown_and_wrong_page_actions_fail(self):
  for pages in [fixture()[:3],list(reversed(fixture())),[fixture()[0]+fixture()[0],*fixture()[1:]], [fixture()[0].replace('Zephyros casts','Unknown casts'),*fixture()[1:]]]:
   with self.assertRaises(ValueError):m['parse_actions'](pages)
 def test_unrecognized_group_duplicate_spell_or_unparsed_tail_fails(self):
  for replacement in ['mage hand, mage hand','mage hand (unknown override)','mage hand; extra','mage hand\n3/day each: light']:
   pages=fixture();pages[0]=pages[0].replace('mage hand',replacement,1)
   with self.assertRaises(ValueError):m['parse_actions'](pages)
 def test_free_text_after_frequencyless_action_is_not_silently_ignored(self):
  pages=fixture();pages[2]=pages[2].replace('ability.','ability. Another rule.',1)
  with self.assertRaises(ValueError):m['parse_actions'](pages)
 def test_audit_rejects_changed_numbers_and_acceptance(self):
  rows=m['parse_actions'](fixture())
  d={'accepted':False,'fullRulesVerified':False,'automaticPatch':False,'approvedDenominator':None,'actions':copy.deepcopy(rows)}
  self.assertEqual(m['audit'](d,rows),25)
  for key in ['accepted','fullRulesVerified','automaticPatch']:
   bad=copy.deepcopy(d);bad[key]=True
   with self.assertRaises(ValueError):m['audit'](bad,rows)
  d['actions'][0]['saveDc']=18
  with self.assertRaises(ValueError):m['audit'](d,rows)
 def test_existing_comparison_claims_are_checked_against_primary_parameters(self):
  d=json.loads((ROOT/'catalog/skt-spellcasting-action-evidence-2014.json').read_text(encoding='utf-8-sig'))
  c=[json.loads((ROOT/p).read_text(encoding='utf-8-sig')) for p in ['catalog/skt-selected-errata-comparison-2014.json','catalog/skt-appendix-errata-comparison-2014.json']]
  self.assertEqual(m['audit_comparisons'](d,c),10)
  bad=copy.deepcopy(c);bad[0]['records'][0]['selectedMatches']['saveDc']=18
  with self.assertRaises(ValueError):m['audit_comparisons'](d,bad)
  bad=copy.deepcopy(c);bad[0]['records'][0]['selectedMatches']['oneActionSpells']=[]
  with self.assertRaises(ValueError):m['audit_comparisons'](d,bad)
  bad=copy.deepcopy(c);bad[0]['records'][-1]['differences'][0]['primary']='intelligence'
  with self.assertRaises(ValueError):m['audit_comparisons'](d,bad)
