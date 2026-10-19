import runpy
import unittest
from pathlib import Path

audit = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/audit-srd-items.py'))
header, differences = audit['header'], audit['differences']


class ItemAuditTests(unittest.TestCase):
    def test_war_mage_variants_do_not_borrow_web_charges(self):
        text = 'Wand of the War Mage, +1, +2, or +3 Wand, uncommon (+1), rare (+2), or very rare (+3) (requires attunement by a spellcaster) While holding this wand, bonus. Wand of Web Wand, uncommon This wand has 7 charges.'
        for bonus, rarity in [(1, 'uncommon'), (2, 'rare'), (3, 'very-rare')]:
            value = header(text, 'Wand of the War Mage, +' + str(bonus))
            self.assertEqual(value['rarity'], rarity)
            self.assertNotIn('chargeMaximum', value)
        with self.assertRaises(ValueError):
            header(text.replace('rare (+2)', 'common (+2)'), 'Wand of the War Mage, +2')

    def test_wonder_ranges_ignore_nested_rolls_but_reject_gaps_and_overlap(self):
        ranges = audit['wonder_ranges']
        self.assertEqual(ranges('01–50: first\n01–25,\n26–50,\n51–100,\n51–00: second'), [[1, 50], [51, 100]])
        for text in ['01–49\n51–00', '01–50\n50–00', '01–99', '00–00', '01–50\n51–99']:
            with self.assertRaises(ValueError):
                ranges(text)

    def test_armor_subtype_is_not_attunement(self):
        self.assertEqual(header('Adamantine Armor Armor (medium or heavy, but not hide), uncommon Body.', 'Adamantine Armor'),
                         {'type': 'armor', 'rarity': 'uncommon', 'attunement': False})

    def test_multiline_attunement_requirement(self):
        value = header('Pearl of Power\nWondrous item, uncommon\n(requires attunement by a spellcaster) Body.', 'Pearl of Power')
        self.assertTrue(value['attunement'])
        self.assertEqual(value['requirementEn'], 'by a spellcaster')
        self.assertEqual(differences({'item': {'type': 'wondrous', 'rarity': 'uncommon', 'attunement': True, 'attunementRequirement': 'Заклинатель'}}, value), [])

    def test_rejects_missing_or_partial_heading(self):
        for text in ['Ring of Warmth appears here. Ring of Water Walking Ring, uncommon Body.', 'Ring of Warmth Ring, rare or legendary Body.', 'Ring of Warmth Ring, rare (special requirement) Body.']:
            with self.assertRaises(ValueError):
                header(text, 'Ring of Warmth')

    def test_requirements_are_not_silently_dropped(self):
        expected = header('Example Ring, rare (requires attunement by a paladin) Body.', 'Example')
        self.assertIn('unsupported attunement requirement: by a paladin', differences({'item': {'type': 'ring', 'rarity': 'rare', 'attunement': True}}, expected))
        self.assertIn('attunementRequirement', differences({'item': {'type': 'ring', 'rarity': 'rare', 'attunement': True, 'attunementRequirement': 'wrong'}}, {'type': 'ring', 'rarity': 'rare', 'attunement': True}))

    def table(self, rows):
        return 'Potion of Healing Potion, rarity varies Body. Potions of Healing Potion of … Rarity HP Regained ' + rows + ' Potion of Heroism Potion, rare Body.'

    def test_healing_rows_are_independent(self):
        text = self.table('Healing Common 2d4 + 2 Greater healing Uncommon 4d4 + 4 Superior healing Rare 8d4 + 8 Supreme healing Very rare 10d4 + 20')
        for name, rarity, count, bonus in [('Healing', 'common', 2, 2), ('Greater Healing', 'uncommon', 4, 4), ('Superior Healing', 'rare', 8, 8), ('Supreme Healing', 'very-rare', 10, 20)]:
            result = header(text, 'Potion of ' + name)
            self.assertEqual(result['rarity'], rarity)
            self.assertEqual(result['healing'], {'diceCount': count, 'diceSides': 4, 'bonus': bonus})

    def test_missing_basic_row_cannot_borrow_greater(self):
        with self.assertRaises(ValueError):
            header(self.table('Greater healing Uncommon 4d4 + 4'), 'Potion of Healing')

    def test_unbounded_table_fails(self):
        with self.assertRaises(ValueError):
            header('Healing Common 2d4 + 2', 'Potion of Healing')

    def test_field_differences_do_not_accept_extra_healing(self):
        expected = {'type': 'ring', 'rarity': 'rare', 'attunement': True}
        errors = differences({'item': {'type': 'potion', 'rarity': 'uncommon', 'attunement': False, 'healing': {'bonus': 2}}}, expected)
        self.assertEqual(errors, ['type', 'rarity', 'attunement', 'unexpected healing'])

    def test_wand_charges_are_not_borrowed_from_next_heading(self):
        expected = header('Wand of Secrets Wand, uncommon The wand has 3 charges. Body.', 'Wand of Secrets')
        self.assertEqual(expected['chargeMaximum'], 3)
        self.assertEqual(differences({'item': {'type': 'wand', 'rarity': 'uncommon', 'attunement': False, 'charges': {'max': 7, 'recharge': 'manual'}}}, expected), ['chargeMaximum'])
        with self.assertRaises(ValueError):
            header('Wand of Secrets Wand, uncommon Missing. Wand of Web Wand, uncommon This wand has 7 charges.', 'Wand of Secrets')


if __name__ == '__main__':
    unittest.main()
