import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT=Path(__file__).resolve().parents[1]
mod=runpy.run_path(str(ROOT/'scripts/audit-srd-services.py'))
parse_services,audit=mod['parse_services'],mod['audit']
SOURCE='''Services Service Pay
Coach cab Between towns 3 cp per mile Within a city 1 cp
Hireling Skilled 2 gp per day Untrained 2 sp per day
Messenger 2 cp per mile Road or gate toll 1 cp Ship’s passage 1 sp per mile
Skilled hirelings include anyone hired to perform a service that involves a proficiency.
The pay shown is a minimum; some expert hirelings require more pay.
Spellcasting Services People able to cast spells are not ordinary hirelings; no established pay rates exist.
Hiring someone to cast a relatively common spell of 1st or 2nd level, such as cure wounds or identify, might cost 10 to 50 gold pieces (plus the cost of any expensive material components).
'''
load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))


class ServiceAuditTests(unittest.TestCase):
    def test_minimum_periods_and_example_quote_are_distinct(self):
        result=parse_services(SOURCE)
        self.assertEqual(result['rates']['Hireling, skilled']['pricing'],{'mode':'minimum','amount':2,'currency':'gp'})
        self.assertEqual(result['rates']['Coach cab, within a city']['pricedUnit'],'not-specified-in-table')
        self.assertEqual(result['rates']['Messenger']['pricedUnit'],'mile')
        self.assertEqual(result['quote'],{'spellLevels':[1,2],'low':10,'high':50,'currency':'gp'})

    def test_missing_qualifiers_rows_and_duplicate_sections_fail(self):
        for text in [SOURCE.replace('The pay shown is a minimum;', ''),SOURCE.replace('(plus the cost of any expensive material components)', ''),SOURCE.replace('no established pay rates exist','fixed prices apply'),SOURCE.replace('Untrained 2 sp per day',''),SOURCE+' Services Service Pay']:
            with self.assertRaises(ValueError):parse_services(text)

    def test_actual_manifest_and_source_observations_agree(self):
        manifest=load('srd51-service-conditions-2014.json');observations=load('srd51-additional-equipment-discovery.json')
        before=copy.deepcopy((manifest,observations))
        self.assertEqual(audit(manifest,parse_services(SOURCE),observations),7)
        self.assertEqual((manifest,observations),before)

    def test_example_never_becomes_fixed_rate_limit_or_automatic_purchase(self):
        base=load('srd51-service-conditions-2014.json');observations=load('srd51-additional-equipment-discovery.json')
        for key,value in [('normalRate',10),('ordinaryHirelingRateApplies',True),('automaticPurchase',True),('accepted',True)]:
            manifest=copy.deepcopy(base);manifest['spellcastingServices'][key]=value
            with self.assertRaises(ValueError):audit(manifest,parse_services(SOURCE),observations)
        for key,value in [('bindingMinimum',True),('bindingMaximum',True),('commonSpellsOnly',False),('expensiveMaterialComponents','included'),('high',500)]:
            manifest=copy.deepcopy(base);manifest['spellcastingServices']['illustrativeQuote'][key]=value
            with self.assertRaises(ValueError):audit(manifest,parse_services(SOURCE),observations)

    def test_wrong_price_period_or_duplicate_identity_is_rejected(self):
        base=load('srd51-service-conditions-2014.json');observations=load('srd51-additional-equipment-discovery.json')
        for mutate in [lambda m:m['services'][2]['pricing'].update(mode='fixed'),lambda m:m['services'][1].update(pricedUnit='mile'),lambda m:m['services'][0].update(observationId='unknown'),lambda m:m['services'].append(copy.deepcopy(m['services'][0]))]:
            manifest=copy.deepcopy(base);mutate(manifest)
            with self.assertRaises(ValueError):audit(manifest,parse_services(SOURCE),observations)


if __name__=='__main__':unittest.main()
