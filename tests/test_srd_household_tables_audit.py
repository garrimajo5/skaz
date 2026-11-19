import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT=Path(__file__).resolve().parents[1]
mod=runpy.run_path(str(ROOT/'scripts/audit-srd-household-tables.py'))
parse_trade,parse_food,audit=mod['parse_trade'],mod['parse_food'],mod['audit']
TRADE='''Trade Goods Cost Goods
1 cp 1 lb. of wheat
2 cp 1 lb. of flour or one chicken
5 cp 1 lb. of salt
1 sp 1 lb. of iron or 1 sq. yd. of canvas
5 sp 1 lb. of copper or 1 sq. yd. of cotton cloth
1 gp 1 lb. of ginger or one goat
2 gp 1 lb. of cinnamon or pepper, or one sheep
3 gp 1 lb. of cloves or one pig
5 gp 1 lb. of silver or 1 sq. yd. of linen
10 gp 1 sq. yd. of silk or one cow
15 gp 1 lb. of saffron or one ox
50 gp 1 lb. of gold
500 gp 1 lb. of platinum
Expenses When adventuring ends.'''
FOOD='''These prices are included in your total lifestyle expenses.
Food, Drink, and Lodging Item Cost
Ale Gallon 2 sp Mug 4 cp
Banquet (per person) 10 gp Bread, loaf 2 cp Cheese, hunk 1 sp
Inn stay (per day) Squalid 7 cp Poor 1 sp Modest 5 sp Comfortable 8 sp Wealthy 2 gp Aristocratic 4 gp
Meals (per day) Squalid 3 cp Poor 6 cp Modest 3 sp Comfortable 5 sp Wealthy 8 sp Aristocratic 2 gp
Meat, chunk 3 sp Wine Common (pitcher) 2 sp Fine (bottle) 10 gp
Services Adventurers can pay. Services Service Pay. Spellcasting Services.'''
load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))


class HouseholdTableAuditTests(unittest.TestCase):
    def test_trade_alternatives_preserve_mass_area_and_animals(self):
        rows=parse_trade(TRADE)
        self.assertEqual(len(rows),13)
        self.assertEqual(sum(len(r['alternatives']) for r in rows),23)
        self.assertEqual(rows[6]['alternatives'],[{'nameEn':'Cinnamon','quantity':1,'unit':'lb'},{'nameEn':'Pepper','quantity':1,'unit':'lb'},{'nameEn':'Sheep','quantity':1,'unit':'animal'}])
        self.assertEqual(rows[3]['alternatives'][1]['unit'],'square-yard')

    def test_unknown_units_missing_rows_and_duplicate_alternatives_fail(self):
        for text in [TRADE.replace('1 sq. yd. of canvas','1 yard of canvas'),TRADE.replace('pepper, or one sheep','pepper or pepper, or one sheep'),TRADE.replace('1 cp 1 lb. of wheat',''),TRADE.replace('1 lb. of cinnamon or pepper','pepper or 1 lb. of cinnamon'),TRADE+' Trade Goods Cost Goods']:
            with self.assertRaises(ValueError):parse_trade(text)

    def test_food_distinguishes_daily_cost_from_individual_units(self):
        rows={r['nameEn']:r for r in parse_food(FOOD)}
        self.assertEqual(len(rows),20)
        self.assertEqual(rows['Inn stay, Aristocratic']['pricedUnit'],'day')
        self.assertEqual(rows['Banquet']['pricedUnit'],'person')
        self.assertEqual(rows['Wine, fine']['pricedUnit'],'bottle')
        self.assertEqual(rows['Ale, gallon']['pricedUnit'],'gallon')
        self.assertEqual(rows['Ale, mug']['pricedUnit'],'mug')

    def test_food_missing_unit_inclusion_or_extra_row_fail(self):
        for text in [FOOD.replace('Inn stay (per day)','Inn stay'),FOOD.replace('These prices are included in your total lifestyle expenses.',''),FOOD.replace('Mug 4 cp',''),FOOD.replace('Fine (bottle) 10 gp','Fine (bottle) 10 gp Extra 1 gp'),FOOD+' Services Adventurers can pay']:
            with self.assertRaises(ValueError):parse_food(text)

    def test_existing_observations_and_enriched_proposals_match_without_mutation(self):
        observed=load('srd51-additional-equipment-discovery.json');proposed=load('equipment-unit-proposals-2014.json')
        before=copy.deepcopy((observed,proposed))
        self.assertEqual(audit(observed,proposed,parse_trade(TRADE),parse_food(FOOD)),33)
        self.assertEqual((observed,proposed),before)

    def test_wrong_units_bundle_or_lost_proposal_is_rejected(self):
        observed=load('srd51-additional-equipment-discovery.json');proposed=load('equipment-unit-proposals-2014.json')
        def find(data,name):return next(r for r in data['records'] if r['nameEn']==name)
        for change in [lambda a,b:find(a,'Flour or Chicken').update(alternativesAre='bundle'),lambda a,b:find(b,'Flour or Chicken')['alternatives'][1].update(unit='lb'),lambda a,b:find(a,'Banquet').update(pricedUnit='day'),lambda a,b:find(b,'Ale, mug').update(includedInLifestyleExpenses=False),lambda a,b:find(b,'Ale, mug').update(observationId='unknown'),lambda a,b:a['records'].append(copy.deepcopy(find(a,'Banquet')))]:
            a,b=copy.deepcopy((observed,proposed));change(a,b)
            with self.assertRaises(ValueError):audit(a,b,parse_trade(TRADE),parse_food(FOOD))


if __name__=='__main__':unittest.main()
