"""Offline parser regressions. Run: python -m unittest discover -s tests -p test_srd_spell_audit.py"""
import runpy
import unittest
from pathlib import Path

audit = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/audit-srd-spell-cards.py'))
parse, diff = audit['source_header'], audit['differences']


class HeaderAuditTests(unittest.TestCase):
    def test_miles_and_alternative_casting_time_are_not_silently_truncated(self):
        h = parse('Ward 3rd-level divination Casting Time: 1 action or 8 hours Range: 1 mile Components: V Duration: Until dispelled or triggered', 'Ward')
        self.assertEqual(h['range'], {'type': 'feet', 'feet': 5280})
        card = {'spell': {'ritual': False, 'concentration': False, 'range': h['range'],
                         'components': ['V'], 'duration': 'Пока не рассеяно или не сработает',
                         'castingTime': '1 действие или 8 часов'}}
        self.assertEqual(diff(card, h), [])
        card['spell']['castingTime'] = '1 действие'
        self.assertEqual(diff(card, h), ['castingTime'])

    def test_cross_page_header_and_optional_comma(self):
        h = parse('Ward 1st-level abjuration Casting Time: 1 action Range: Touch '
                  'System Reference Document 5.1 119 Components: V, S, M (water) '
                  'Duration: Concentration up to 10 minutes The body.', 'Ward')
        self.assertTrue(h['concentration'])
        self.assertEqual(h['duration'], 'up to 10 minutes')
        self.assertEqual(h['range'], {'type': 'touch'})
        self.assertEqual(h['components'], ['M', 'S', 'V'])

    def test_unknown_duration_cannot_swallow_the_next_spell(self):
        broken = 'Ward 1st-level abjuration Casting Time: 1 action Range: Touch Components: V, S, M (water) Duration: Unknown '
        neighbor = 'Neighbor 2nd-level illusion Casting Time: 1 action Range: Self Components: V, S, M (dust) Duration: Instantaneous'
        with self.assertRaises(ValueError):
            parse(broken + neighbor, 'Ward')

    def test_body_mention_is_not_a_heading(self):
        text = 'Ward is another spell. Ward 2nd-level illusion (ritual) Casting Time: 1 minute Range: 30 feet Components: V, M (dust) Duration: 24 hours'
        h = parse(text, 'Ward')
        self.assertTrue(h['ritual'])
        self.assertFalse(h['concentration'])
        self.assertEqual(h['range'], {'type': 'feet', 'feet': 30})

    def test_mismatch_reports_fields_and_accepts_duration_alias(self):
        h = parse('Ward 2nd-level illusion Casting Time: 1 action Range: Self Components: V Duration: Instantaneous', 'Ward')
        card = {'spell': {'ritual': False, 'concentration': False, 'range': {'type': 'self'},
                         'components': ['V'], 'duration': 'Мгновенно', 'castingTime': '1 действие'}}
        self.assertEqual(diff(card, h), [])
        card['spell'].update(concentration=True, range={'type': 'feet', 'feet': 30}, components=['S'])
        self.assertEqual(diff(card, h), ['range', 'concentration', 'components'])


if __name__ == '__main__':
    unittest.main()
