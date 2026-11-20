import copy
import json
import runpy
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
audit_module=runpy.run_path(str(ROOT/'scripts/audit-srd-adventuring-gear.py'))
HEADINGS=audit_module['HEADINGS']
extract=audit_module['extract_descriptions']
parameter=audit_module['extract_parameter']
OPENING='Adventuring Gear This section describes items that have special rules or require further explanation. '

def fixture():
    return OPENING+' '.join(name+'. Paragraph '+str(i)+' only.' for i,name in enumerate(HEADINGS))+' Adventuring Gear'

def parse(name,path,text):
    spec=next(spec for spec in audit_module['SPECS'] if spec[0]==name and spec[1]==path)
    return parameter(text,*spec)

class GearAuditTests(unittest.TestCase):
    def test_all_headings_bounded_even_when_pouch_occurs_in_component_pouch(self):
        descriptions=extract(fixture())
        self.assertEqual(len(descriptions),42)
        for i,name in enumerate(HEADINGS):self.assertEqual(descriptions[name],f'Paragraph {i} only.')
        self.assertNotEqual(descriptions['Pouch'],descriptions['Component Pouch'])

    def test_missing_duplicate_reordered_boundaries_fail(self):
        for mutated in [fixture().replace('Acid.','Not Acid:'),fixture().replace('Acid.','Acid. Acid.'),fixture().replace('Acid.','TOKEN.').replace('Antitoxin.','Acid.').replace('TOKEN.','Antitoxin.'),fixture().removeprefix(OPENING),fixture()+' Adventuring Gear']:
            with self.subTest(mutated=mutated[:65]):
                with self.assertRaises(ValueError):extract(mutated)

    def test_reads_source_values_instead_of_fixed_constants(self):
        self.assertEqual(parse('Acid','damage.dice','On a hit, the target takes 3d8 acid damage.'),'3d8')
        self.assertEqual(parse('Candle','light.brightFeet','It sheds brig ht light in a 35-\u00ad‐‑foot radius.'),35)
        self.assertEqual(parse('Holy Water','creation.spellSlotLevel','requires the caster to expend a 2st --level spell slot.'),2)
        self.assertEqual(parse('Hunting Trap','escape.dc','make a DC 19 Strength check'),19)
        self.assertEqual(parse('Lantern, Bullseye','light.brightFeet','bright light in a 90-foot cone'),90)

    def test_roll_type_shape_and_timing_are_not_interchangeable(self):
        bad=[('Alchemist’s Fire','endEffect.dc','DC 10 Dexterity saving throw to extinguish'),('Alchemist’s Fire','damage.dice','takes 1d4 fire damage at the end of each of its turns'),('Ball Bearings','save.dc','DC 10 Dexterity check'),('Lantern, Bullseye','light.brightFeet','bright light in a 60-foot radius')]
        for name,path,text in bad:
            with self.subTest(name=name,path=path):
                with self.assertRaises(ValueError):parse(name,path,text)

    def test_missing_or_duplicate_values_fail_and_do_not_borrow_from_next_heading(self):
        for text in ['takes no acid damage','takes 2d6 acid damage; takes 3d6 acid damage']:
            with self.assertRaises(ValueError):parse('Acid','damage.dice',text)
        desc=extract(fixture().replace('Alchemist’s Fire.','Alchemist’s Fire. takes 2d6 acid damage.'))
        with self.assertRaises(ValueError):parse('Acid','damage.dice',desc['Acid'])

    def test_unknown_and_duplicate_item_links_fail_before_source_comparison(self):
        load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))
        manifest=load('srd51-adventuring-gear-conditions-2014.json');ids=load('equipment-identity-reconciliation.json')
        for replacement in ['srd51:2014:item:invented-item',manifest['records'][1]['candidateItemIds'][0]]:
            altered=copy.deepcopy(manifest);altered['records'][0]['candidateItemIds'][0]=replacement
            with self.assertRaisesRegex(ValueError,'item link'):audit_module['audit'](altered,{},ids)
        swapped=copy.deepcopy(manifest)
        swapped['records'][0]['candidateItemIds'],swapped['records'][1]['candidateItemIds']=swapped['records'][1]['candidateItemIds'],swapped['records'][0]['candidateItemIds']
        with self.assertRaisesRegex(ValueError,'name/identity'):audit_module['audit'](swapped,{},ids)
        altered=copy.deepcopy(manifest);altered['records'][0]['runtimeImported']=True
        with self.assertRaisesRegex(ValueError,'runtime'):audit_module['audit'](altered,{},ids)

if __name__=='__main__':unittest.main()
