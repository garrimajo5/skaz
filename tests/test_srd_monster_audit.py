import runpy
import unittest
from pathlib import Path

parse = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-monsters.py'))['statistics']
BASE = ('Beast Large beast, unaligned Armor Class 12 (natural armor) '
        'Hit Points 13 (2d10 + 2) Speed 30 ft., swim 30 ft. '
        'STR DEX CON INT WIS CHA 15 (+2) 14 (+2) 12 (+1) 1 (−5) 10 (+0) 3 (−4) '
        'Senses passive Perception 10 Languages — Challenge 1/4 (50 XP)')


class MonsterAuditTests(unittest.TestCase):
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
