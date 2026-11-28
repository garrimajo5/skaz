from pathlib import Path
import runpy
import unittest


audit = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/audit-tod-npc-errata-2014.py"))


def root(html):
    parser = audit["helpers"]["Tree"]()
    parser.feed(html)
    return parser.root


class TyrannyNpcErrataTest(unittest.TestCase):
    def test_spelling_is_not_inferred_from_a_different_subject(self):
        body = root('<div class="p-article-content"><h2>Appendix D</h2>'
                    '<h3>Nerovain (p. 187)</h3><p>Change</p></div>')
        self.assertEqual(audit["errata_text"](body, "Nerovain"), "Change")
        with self.assertRaisesRegex(ValueError, "Neronvain errata heading"):
            audit["errata_text"](body, "Neronvain")

    def test_section_required_and_next_creature_excluded(self):
        body = root('<div class="p-article-content"><h2>Appendix D</h2>'
                    '<h3>Pharblex Spattergoo (p. 187)</h3><p>First</p>'
                    '<h3>Nerovain (p. 187)</h3><p>Second</p></div>')
        self.assertEqual(audit["errata_text"](body, "Pharblex Spattergoo"), "First")
        with self.assertRaisesRegex(ValueError, "outside Appendix D"):
            audit["errata_text"](root('<div class="p-article-content"><h2>Appendix C</h2>'
                                     '<h3>Nerovain (p. 187)</h3></div>'), "Nerovain")

    def test_each_clauses_own_field_and_unknown_prior_save_dc(self):
        text = ("In the Shortsword action, the melee weapon attack modifier changed from +7 to +6. "
                "In the Poisonous Cloud action, the DC in the third sentence has changed to 15.")
        self.assertEqual(audit["amendments"](text, "Nerovain"), [
            {"action": "Shortsword", "field": "attackModifier", "from": 7, "to": 6},
            {"action": "Poisonous Cloud", "field": "saveDc", "from": None, "to": 15},
        ])
        with self.assertRaisesRegex(ValueError, "save DC correction changed"):
            audit["amendments"](text.replace("Poisonous Cloud", "Different Action"), "Nerovain")

    def test_spell_replacement_is_scoped_to_spellcasting_and_keeps_old_name(self):
        text = 'The Spellcasting trait uses “Poison Cloud” now replaced with “Poison Spray”.'
        self.assertEqual(audit["amendments"](text, "Pharblex Spattergoo"),
                         [{"field": "spellcastingSpell", "from": "Poison Cloud", "to": "Poison Spray"}])
        with self.assertRaisesRegex(ValueError, "spell replacement changed"):
            audit["amendments"](text.replace("Spellcasting trait", "loot"), "Pharblex Spattergoo")
