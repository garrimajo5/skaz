import runpy
import unittest
from pathlib import Path

audit = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/audit-srd-travel.py'))
source_distances, card_distances = audit['source_distances'], audit['card_distances']
TABLE = 'Travel Pace Pace Distance Traveled per . . . Minute Hour Day Effect Fast 400 feet 4 miles 30 miles penalty Normal 300 feet 3 miles 24 miles — Slow 200 feet 2 miles 18 miles Able to use stealth'
CARD = 'Быстрый: 400 футов в минуту, 4 мили в час, 30 миль в день; штраф\nОбычный: 300 футов в минуту, 3 мили в час, 24 мили в день; нет\nМедленный: 200 футов в минуту, 2 мили в час, 18 миль в день; скрытность'


class TravelAuditTests(unittest.TestCase):
    def test_daily_distances_are_not_recalculated_as_eight_hours(self):
        expected = source_distances(TABLE.replace(' ', '\n\t'))
        self.assertEqual(expected, card_distances(CARD))
        wrong = card_distances(CARD.replace('30 миль', '32 мили').replace('18 миль', '16 миль'))
        self.assertNotEqual(expected['Fast'], wrong['Fast'])
        self.assertNotEqual(expected['Slow'], wrong['Slow'])

    def test_incomplete_or_ambiguous_tables_fail_instead_of_using_prose(self):
        for source in [TABLE.replace('Slow 200 feet 2 miles 18 miles', ''), TABLE + TABLE,
                       TABLE.replace('30 miles', 'thirty miles'), 'Fast 400 feet 4 miles 30 miles']:
            with self.assertRaises(ValueError):
                source_distances(source)
        for card in [CARD + '\n' + CARD, CARD.replace('Обычный:', 'Другой:'), CARD.replace('футов', 'метров')]:
            with self.assertRaises(ValueError):
                card_distances(card)


if __name__ == '__main__':
    unittest.main()
