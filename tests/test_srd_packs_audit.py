import copy
import json
from pathlib import Path
import runpy
import unittest

ROOT=Path(__file__).resolve().parents[1]
mod=runpy.run_path(str(ROOT/'scripts/audit-srd-packs.py'))
parse_member,parse_packs,audit=mod['parse_member'],mod['parse_packs'],mod['audit']
SOURCE='''Equipment Packs The starting equipment comes in packs.
Burglar’s Pack (16 gp). Includes a backpack, a bag of 1,000 ball bearings, 10 feet of string, a bell, 5 candles, a crowbar, a hammer, 10 pitons, a hooded lante rn, 2 flasks of oil, 5 days rations, a tinderbox, and a waterskin. The pack also has 50 feet of hempen rope strapped to the side of it.
Diplomat’s Pack (39 gp). Includes a chest, 2 cases for maps and scrolls, a set of fine clothes, a bottle of ink, an ink pen, a lamp, 2 flasks of oil, 5 sheets of paper, a vial of perfume, sealing wax, and soap.
Dungeoneer’s Pack (12 gp). Includes a backpack, a crowbar, a hammer, 10 pitons, 10 torches, a tinderbox, 10 days of rations, and a waterskin. The pack also has 50 feet of hempen rope strapped to the side of it.
Entertainer’s Pack (40 gp). Includes a backpack, a bedroll, 2 costumes, 5 candles, 5 days of rations, a waterskin, and a disguise kit.
Explorer’s Pack (10 gp). Includes a backpack, a bedroll, a mess kit, a tinderbox, 10 torches, 10 days of rations, and a waterskin. The pack also has 50 feet of hempen rope strapped to the side of it.
Priest’s Pack (19 gp). Includes a backpack, a blanket, 10 candles, a tinderbox, an alms box, 2 blocks of incense, a censer, vestments, 2 days of rations, and a waterskin.
Scholar’s Pack (40 gp). Includes a backpack, a book of lore, a bottle of ink, an ink pen, 10 sheets of parchment, a little bag of sand, and a small knife.
Tools A tool helps you.'''
load=lambda name:json.loads((ROOT/'catalog'/name).read_text(encoding='utf-8-sig'))
def inputs():return [load(n) for n in ['srd51-additional-equipment-discovery.json','srd51-equipment-pack-memberships.json','equipment-unit-proposals-2014.json']]


class PackSourceAuditTests(unittest.TestCase):
    def test_packaging_unknowns_and_compound_names_survive(self):
        rows=parse_packs(SOURCE)
        members=[m for r in rows for m in r['contents']]
        self.assertEqual(len(members),66)
        self.assertEqual(sum(m['quantity'] is None for m in members),3)
        self.assertEqual(rows[0]['contents'][1],{'sourceName':'ball bearings','quantity':1,'unit':'bag of 1000'})
        self.assertEqual(rows[0]['contents'][-1],{'sourceName':'hempen rope','quantity':1,'unit':'50-foot length'})
        self.assertEqual(rows[1]['contents'][1]['sourceName'],'cases for maps and scrolls')
        self.assertEqual(rows[1]['contents'][3]['unit'],'bottle')

    def test_missing_duplicate_extra_and_unrecognized_members_fail(self):
        for text in [SOURCE.replace('a bell, ',''),SOURCE.replace('a bell, ','a bell, a bell, '),SOURCE.replace('a bell, ','a bell, a spoon, '),SOURCE.replace('sealing wax','some sealing wax'),SOURCE.replace('Explorer’s Pack','Priest’s Pack'),SOURCE.replace('Tools A tool helps','No table ending')]:
            with self.assertRaises(ValueError):parse_packs(text)

    def test_unquantified_clauses_do_not_become_one(self):
        for name in ('sealing wax','soap','vestments'):
            self.assertEqual(parse_member(name),{'sourceName':name,'quantity':None,'unit':'unspecified'})
        with self.assertRaises(ValueError):parse_member('unknown material')

    def test_original_memberships_and_proposals_match_without_mutation(self):
        data=inputs();before=copy.deepcopy(data)
        self.assertEqual(audit(parse_packs(SOURCE),*data),66)
        self.assertEqual(data,before)

    def test_price_package_size_or_invented_quantity_is_rejected(self):
        for change in [lambda a,b,c:b['records'][0].update(listedCostGp=17),lambda a,b,c:b['records'][0]['contents'][1].update(quantity=1000),lambda a,b,c:b['records'][0]['contents'][-1].update(unit='foot',quantity=50),lambda a,b,c:b['records'][1]['contents'][-1].update(quantity=1),lambda a,b,c:c['packMemberships'][0].update(quantity=2),lambda a,b,c:c['packMemberships'][0].update(quantityStatus='unspecified'),lambda a,b,c:c['packMemberships'].append(copy.deepcopy(c['packMemberships'][0]))]:
            data=inputs();change(*data)
            with self.assertRaises(ValueError):audit(parse_packs(SOURCE),*data)

    def test_changed_source_cost_or_amount_is_detected_against_saved_data(self):
        for text in [SOURCE.replace('(16 gp)','(17 gp)'),SOURCE.replace('10 feet of string','12 feet of string'),SOURCE.replace('1,000 ball bearings','2,000 ball bearings'),SOURCE.replace('50 feet of hempen rope','60 feet of hempen rope')]:
            with self.assertRaises(ValueError):audit(parse_packs(text),*inputs())


if __name__=='__main__':unittest.main()
