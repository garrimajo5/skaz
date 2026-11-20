import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[1]
mod = runpy.run_path(str(ROOT / 'scripts/audit-srd-transport.py'))
parse_tables, audit = mod['parse_tables'], mod['audit']
# Minimal transcription of the pinned SRD71–72 table layout, with prose weight on71.
TABLES = '''A rowboat weighs 100 pounds.
Mounts and Other Animals Item Cost Speed Carrying Capacity
Camel 50 gp 50 ft. 480 lb.
Donkey or mule 8 gp 40 ft. 420 lb.
Elephant 200 gp 40 ft. 1,320 lb.
System Reference Document 5.1 72
Horse, draft 50 gp 40 ft. 540 lb.
Horse, riding 75 gp 60 ft. 480 lb.
Mastiff 25 gp 40 ft. 195 lb.
Pony 30 gp 40 ft. 225 lb.
Warhorse 400 gp 60 ft. 540 lb.
Tack, Harness, and Drawn Vehicles Item Cost Weight
Barding ×4 ×2
Bit and bridle 2 gp 1 lb.
Carriage 100 gp 600 lb.
Cart 15 gp 200 lb.
Chariot 250 gp 100 lb.
Feed (per day) 5 cp 10 lb.
Saddle
Exotic 60 gp 40 lb.
Military 20 gp 30 lb.
Pack 5 gp 15 lb.
Riding 10 gp 25 lb.
Saddlebags 4 gp 8 lb.
Sled 20 gp 300 lb.
Stabling (per day) 5 sp —
Wagon 35 gp 400 lb.
Waterborne Vehicles Item Cost Speed
Galley 30,000 gp 4 mph
Keelboat 3,000 gp 1 mph
Longship 10,000 gp 3 mph
Rowboat 50 gp 1½ mph
Sailing ship 10,000 gp 2 mph
Warship 25,000 gp 2½ mph
Trade Goods Most wealth is not in coins. The Trade Goods table follows.
'''


def load(name):
    return json.loads((ROOT / 'catalog' / name).read_text(encoding='utf-8-sig'))


class TransportAuditTests(unittest.TestCase):
    def test_extracts_fractional_speeds_thousands_units_and_non_weight(self):
        rows = parse_tables(TABLES)
        self.assertEqual(len(rows), 28)
        self.assertEqual(rows['Rowboat']['parameters']['speed'], {'value': 1.5, 'unit': 'mph'})
        self.assertEqual(rows['Warship']['parameters']['speed']['value'], 2.5)
        self.assertEqual(rows['Elephant']['parameters']['baseCarryingCapacity']['value'], 1320)
        self.assertEqual(rows['Barding']['pricing']['factor'], 4)
        self.assertEqual(rows['Barding']['parameters']['weightMultiplier'], 2)
        self.assertIsNone(rows['Stabling (per day)']['parameters']['weight']['value'])
        self.assertEqual(rows['Rowboat']['parameters']['weight']['sourcePage'], 71)

    def test_does_not_drop_unknown_rows_or_repair_unsupported_numbers(self):
        for text in [TABLES.replace('Camel 50 gp 50 ft. 480 lb.', ''),
                     TABLES.replace('Camel 50 gp 50 ft. 480 lb.', 'Camel 50 gp 50 ft. 480 lb. Camel 50 gp 50 ft. 480 lb.'),
                     TABLES.replace('1½ mph', '1? mph'),
                     TABLES.replace('Warship 25,000', 'Unknown 9 gp 3 mph Warship 25,000'),
                     TABLES.replace('Barding ×4 ×2', 'Barding 4 gp 2 lb.'),
                     TABLES.replace('A rowboat weighs 100 pounds.', '')]:
            with self.subTest(text=text[:60]):
                with self.assertRaises(ValueError):
                    parse_tables(text)

    def test_missing_or_duplicate_table_boundaries_fail(self):
        for text in [TABLES.replace('Mounts and Other Animals', 'Animals'),
                     TABLES + ' Waterborne Vehicles Item Cost Speed']:
            with self.assertRaises(ValueError):
                parse_tables(text)

    def test_manifest_matches_source_and_preserves_observations(self):
        manifest = load('srd51-transport-parameters-2014.json')
        observations = load('srd51-additional-equipment-discovery.json')
        proposals = load('equipment-unit-proposals-2014.json')
        before = copy.deepcopy((manifest, observations, proposals))
        self.assertEqual(audit(manifest, parse_tables(TABLES), observations, proposals), 28)
        self.assertEqual((manifest, observations, proposals), before)

    def test_wrong_parameter_unit_price_or_acceptance_is_rejected(self):
        original = load('srd51-transport-parameters-2014.json')
        observations = load('srd51-additional-equipment-discovery.json')
        proposals = load('equipment-unit-proposals-2014.json')
        def change(manifest, name, field, value):
            row = next(r for r in manifest['records'] if r['nameEn'] == name)
            row[field] = value
        mutations = [
            lambda m: change(m, 'Camel', 'parameters', {'speed': {'value': 50, 'unit': 'mph'}}),
            lambda m: change(m, 'Cart', 'pricing', {'mode': 'fixed', 'amount': 16, 'currency': 'gp'}),
            lambda m: change(m, 'Barding', 'parameters', {'weightMultiplier': 4, 'base': 'equivalent-armor-for-humanoids'}),
            lambda m: change(m, 'Stabling (per day)', 'parameters', {'weight': {'value': 0, 'unit': 'lb'}}),
            lambda m: change(m, 'Rowboat', 'accepted', True),
            lambda m: change(m, 'Rowboat', 'runtimeImported', True),
            lambda m: change(m, 'Camel', 'proposedUnitId', 'new-id'),
            lambda m: m['records'].append(copy.deepcopy(m['records'][0])),
            lambda m: m.update(ruleset='5e-2024'),
            lambda m: m.update(complete=True),
        ]
        for mutation in mutations:
            manifest = copy.deepcopy(original)
            mutation(manifest)
            with self.assertRaises(ValueError):
                audit(manifest, parse_tables(TABLES), observations, proposals)

    def test_observation_or_proposal_identity_conflict_is_rejected(self):
        manifest = load('srd51-transport-parameters-2014.json')
        observations = load('srd51-additional-equipment-discovery.json')
        proposals = load('equipment-unit-proposals-2014.json')
        proposals['records'].append(copy.deepcopy(next(r for r in proposals['records'] if r['nameEn'] == 'Camel')))
        with self.assertRaises(ValueError):
            audit(manifest, parse_tables(TABLES), observations, proposals)


if __name__ == '__main__':
    unittest.main()
