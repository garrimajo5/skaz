"""Regression checks for strict SRD armor/weapon table auditing."""
import copy
import json
import runpy
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
mod=runpy.run_path(str(ROOT/'scripts/audit-srd-armor-weapons.py'))
load=lambda path:json.loads((ROOT/path).read_text(encoding='utf-8-sig'))


def weapon_fixture():
    # A compact independent transcription of the source table, including source dash/fractions.
    rows='''Club|1 sp|1d4 bludgeoning|2 lb.|Light
Dagger|2 gp|1d4 piercing|1 lb.|Finesse, light, thrown (range 20/60)
Greatclub|2 sp|1d8 bludgeoning|10 lb.|Two-handed
Handaxe|5 gp|1d6 slashing|2 lb.|Light, thrown (range 20/60)
Javelin|5 sp|1d6 piercing|2 lb.|Thrown (range 30/120)
Light hammer|2 gp|1d4 bludgeoning|2 lb.|Light, thrown (range 20/60)
Mace|5 gp|1d6 bludgeoning|4 lb.|—
Quarterstaff|2 sp|1d6 bludgeoning|4 lb.|Versatile (1d8)
Sickle|1 gp|1d4 slashing|2 lb.|Light
Spear|1 gp|1d6 piercing|3 lb.|Thrown (range 20/60), versatile (1d8)
Crossbow, light|25 gp|1d8 piercing|5 lb.|Ammunition (range 80/320), loading, two-handed
Dart|5 cp|1d4 piercing|1/4 lb.|Finesse, thrown (range 20/60)
Shortbow|25 gp|1d6 piercing|2 lb.|Ammunition (range 80/320), two-handed
Sling|1 sp|1d4 bludgeoning|—|Ammunition (range 30/120)
Battleaxe|10 gp|1d8 slashing|4 lb.|Versatile (1d10)
Flail|10 gp|1d8 bludgeoning|2 lb.|—
Glaive|20 gp|1d10 slashing|6 lb.|Heavy, reach, two-handed
Greataxe|30 gp|1d12 slashing|7 lb.|Heavy, two-handed
Greatsword|50 gp|2d6 slashing|6 lb.|Heavy, two-handed
Halberd|20 gp|1d10 slashing|6 lb.|Heavy, reach, two-handed
Lance|10 gp|1d12 piercing|6 lb.|Reach, special
Longsword|15 gp|1d8 slashing|3 lb.|Versatile (1d10)
Maul|10 gp|2d6 bludgeoning|10 lb.|Heavy, two-handed
Morningstar|15 gp|1d8 piercing|4 lb.|—
Pike|5 gp|1d10 piercing|18 lb.|Heavy, reach, two-handed
Rapier|25 gp|1d8 piercing|2 lb.|Finesse
Scimitar|25 gp|1d6 slashing|3 lb.|Finesse, light
Shortsword|10 gp|1d6 piercing|2 lb.|Finesse, light
Trident|5 gp|1d6 piercing|4 lb.|Thrown (range 20/60), versatile (1d8)
War pick|5 gp|1d8 piercing|2 lb.|—
Warhammer|15 gp|1d8 bludgeoning|2 lb.|Versatile (1d10)
Whip|2 gp|1d4 slashing|3 lb.|Finesse, reach
Blowgun|10 gp|1 piercing|1 lb.|Ammunition (range 25/100), loading
Crossbow, hand|75 gp|1d6 piercing|3 lb.|Ammunition (range 30/120), light, loading
Crossbow, heavy|50 gp|1d10 piercing|18 lb.|Ammunition (range 100/400), heavy, loading, two-handed
Longbow|50 gp|1d8 piercing|2 lb.|Ammunition (range 150/600), heavy, two-handed
Net|1 gp|—|3 lb.|Special, thrown (range 5/15)'''.replace('|',' ').splitlines()
    for index,heading in reversed([(10,'Simple Ranged Weapons'),(14,'Martial Melee Weapons'),(32,'Martial Ranged Weapons')]):rows.insert(index,heading)
    return 'Weapons Name Cost Damage Weight Properties Simple Melee Weapons '+' '.join(rows)+' Adventuring Gear'


def armor_fixture():
    return '''Armor Armor Cost Armor Class (AC) Strength Stealth Weight Light Armor
Padded 5 gp 11 + Dex modifier — Disadvantage 8 lb.
Leather 10 gp 11 + Dex modifier — — 10 lb.
Studded leather 45 gp 12 + Dex modifier — — 13 lb.
Medium Armor
Hide 10 gp 12 + Dex modifier (max 2) — — 12 lb.
Chain shirt 50 gp 13 + Dex modifier (max 2) — — 20 lb.
Scale mail 50 gp 14 + Dex modifier (max 2) — Disadvantage 45 lb.
Breastplate 400 gp 14 + Dex modifier (max 2) — — 20 lb.
Half plate 750 gp 15 + Dex modifier (max 2) — Disadvantage 40 lb.
Heavy Armor
Ring mail 30 gp 14 — Disadvantage 40 lb.
Chain mail 75 gp 16 Str 13 Disadvantage 55 lb.
Splint 200 gp 17 Str 15 Disadvantage 60 lb.
Plate 1,500 gp 18 Str 15 Disadvantage 65 lb.
Shield Shield 10 gp +2 — — 6 lb.
Getting Into and Out of Armor
Donning and Doffing Armor Category Don Doff
Light Armor 1 minute 1 minute Medium Armor 5 minutes 1 minute Heavy Armor 10 minutes 5 minutes Shield 1 action 1 action
Weapons Your'''


class ArmorWeaponAuditTests(unittest.TestCase):
    def check(self,kind,manifest=None,rows=None):
        path=f'catalog/{kind}-canonical-proposal-2014.json'
        if manifest is None:manifest=load(f'catalog/srd51-{kind}-parameters-2014.json')
        if rows is None:rows=mod['parse_armor'](armor_fixture())[0] if kind=='armor' else mod['parse_weapons'](weapon_fixture())
        return mod['audit'](manifest,rows,load(path),path)

    def test_full_transcribed_tables_and_don_doff(self):
        self.assertEqual(self.check('armor'),13)
        self.assertEqual(self.check('weapon'),37)
        self.assertEqual(mod['parse_armor'](armor_fixture())[1],load('catalog/srd51-armor-parameters-2014.json')['donDoff'])

    def test_dash_fixed_damage_and_fraction_are_distinct(self):
        rows=mod['parse_weapons'](weapon_fixture())
        self.assertIsNone(rows['Sling']['weightLb'])
        self.assertIsNone(rows['Net']['damage'])
        self.assertEqual(rows['Dart']['weightLb'],0.25)
        self.assertEqual(rows['Blowgun']['damage'],{'kind':'fixed','value':1,'type':'piercing'})

    def test_corrupt_parameters_are_rejected(self):
        for name,field,value in [('Net','damage',{'kind':'fixed','value':0,'type':'bludgeoning'}),('Sling','weightLb',0),('Dagger','properties',[{'key':'finesse'}]),('Blowgun','damage',{'kind':'dice','value':'1d4','type':'piercing'})]:
            with self.subTest(name=name):
                d=load('catalog/srd51-weapon-parameters-2014.json')
                next(r for r in d['records'] if r['nameEn']==name)[field]=value
                with self.assertRaisesRegex(ValueError,'Parameter mismatch'):self.check('weapon',d)

    def test_swapped_existing_ids_are_rejected(self):
        for kind in ['armor','weapon']:
            d=load(f'catalog/srd51-{kind}-parameters-2014.json');a,b=d['records'][:2]
            a['candidateItemId'],b['candidateItemId']=b['candidateItemId'],a['candidateItemId']
            with self.assertRaisesRegex(ValueError,'Identity/name'):self.check(kind,d)

    def test_missing_duplicate_or_unparsed_source_fails_closed(self):
        for text in [weapon_fixture().replace('Club 1 sp','Unknown 1 sp'),weapon_fixture().replace('Club 1 sp 1d4 bludgeoning 2 lb. Light',''),weapon_fixture().replace('Adventuring Gear','unparsed Adventuring Gear'),weapon_fixture()+' Adventuring Gear',weapon_fixture().replace('Finesse, light','Finesse, unknown',1)]:
            with self.subTest(text=text[-50:]):
                with self.assertRaises(ValueError):mod['parse_weapons'](text)
        with self.assertRaises(ValueError):mod['parse_armor'](armor_fixture().replace('Medium Armor','',1))

    def test_category_heading_cannot_move_to_another_row(self):
        bad=weapon_fixture().replace('Simple Ranged Weapons ','').replace('Spear 1 gp','Simple Ranged Weapons Spear 1 gp')
        with self.assertRaisesRegex(ValueError,'category misplaced'):mod['parse_weapons'](bad)
        bad=armor_fixture().replace('Medium Armor\n','').replace('Studded leather','Medium Armor Studded leather')
        with self.assertRaisesRegex(ValueError,'category misplaced'):mod['parse_armor'](bad)

    def test_pdf_hyphen_artifact_is_normalized(self):
        self.assertEqual(mod['parse_weapons'](weapon_fixture().replace('two-handed','two -\u00ad\u2010handed')),mod['parse_weapons'](weapon_fixture()))

    def test_acceptance_and_source_drift_rejected(self):
        for field,value in [('accepted',True),('complete',True),('approvedDenominator',37)]:
            d=load('catalog/srd51-weapon-parameters-2014.json');d[field]=value
            with self.assertRaisesRegex(ValueError,'acceptance'):self.check('weapon',d)
        d=load('catalog/srd51-weapon-parameters-2014.json');d['source']['sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'source'):self.check('weapon',d)

    def test_armor_negative_dex_and_shield_are_not_same_formula(self):
        d=load('catalog/srd51-armor-parameters-2014.json')
        for name,key,value in [('Hide','negativeDexterityApplies',False),('Plate','dexterityMode','full'),('Shield','kind','base')]:
            bad=copy.deepcopy(d);next(r for r in bad['records'] if r['nameEn']==name)['armorClass'][key]=value
            with self.assertRaisesRegex(ValueError,'armorClass'):self.check('armor',bad)

if __name__=='__main__':unittest.main()
