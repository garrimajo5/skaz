from pathlib import Path
import runpy
import unittest


audit = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/audit-guard-drake-source-edition-2014.py"))
HELPER = audit["HELPER"]


def root(html):
    parser = HELPER["Tree"]()
    parser.feed(html)
    return parser.root


def errata(appendix="Appendix D", first="The Damage Resistances entry has been cut.",
           second="The Multiattack entry now says one Bite attack and one Tail attack."):
    return root(f"""
    <div class="p-article-content">
        <h2>{appendix}</h2>
        <h3>Guard Drake (p. 185)</h3>
        <ul><li>{first}</li><li>{second}</li></ul>
        <h3>Another creature</h3>
        <p>The Multiattack entry now says one Bite attack and one Tail attack.</p>
    </div>
    """)


class GuardDrakeEditionTest(unittest.TestCase):
    def test_two_clauses_in_the_named_appendix(self):
        self.assertEqual(audit["digital_corrections"](errata()), {
            "damageResistances": "remove-entry",
            "multiattack": [{"attack": "Bite", "count": 1}, {"attack": "Tail", "count": 1}],
        })

    def test_exact_printed_page_and_appendix_are_required(self):
        with self.assertRaisesRegex(ValueError, "outside Appendix D"):
            audit["digital_corrections"](errata(appendix="Appendix B"))
        with self.assertRaisesRegex(ValueError, "Guard Drake correction"):
            audit["digital_corrections"](root('<div class="p-article-content"><h2>Appendix D</h2>'
                                              '<h3>Guard Drake (p. 186)</h3></div>'))

    def test_a_correct_phrase_from_another_creature_cannot_fill_an_unclear_clause(self):
        with self.assertRaisesRegex(ValueError, "one bite attack"):
            audit["digital_corrections"](errata(second="The Multiattack entry now says two Bite attacks."))

    def test_appendix_contents_are_distinct_from_the_main_contents(self):
        page = root('<div class="compendium-toc-full"><h2>Contents</h2></div>'
                    '<div class="compendium-toc-full"><h2>Appendix D: Monsters</h2>'
                    '<a href="/sources/tod/monsters#GuardDrake">Guard Drake</a></div>')
        appendix = audit["scoped_toc"](page, "Appendix D: Monsters")
        self.assertEqual(HELPER["find_link"](appendix, "Guard Drake", "/sources/tod/monsters#GuardDrake"),
                         "https://www.dndbeyond.com/sources/tod/monsters#GuardDrake")
        with self.assertRaisesRegex(ValueError, "official locator"):
            HELPER["find_link"](audit["scoped_toc"](page, "Contents"), "Guard Drake",
                                "/sources/tod/monsters#GuardDrake")
