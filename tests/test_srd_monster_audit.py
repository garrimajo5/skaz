import runpy
import unittest
from pathlib import Path

parse = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['statistics']
BASE = ('Beast Large beast, unaligned Armor Class 12 (natural armor) '
        'Hit Points 13 (2d10 + 2) Speed 30 ft., swim 30 ft. '
        'STR DEX CON INT WIS CHA 15 (+2) 14 (+2) 12 (+1) 1 (−5) 10 (+0) 3 (−4) '
        'Senses passive Perception 10 Languages — Challenge 1/4 (50 XP)')


class MonsterAuditTests(unittest.TestCase):
    def test_animated_objects_include_compound_name_and_ignore_other_creature_types(self):
        module=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={263:'Animated Objects Animated Armor Medium construct, unaligned.',264:'Flying Sword Small construct. Rug of Smothering Large construct. Ankheg Large monstrosity.'}
        rows=module['animated_headings'](pages)
        self.assertEqual([row['nameEn'] for row in rows],['Animated Armor','Flying Sword','Rug of Smothering'])
        self.assertEqual(rows[2]['id'],'srd51:2014:monster:rug-of-smothering')
        manifest={'sourceSha256':module['SHA256'],'expectedSubsetCount':3,'entries':[{**row,'pages':[row['page']]} for row in rows]}
        cards=[{'id':row['id'],'name':{'en':row['nameEn']},'monster':{'type':'construct'},'source':{'url':'https://source.invalid/#page='+str(row['page'])}} for row in rows]
        self.assertEqual(module['check_animated_coverage'](pages,manifest,cards),3)
        for invalid in [cards[:2],cards+cards[:1],[{**cards[0],'monster':{'type':'item'}},*cards[1:]]]:
            with self.assertRaises(ValueError):module['check_animated_coverage'](pages,manifest,invalid)
        manifest['entries'][0]['pages']=[264]
        with self.assertRaises(ValueError):module['check_animated_coverage'](pages,manifest,cards)

    def test_typed_headings_keep_pages_and_exclude_fiend_hags(self):
        module = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages = {320: 'Sea Hag Medium fey, chaotic evil. Night Hag Medium fiend, neutral evil.',
                 309: 'Fungi Shrieker Medium plant, unaligned. Violet Fungus Medium plant, unaligned.'}
        self.assertEqual(module['type_headings'](pages, 'fey'), [{'id':'srd51:2014:monster:sea-hag','nameEn':'Sea Hag','page':320}])
        plants = module['type_headings'](pages, 'plant')
        self.assertEqual([row['nameEn'] for row in plants], ['Shrieker','Violet Fungus'])
        self.assertEqual(plants[0]['id'], 'srd51:2014:monster:shrieker')
        with self.assertRaises(ValueError): module['type_headings'](pages, 'fiend')

    def test_typed_inventory_rejects_missing_duplicate_wrong_type_page_or_source(self):
        import copy
        module = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages = {304:'Dryad Medium fey, neutral.',309:'Fungi Shrieker Medium plant, unaligned.'}
        sections = [{'monsterType':kind,'expectedCount':1,'entries':module['type_headings'](pages,kind)} for kind in ['fey','plant']]
        manifest = {'sourceSha256':module['SHA256'],'ruleset':'5e-2014','sourcePageRange':[254,394],'sections':sections}
        cards = [{'id':s['entries'][0]['id'],'name':{'en':s['entries'][0]['nameEn']},'monster':{'type':s['monsterType']},'source':{'url':'https://source.invalid/#page='+str(s['entries'][0]['page'])}} for s in sections]
        self.assertEqual(module['check_type_inventory'](pages,manifest,cards), {'fey':1,'plant':1})
        for invalid in [cards[:1],cards+cards[:1],[{**cards[0],'monster':{'type':'fiend'}},cards[1]],[{**cards[0],'source':{'url':'https://source.invalid/#page=305'}},cards[1]]]:
            with self.assertRaises(ValueError): module['check_type_inventory'](pages,manifest,invalid)
        for mutate in [lambda x:x.update(sourceSha256='other'),lambda x:x.update(ruleset='5e-2024'),lambda x:x.update(sourcePageRange=[1,403]),lambda x:x['sections'][0].update(expectedCount=2),lambda x:x['sections'][0].update(entries=[])]:
            invalid = copy.deepcopy(manifest); mutate(invalid)
            with self.assertRaises(ValueError): module['check_type_inventory'](pages,invalid,cards)

    def test_ooze_section_inventory_ignores_prose_and_preserves_heading_pages(self):
        headings = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['ooze_headings']
        rows = headings({338:'Gray Ooze Medium ooze, unaligned. A Black Pudding is mentioned in prose.',337:'Black Pudding Large ooze, unaligned. Gelatinous Cube Large ooze, unaligned.'})
        self.assertEqual([row['nameEn'] for row in rows], ['Black Pudding','Gelatinous Cube','Gray Ooze'])
        self.assertEqual([row['page'] for row in rows], [337,337,338])
        self.assertEqual(rows[1]['id'], 'srd51:2014:monster:gelatinous-cube')

    def test_ooze_coverage_rejects_missing_duplicate_wrong_page_or_type(self):
        import copy
        module = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        check = module['check_ooze_coverage']
        pages={337:'Black Pudding Large ooze, unaligned.'}
        row={'id':'srd51:2014:monster:black-pudding','nameEn':'Black Pudding','pages':[337]}
        manifest={'sourceSha256':module['SHA256'],'expectedSubsetCount':1,'entries':[row]}
        card={'id':row['id'],'name':{'en':row['nameEn']},'monster':{'type':'ooze'},'source':{'url':'https://source.invalid/#page=337'}}
        self.assertEqual(check(pages,manifest,[card]),1)
        for cards in [[],[card,card],[{**card,'monster':{'type':'beast'}}],[{**card,'source':{'url':'https://source.invalid/#page=338'}}]]:
            with self.assertRaises(ValueError):check(pages,manifest,cards)
        for mutate in [lambda m:m.update(expectedSubsetCount=0),lambda m:m.update(entries=[]),lambda m:m['entries'][0].update(pages=[338]),lambda m:m.update(sourceSha256='changed')]:
            invalid=copy.deepcopy(manifest);mutate(invalid)
            with self.assertRaises(ValueError):check(pages,invalid,[card])

    def test_familiar_forms_preserve_aliases_and_reject_missing_or_duplicate_names(self):
        headings = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['familiar_headings']
        text = 'animal form you choose: bat, cat, crab, frog (toad), hawk, lizard, octopus, owl, poisonous snake, fish (quipper), rat, raven, sea horse, spider, or weasel. Appearing'
        names = headings(text)
        self.assertEqual(len(names), 15)
        self.assertIn('Quipper', names)
        self.assertIn('Frog', names)
        for bad in [text.replace('bat, ', ''), text.replace('bat, ', 'cat, '), 'Other spell']:
            with self.assertRaises(ValueError):
                headings(bad)

    def test_npc_inventory_preserves_pages_and_compound_names(self):
        headings = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['npc_headings']
        rows = headings({397: 'Bandit Captain Medium humanoid, any race', 395: 'Acolyte Medium humanoid, any race'})
        self.assertEqual([row['nameEn'] for row in rows], ['Acolyte', 'Bandit Captain'])
        self.assertEqual(rows[1]['id'], 'srd51:2014:monster:bandit-captain')
        self.assertEqual(rows[1]['page'], 397)
        self.assertEqual(headings({395: 'Acolyte is mentioned in prose without a statblock.'}), [])

    def test_fractional_challenge_multiple_speeds_and_negative_modifiers(self):
        result = parse(BASE, 'Beast')
        self.assertEqual(result['challenge'], '1/4')
        self.assertEqual(result['xp'], 50)
        self.assertEqual(result['speed'], {'walk': 30, 'swim': 30})
        self.assertEqual(result['abilities'], {'str':15,'dex':14,'con':12,'int':1,'wis':10,'cha':3})

    def test_page_footer_and_thousands_separator(self):
        text = BASE.replace('STR DEX', 'System Reference Document 5.1 300 STR DEX').replace('1/4 (50 XP)', '6 (2,300 XP)')
        self.assertEqual(parse(text, 'Beast')['xp'], 2300)

    def test_missing_fields_cannot_leak_from_neighbor(self):
        missing = BASE[:BASE.index('Challenge')]
        with self.assertRaises(ValueError):
            parse(missing + BASE.replace('Beast Large', 'Neighbor Small'), 'Beast')

    def test_unsupported_speed_and_missing_ability_are_not_silently_accepted(self):
        for text in [BASE.replace('swim 30 ft.', 'fly 30 ft. (unknown)'), BASE.replace('swim 30 ft.', 'swim 30 ft. (hover)'), BASE.replace('3 (−4)', '')]:
            with self.assertRaises(ValueError):
                parse(text, 'Beast')

    def test_hover_preserves_zero_ground_speed_and_flying_speed(self):
        text = BASE.replace('30 ft., swim 30 ft.', '0 ft., fly 90 ft. (hover)')
        self.assertEqual(parse(text, 'Beast')['speed'], {'walk': 0, 'fly': 90})


if __name__ == '__main__':
    unittest.main()
