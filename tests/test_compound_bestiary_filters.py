import runpy
from pathlib import Path
import unittest


audit = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/audit-compound-bestiary-filters-2014.py"))


def capture(value, label, name, slug, source, *, href=None, extra_options=""):
    return f"""
    <select id="filter-source" name="filter-source">
      <option value="{value}" selected>{label}</option>{extra_options}
    </select>
    <ul class="rpgmonster-listing">
      <li data-type="monsters" data-slug="{slug}">
        <a href="/monsters/{href or slug}">{name}</a>
        <span class="source">{source}</span>
      </li>
    </ul>
    """.encode("utf-8")


class CompoundBestiaryFilterTest(unittest.TestCase):
    def test_preserves_displayed_book_separately_from_selected_book(self):
        raw = capture("33", "Mordenkainen’s Tome of Foes", "Orcus", "17417-orcus", "Out of the Abyss")
        result = audit["extract"](raw, "orcus", "33", "Mordenkainen’s Tome of Foes")
        self.assertEqual(result, {
            "name": "Orcus",
            "cardUrl": "https://www.dndbeyond.com/monsters/17417-orcus",
            "displayedPublication": "Out of the Abyss",
            "match": "exact",
        })

    def test_spelljammer_near_match_is_not_promoted_to_exact(self):
        label = "Spelljammer: Adventures in Space"
        raw = capture("90", label, "Chwinga Astronaut", "2821159-chwinga-astronaut", label)
        self.assertEqual(audit["extract"](raw, "chwinga", "90", label)["match"], "related-name-only")
        with self.assertRaisesRegex(ValueError, "Listing changed"):
            audit["extract"](raw, "wereraven", "90", label)

    def test_rejects_wrong_or_ambiguous_filter(self):
        raw = capture("9", "Out of the Abyss", "Orcus", "17417-orcus", "Out of the Abyss")
        with self.assertRaisesRegex(ValueError, "differs"):
            audit["extract"](raw, "orcus", "33", "Mordenkainen’s Tome of Foes")
        raw = capture(
            "9", "Out of the Abyss", "Orcus", "17417-orcus", "Out of the Abyss",
            extra_options='<option value="33" selected>Mordenkainen’s Tome of Foes</option>',
        )
        with self.assertRaisesRegex(ValueError, "selected publication"):
            audit["extract"](raw, "orcus", "9", "Out of the Abyss")

    def test_rejects_link_from_another_record(self):
        raw = capture("9", "Out of the Abyss", "Orcus", "17417-orcus", "Out of the Abyss", href="2560897-orcus")
        with self.assertRaisesRegex(ValueError, "does not match its row"):
            audit["extract"](raw, "orcus", "9", "Out of the Abyss")
