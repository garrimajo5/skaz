import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT=Path(__file__).resolve().parents[1]
mod=runpy.run_path(str(ROOT/'scripts/audit-srd-lifestyles.py'))
parse_lifestyles,audit=mod['parse_lifestyles'],mod['audit']
SOURCE='''Lifestyle Expenses
At the start of each week or month choose a lifestyle.
The prices listed are per day; multiply the listed price by 30.
Expenses cover the cost of maintaining your equipment.
Lifestyle Expenses Lifestyle Price/Day
Wretched — Squalid 1 sp Poor 2 sp Modest 1 gp Comfortable 2 gp Wealthy 4 gp Aristocratic 10 gp minimum
Wretched. Narrative descriptions.
Self-Sufficiency doesn’t require you to spend any coin.
By practicing a profession you can have the equivalent of a poor lifestyle.
Proficiency in the Survival skill lets you live at the equivalent of a comfortable lifestyle.
These prices are included in your total lifestyle expenses.
'''
load=lambda p:json.loads((ROOT/'catalog'/p).read_text(encoding='utf-8-sig'))


class LifestyleAuditTests(unittest.TestCase):
    def test_minimum_and_unpriced_are_not_fixed_or_zero(self):
        rows=parse_lifestyles(SOURCE)
        self.assertEqual(rows['Aristocratic'],{'mode':'minimum','amount':10,'currency':'gp'})
        self.assertEqual(rows['Wretched'],{'mode':'not-priced','sourceValue':'—'})
        self.assertEqual(rows['Poor'],{'mode':'fixed','amount':2,'currency':'sp'})

    def test_missing_rows_qualifiers_or_duplicate_tables_fail(self):
        for text in [SOURCE.replace('Squalid 1 sp ',''),SOURCE.replace('Squalid 1 sp','Squalid 1 sp Squalid 2 sp'),SOURCE+' Lifestyle Expenses Lifestyle Price/Day',SOURCE.replace('These prices are included in your total lifestyle expenses.',''),SOURCE.replace('cost of maintaining your equipment',''),SOURCE.replace('equivalent of a poor lifestyle','equivalent of a wealthy lifestyle'),SOURCE.replace('per day','per week')]:
            with self.assertRaises(ValueError):parse_lifestyles(text)

    def test_manifest_preserves_observations_and_source_prices(self):
        manifest=load('srd51-lifestyle-conditions-2014.json');observations=load('srd51-additional-equipment-discovery.json')
        before=copy.deepcopy((manifest,observations))
        self.assertEqual(audit(manifest,parse_lifestyles(SOURCE),observations),7)
        self.assertEqual((manifest,observations),before)

    def test_wrong_rates_units_or_id_are_rejected(self):
        original=load('srd51-lifestyle-conditions-2014.json');observations=load('srd51-additional-equipment-discovery.json')
        for change in [lambda m:m['records'][0].update(pricing={'mode':'fixed','amount':0,'currency':'gp'}),lambda m:m['records'][-1]['pricing'].update(mode='fixed'),lambda m:m['records'][1].update(pricingPeriod='week'),lambda m:m['records'][1].update(observationId='unknown'),lambda m:m['records'][1].update(accepted=True),lambda m:m['records'].append(copy.deepcopy(m['records'][0]))]:
            m=copy.deepcopy(original);change(m)
            with self.assertRaises(ValueError):audit(m,parse_lifestyles(SOURCE),observations)

    def test_double_charge_fixed_month_and_automatic_debit_fail(self):
        original=load('srd51-lifestyle-conditions-2014.json');observations=load('srd51-additional-equipment-discovery.json')
        for change in [lambda m:m['billing'].update(doNotDoubleChargeIncludedExpenses=False),lambda m:m['billing'].update(automaticDebit=True),lambda m:m['billing']['example'].update(fixedCalendarMonthLength=True),lambda m:m['billing']['includes'].remove('equipment-maintenance')]:
            m=copy.deepcopy(original);change(m)
            with self.assertRaises(ValueError):audit(m,parse_lifestyles(SOURCE),observations)

    def test_self_sufficiency_requires_time_and_never_grants_automatic_benefits(self):
        original=load('srd51-lifestyle-conditions-2014.json');observations=load('srd51-additional-equipment-discovery.json')
        for key,value in [('timeRequired',False),('timeDuration',8),('ordinaryEquivalent','Comfortable'),('ordinaryCondition','none'),('survivalProficiencyEquivalent','Wealthy'),('automaticIncome',True),('automaticLifestyleChange',True)]:
            m=copy.deepcopy(original);m['selfSufficiency'][key]=value
            with self.assertRaises(ValueError):audit(m,parse_lifestyles(SOURCE),observations)
        for key,value in [('automaticConditions',True),('automaticSocialBonuses',True),('ruleDeviation','block')]:
            m=copy.deepcopy(original);m['applicationBoundary'][key]=value
            with self.assertRaises(ValueError):audit(m,parse_lifestyles(SOURCE),observations)


if __name__=='__main__':unittest.main()
