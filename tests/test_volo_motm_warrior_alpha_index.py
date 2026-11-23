import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[1]
AUDIT = runpy.run_path(str(ROOT / "scripts/review-volo-motm-warrior-alpha-index-2014.py"))


def capture(name, book, digital_id, kind, cr):
    value, _, option, label = AUDIT["BOOKS"][book]
    slug = name.lower().replace(" ", "-")
    return f"""
      <select><option id="{option}" value="{value}" selected>{label}</option></select>
      <ul class="rpgmonster-listing"><li class="info" data-type="monsters">
        <div class="monster-name"><a href="/monsters/{digital_id}-{slug}">{name}</a><span class="source">{label}</span></div>
        <div class="monster-challenge">{cr}</div><div class="monster-type">{kind}</div>
        <div class="monster-size">Medium</div><div class="monster-alignment">Neutral</div>
      </li></ul>""".encode("utf-8")


class VoloMotmWarriorAlphaTests(unittest.TestCase):
    def setUp(self):
        self.base = json.loads((ROOT / AUDIT["BASE"]).read_text(encoding="utf-8"))
        self.captures = {
            ("Firenewt Warrior", "vgtm"): capture("Firenewt Warrior", "vgtm", 17246, "Humanoid (firenewt)", "1/2"),
            ("Firenewt Warrior", "motm"): capture("Firenewt Warrior", "motm", 2560812, "Elemental", "1/2"),
            ("Shadow Mastiff Alpha", "vgtm"): capture("Shadow Mastiff Alpha", "vgtm", 17347, "Monstrosity", "2"),
            ("Shadow Mastiff Alpha", "motm"): capture("Shadow Mastiff Alpha", "motm", 2560912, "Monstrosity", "3"),
        }

    def build(self):
        return AUDIT["build"](self.base, self.captures)

    def test_report_keeps_original_rows_and_compares_only_different_fields(self):
        old, new = self.build()["groups"]
        self.assertEqual([r["observationId"] for r in old["observations"]], ["dndsu:bestiary:594", "dndsu:bestiary:6749"])
        self.assertEqual([r["observationId"] for r in new["observations"]], ["dndsu:bestiary:5678", "dndsu:bestiary:6936"])
        self.assertEqual(old["digitalDifferences"], {"type": {"vgtm": "Humanoid (firenewt)", "motm": "Elemental"}})
        self.assertEqual(new["digitalDifferences"], {"challengeRating": {"vgtm": "2", "motm": "3"}})
        for group in (old, new):
            self.assertEqual([r["sourceIds"] for r in group["observations"]], [["111"], ["158"]])
            self.assertEqual(group["observations"][0]["additionalLocator"]["relation"], "broader-heading")
            self.assertFalse(group["fullStatBlocksCompared"])
            self.assertFalse(group["aliasAccepted"])
            self.assertIsNone(group["canonicalId"])
        self.assertIsNone(self.build()["approvedDenominator"])

    def test_wrong_filter_and_wrong_displayed_source_are_rejected(self):
        key = ("Firenewt Warrior", "vgtm")
        old = self.captures[key]
        self.captures[key] = old.replace(b" selected", b"")
        with self.assertRaisesRegex(ValueError, "Source filter not selected"):
            self.build()
        self.captures[key] = old.replace(b'class="source">', b'class="source">Other ')
        with self.assertRaisesRegex(ValueError, "Unexpected source"):
            self.build()

    def test_reused_card_and_same_book_ordering_do_not_change_identity(self):
        key = ("Firenewt Warrior", "motm")
        old = self.captures[key]
        self.captures[key] = old.replace(b"2560812", b"17246")
        with self.assertRaisesRegex(ValueError, "One digital card"):
            self.build()
        self.captures[key] = old
        group = next(g for g in self.base["groups"] if g["name"] == "firenewt warrior")
        group["members"][1]["sourceIds"] = ["111"]
        with self.assertRaisesRegex(ValueError, "source membership"):
            self.build()

    def test_wrong_name_or_missing_capture_cannot_become_a_locator(self):
        key = ("Shadow Mastiff Alpha", "vgtm")
        self.captures[key] = self.captures[key].replace(b">Shadow Mastiff Alpha</a>", b">Shadow Mastiff</a>")
        with self.assertRaisesRegex(ValueError, "Unexpected result"):
            self.build()
        del self.captures[key]
        with self.assertRaisesRegex(ValueError, "Both books"):
            self.build()


if __name__ == "__main__":
    unittest.main()
