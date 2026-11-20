import copy
import json
import runpy
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
s=runpy.run_path(str(ROOT/'scripts/audit-srd-container-capacities.py'))
parse=s['parse_capacity'];table=s['parse_table']
FIXTURE='''Container Capacity Container Capacity
Backpack* 1 cubic foot/30 pounds of gear
Barrel 40 gallons liquid, 4 cubic feet solid
Basket 2 cubic feet/40 pounds of gear
Bottle 1½ pints liquid
Bucket 3 gallons liquid, 1/2 cubic foot solid
Chest 12 cubic feet/300 pounds of gear
Flask or tankard 1 pint liquid
Jug or pitcher 1 gallon liquid
Pot, iron 1 gallon liquid
Pouch 1/5 cubic foot/6 pounds of gear
Sack 1 cubic foot/30 pounds of gear
Vial 4 ounces liquid
Waterskin 4 pints liquid
* You can also strap items, such as a bedroll or a coil of rope, to the outside of a backpack.
Equipment Packs'''
class ContainerCapacityTests(unittest.TestCase):
    def test_fraction_and_liquid_units_are_not_mass(self):
        self.assertEqual(parse('1½ pints liquid')[0][0],{'amount':1.5,'unit':'pint','content':'liquid'})
        self.assertEqual(parse('1/5 cubic foot/6 pounds of gear')[0][0]['amount'],0.2)
        self.assertEqual(parse('4 ounces liquid')[0][0]['unit'],'fluid-ounce')
        self.assertEqual(parse('3 gallons liquid, 1/2 cubic foot solid')[0][1]['amount'],0.5)
    def test_paired_dimensions_and_content_alternatives_are_distinct(self):
        self.assertEqual(parse('2 cubic feet/40 pounds of gear')[1],'paired-volume-and-weight')
        self.assertEqual(parse('40 gallons liquid, 4 cubic feet solid')[1],'alternative-content')
        self.assertEqual(parse('8 pints liquid')[0][0]['amount'],8)
    def test_missing_duplicate_unknown_rows_units_and_notes_fail(self):
        for value in ['4 ounces','4 pounds liquid','1/0 cubic foot/6 pounds of gear','1 pint liquid Surprise 3 gallons liquid']:
            with self.subTest(value=value):
                with self.assertRaises((ValueError,ZeroDivisionError)):parse(value)
        for value in [FIXTURE.replace('Vial 4 ounces liquid',''),FIXTURE.replace('Vial 4 ounces liquid','Vial 4 ounces liquid Vial 4 ounces liquid'),FIXTURE.replace('4 pints liquid','4 pints liquid Unknown 2 gallons liquid'),FIXTURE.replace('* You can also strap','* Missing note'),FIXTURE.replace('Backpack*','Backpack')]:
            with self.assertRaises(ValueError):table(value)
    def test_committed_data_agrees_with_independent_table_fixture(self):
        load=lambda n:json.loads((ROOT/'catalog'/n).read_text(encoding='utf-8-sig'))
        manifest=load('srd51-container-capacities-2014.json');ids=load('equipment-identity-reconciliation.json');rows=table(FIXTURE)
        self.assertEqual(s['audit'](manifest,rows,ids),13)
        changed=copy.deepcopy(manifest);changed['records'][0]['dimensions'][1]['amount']=300
        with self.assertRaisesRegex(ValueError,'Capacity mismatch'):s['audit'](changed,rows,ids)
        swapped=copy.deepcopy(manifest)
        swapped['records'][1]['candidateItemId'],swapped['records'][2]['candidateItemId']=swapped['records'][2]['candidateItemId'],swapped['records'][1]['candidateItemId']
        with self.assertRaisesRegex(ValueError,'name/identity'):s['audit'](swapped,rows,ids)
        changed=copy.deepcopy(manifest);changed['backpackExterior']['itemsWeightless']=True
        with self.assertRaisesRegex(ValueError,'exterior'):s['audit'](changed,rows,ids)
        boundary=manifest['applicationBoundary'];self.assertEqual(boundary['capacityDeviation'],'warn-and-allow-manual-override')
        for key in ['automaticInventoryMove','automaticCarryWeightChange','automaticCapacityConversion']:self.assertFalse(boundary[key])
if __name__=='__main__':unittest.main()
