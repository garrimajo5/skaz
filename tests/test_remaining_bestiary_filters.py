import json
from pathlib import Path
import runpy
import unittest


audit = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/audit-remaining-bestiary-filters-2014.py"))
BOOK = "Spelljammer: Adventures in Space"


def page(rows, *, query="space hamster", paging=""):
    return f"""
    <input id="filter-search" name="filter-search" value="{query}">
    <select id="filter-source" name="filter-source">
      <option value="90" selected>{BOOK}</option>
    </select>
    <ul class="rpgmonster-listing">{rows}</ul>{paging}
    """.encode("utf-8")


def row(name, slug, *, href=None):
    return f"""
    <li class="info" data-type="monsters" data-slug="{slug}">
      <div class="monster-name"><a href="/monsters/{href or slug}">{name}</a><span class="source">{BOOK}</span></div>
      <span class="monster-challenge">1/4</span><span class="monster-type">Monstrosity</span>
      <span class="monster-size">Tiny</span><span class="monster-alignment">Unaligned</span>
    </li>
    """


class RemainingBestiaryFiltersTest(unittest.TestCase):
    def verify(self, markup, query="space hamster"):
        return audit["query_evidence"](markup, query, "90", BOOK)

    def test_exact_name_and_longer_name_remain_distinct(self):
        result = self.verify(page(row("Giant Space Hamster", "2821167-giant-space-hamster")
                                  + row("Space Hamster", "2821199-space-hamster")))
        self.assertEqual([entry["nameMatch"] for entry in result], ["different", "exact"])
        self.assertEqual(result[1]["cardUrl"], "https://www.dndbeyond.com/monsters/2821199-space-hamster")

    def test_parenthetical_qualifier_is_preserved(self):
        result = self.verify(page(row("Amphisbaena (Monstrosity)", "309672-amphisbaena-monstrosity"),
                                  query="amphisbaena"), "amphisbaena")
        self.assertEqual(result[0]["nameMatch"], "different")

    def test_empty_response_requires_its_marker_and_no_cards(self):
        marker = '<li class="no-results">No monster rows</li>'
        self.assertEqual(self.verify(page(marker)), [])
        with self.assertRaisesRegex(ValueError, "Unexpected digital unit set"):
            self.verify(page(""))
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.verify(page(marker + row("Space Hamster", "2821199-space-hamster")))

    def test_requires_the_captured_search_and_independent_filter(self):
        one = row("Space Hamster", "2821199-space-hamster")
        with self.assertRaisesRegex(ValueError, "search differs"):
            self.verify(page(one, query="hamster"))
        with self.assertRaisesRegex(ValueError, "filter differs"):
            self.verify(page(one).replace(b'value="90"', b'value="36"'))

    def test_cannot_treat_first_of_multiple_pages_as_complete(self):
        next_page = '<a href="/monsters?filter-search=space+hamster&amp;filter-source=90&amp;page=2">Next</a>'
        with self.assertRaisesRegex(ValueError, "Paginated search"):
            self.verify(page(row("Space Hamster", "2821199-space-hamster"), paging=next_page))

    def test_rejects_different_card_from_search_row(self):
        with self.assertRaisesRegex(ValueError, "does not match its row"):
            self.verify(page(row("Space Hamster", "2821199-space-hamster", href="2821167-giant-space-hamster")))

    def test_exact_input_claim_scope_prevents_deduplication_or_missing_claim(self):
        proposals = json.loads(audit["INPUT"].read_text(encoding="utf-8"))
        self.assertEqual(len(audit["checked_claims"](proposals)), 24)
        claims = next(group["publicationClaims"] for group in proposals["groups"] if group["name"] == "bard")
        first = claims.pop()
        with self.assertRaisesRegex(ValueError, "Changed D02 claim scope"):
            audit["checked_claims"](proposals)
        claims.extend([first, first])
        with self.assertRaisesRegex(ValueError, "Changed D02 claim scope"):
            audit["checked_claims"](proposals)


    def test_alternate_query_cannot_replace_the_reference_name(self):
        raw = page(row("Redbrand Ruffian", "22030-redbrand-ruffian"), query="redbrand ruffian")
        result = audit["query_evidence"](raw, "redbrand ruffian", "90", BOOK, claim_name="red ruffian")
        self.assertEqual(result[0]["nameMatch"], "different")

    def test_dedicated_edition_filter_invalidates_its_recorded_absence(self):
        check = audit["require_unavailable_filter"]
        raw = page('<li class="no-results">No cards</li>')
        check(raw, "Rise of Tiamat")
        with self.assertRaisesRegex(ValueError, "now available"):
            check(raw.replace(b'</select>', b'<option value="91">The Rise of Tiamat</option></select>'),
                  "Rise of Tiamat")
