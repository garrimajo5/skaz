import runpy
import unittest
from pathlib import Path

parse_page = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts/audit-xge-eepc-spell-locators.py")
)["parse_page"]
XGE = "xanathars-guide-to-everything"
CARD = '<a href="/spells/12-acid-splash" class="link">Acid Splash</a>'


def sample(option, listing, pagination=""):
    return (
        f'<select id="filter-source">{option}</select>{pagination}'
        '<ul class="listing listing-rpgspell rpgspell-listing">'
        f'{listing}</ul><div class="listing-footer">{CARD}</div>'
    )


def selected(value, name):
    return f'<option value="{value}" id="filter-source-{name}" selected="selected">Book</option>'


class PublisherSpellIndexTest(unittest.TestCase):
    def test_only_links_in_the_spell_list_count(self):
        self.assertEqual(parse_page(sample(selected("27", XGE), CARD), "27", XGE, 1, 1),
                         [("Acid Splash", "https://www.dndbeyond.com/spells/12-acid-splash")])

    def test_blank_selected_pota_list_is_preserved(self):
        book = "princes-of-the-apocalypse"
        self.assertEqual(parse_page(sample(selected("10", book), ""), "10", book, 1, 1), [])

    def test_wrong_or_additional_selected_sources_are_rejected(self):
        for row in [selected("10", XGE), selected("27", XGE) + selected("10", "other")]:
            with self.subTest(row=row), self.assertRaisesRegex(ValueError, "Unexpected selected source"):
                parse_page(sample(row, CARD), "27", XGE, 1, 1)

    def test_first_page_must_retain_the_source_in_its_next_link(self):
        active = '<span class="b-pagination-item s-active active">1</span>'
        good = '<a href="/spells?filter-source=27&amp;page=2" rel="next">Next</a>'
        stale = good.replace("source=27", "source=10")
        self.assertEqual(len(parse_page(sample(selected("27", XGE), CARD, active + good),
                                        "27", XGE, 1, 2)), 1)
        with self.assertRaisesRegex(ValueError, "Pagination"):
            parse_page(sample(selected("27", XGE), CARD, active + stale), "27", XGE, 1, 2)


if __name__ == "__main__":
    unittest.main()
