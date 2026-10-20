import runpy
import unittest
from pathlib import Path

parse = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['statistics']
BASE = ('Beast Large beast, unaligned Armor Class 12 (natural armor) '
        'Hit Points 13 (2d10 + 2) Speed 30 ft., swim 30 ft. '
        'STR DEX CON INT WIS CHA 15 (+2) 14 (+2) 12 (+1) 1 (−5) 10 (+0) 3 (−4) '
        'Senses passive Perception 10 Languages — Challenge 1/4 (50 XP)')


class MonsterAuditTests(unittest.TestCase):
    def test_prepared_caster_list_preserves_levels_slots_and_spell_ids(self):
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+' Spellcasting. The beast has the following wizard spells prepared: Cantrips (at will): mage hand, ray of frost 1st level (4 slots): shield, magic missile 6th level (1 slot): harm Actions Bite.'
        rows=m['spellcasting_levels'](text,'Beast')
        self.assertEqual([r['level'] for r in rows],[0,1,6])
        self.assertEqual([r['slots'] for r in rows],[None,4,1])
        self.assertEqual(rows[0]['spellIds'],['srd51:2014:spell:mage-hand','srd51:2014:spell:ray-of-frost'])
        with self.assertRaises(ValueError):m['spellcasting_levels'](text.replace('6th level','1st level'),'Beast')
        with self.assertRaises(ValueError):m['spellcasting_levels'](BASE+' Other Medium undead '+text,'Beast')

    def test_caster_manifest_rejects_wrong_slots_missing_link_or_missing_authored_spell(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        text=BASE+' Spellcasting. The beast has the following cleric spells prepared: Cantrips (at will): mage hand 6th level (1 slot): harm Actions Bite.'
        levels=m['spellcasting_levels'](text,'Beast')
        manifest={'sourceSha256':m['SHA256'],'entries':[{'id':'source:beast','pages':[311]}],'spellcastingChecks':[{'monsterId':'source:beast','nameEn':'Beast','levels':levels}]}
        cards=[{'id':'source:beast','name':{'en':'Beast'},'links':['srd51:2014:spell:mage-hand','srd51:2014:spell:harm'],'text':'mage hand, harm'}]
        spells=[{'id':'srd51:2014:spell:mage-hand','name':{'en':'Mage Hand'},'spell':{'level':0}},{'id':'srd51:2014:spell:harm','name':{'en':'Harm'},'spell':{'level':6}}]
        self.assertEqual(m['check_spellcasting_inventory']({311:text},manifest,cards,spells),{'Beast':2})
        wrong=copy.deepcopy(manifest);wrong['spellcastingChecks'][0]['levels'][1]['slots']=2
        with self.assertRaises(ValueError):m['check_spellcasting_inventory']({311:text},wrong,cards,spells)
        for bad in [[{**cards[0],'links':cards[0]['links'][:1]}],[{**cards[0],'text':'mage hand only'}],[{**cards[0],'text':'mage hand and charm'}]]:
            with self.assertRaises(ValueError):m['check_spellcasting_inventory']({311:text},manifest,bad,spells)
        with self.assertRaises(ValueError):m['check_spellcasting_inventory']({311:text},manifest,cards,spells[:1])
        wrong_spells=copy.deepcopy(spells);wrong_spells[1]['spell']['level']=5
        with self.assertRaises(ValueError):m['check_spellcasting_inventory']({311:text},manifest,cards,wrong_spells)

    def test_undead_source_inventory_keeps_gaps_and_rejects_false_prepared_cards(self):
        import copy
        m=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={311:'Ghouls Ghast Medium undead.',346:'Skeletons Skeleton Medium undead. Minotaur Skeleton Large undead.',355:"Will-\u00ad\u2010o’-\u00ad\u2010Wisp Tiny undead. Wraith Medium undead.",356:'Zombies Zombie Medium undead.'}
        rows=m['undead_headings'](pages)
        self.assertEqual([r['nameEn'] for r in rows],['Ghast','Skeleton','Minotaur Skeleton','Will-o’-Wisp','Wraith','Zombie'])
        manifest={'sourceSha256':m['SHA256'],'ruleset':'5e-2014','sourcePageRange':[254,394],'expectedCount':6,'entries':rows}
        cards=[{'id':r['id'],'name':{'en':r['nameEn']},'monster':{'type':'undead'},'source':{'url':'https://source.invalid/#page='+str(r['page'])}} for r in rows[:2]]
        self.assertEqual(m['check_undead_inventory'](pages,manifest,cards),{'expected':6,'prepared':2})
        for bad in [cards+cards[:1],[{**cards[0],'monster':{'type':'beast'}}]]:
            with self.assertRaises(ValueError):m['check_undead_inventory'](pages,manifest,bad)
        wrong=copy.deepcopy(manifest);wrong['entries'][0]['page']=312
        with self.assertRaises(ValueError):m['check_undead_inventory'](pages,wrong,cards)
        wrong=copy.deepcopy(manifest);wrong['entries'].pop()
        with self.assertRaises(ValueError):m['check_undead_inventory'](pages,wrong,cards)

    def test_compound_creature_name_normalizes_pdf_discretionary_hyphens(self):
        text=BASE.replace('Beast Large beast',"Will-\u00ad\u2010o’-\u00ad\u2010Wisp Large undead")
        self.assertEqual(parse(text,"Will-o’-Wisp")['hitPoints'],13)
        with self.assertRaises(ValueError):parse(text,'Willow Wisp')

    def test_construct_inventory_spans_sections_without_importing_their_labels(self):
        import copy
        module=runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))
        pages={263:'Animated Objects Animated Armor Medium construct.',264:'Rug of Smothering Large construct.',315:'Golems Clay Golem Large construct.',317:'Iron Golem Large construct. Gorgon Large monstrosity.'}
        rows=module['type_headings'](pages,'construct')
        self.assertEqual([r['nameEn'] for r in rows],['Animated Armor','Rug of Smothering','Clay Golem','Iron Golem'])
        manifest={'sourceSha256':module['SHA256'],'ruleset':'5e-2014','sourcePageRange':[254,394],'sections':[{'monsterType':'construct','expectedCount':4,'entries':rows}]}
        cards=[{'id':r['id'],'name':{'en':r['nameEn']},'monster':{'type':'construct'},'source':{'url':'https://source.invalid/#page='+str(r['page'])}} for r in rows]
        self.assertEqual(module['check_type_inventory'](pages,manifest,cards,('construct',)),{'construct':4})
        for bad in [cards[:3],cards+cards[:1],[{**cards[0],'monster':{'type':'fey'}},*cards[1:]]]:
            with self.assertRaises(ValueError):module['check_type_inventory'](pages,manifest,bad,('construct',))
        broken=copy.deepcopy(manifest);broken['sections'][0]['entries'][2]['page']=316
        with self.assertRaises(ValueError):module['check_type_inventory'](pages,broken,cards,('construct',))
        with self.assertRaises(ValueError):module['check_type_inventory'](pages,manifest,cards)

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
