import json
from pathlib import Path
import runpy
import unittest

ROOT = Path(__file__).resolve().parents[1]
AUDIT = runpy.run_path(str(ROOT / "scripts/review-sacred-statue-publication-2014.py"))


def page(key, digital_id, cr):
    value, _, option_id, label = AUDIT["BOOKS"][key]
    return f"""
      <select><option id="{option_id}" value="{value}" selected>{label}</option></select>
      <ul class="rpgmonster-listing">
        <li class="info" data-type="monsters">
          <div class="monster-name">
            <a href="/monsters/{digital_id}-sacred-statue">Sacred Statue</a>
            <span class="source">{label}</span>
          </div>
          <div class="monster-challenge">{cr}</div>
          <div class="monster-type">Construct</div><div class="monster-size">Large</div>
          <div class="monster-alignment"></div>
        </li>
      </ul>""".encode("utf-8")


class SacredStatuePublicationTests(unittest.TestCase):
    def setUp(self):
        self.baseline = json.loads((ROOT / AUDIT["BASE"]).read_text(encoding="utf-8"))
        self.captures = {"mtof": page("mtof", 96536, "0"), "motm": page("motm", 2560907, "")}

    def build(self):
        return AUDIT["build"](self.baseline, self.captures)

    def test_same_literal_name_keeps_two_different_observations_and_digital_cr(self):
        result = self.build()
        old, new = result["observations"]
        self.assertEqual([old["observationId"], new["observationId"]], ["dndsu:bestiary:4893", "dndsu:bestiary:6720"])
        self.assertEqual([old["sourceIds"], new["sourceIds"]], [["113"], ["158"]])
        self.assertEqual([old["publisherFilterValue"], new["publisherFilterValue"]], ["33", "85"])
        self.assertNotEqual(old["digitalRow"]["cardUrl"], new["digitalRow"]["cardUrl"])
        self.assertEqual([old["digitalRow"]["challengeRating"], new["digitalRow"]["challengeRating"]], ["0", ""])
        self.assertIsNone(new["exactBookHeading"])

    def test_missing_selected_filter_or_wrong_displayed_source_rejected(self):
        original = self.captures["motm"]
        self.captures["motm"] = original.replace(b" selected", b"")
        with self.assertRaisesRegex(ValueError, "Source filter not selected"):
            self.build()
        self.captures["motm"] = original.replace(b'class="source">', b'class="source">Other ')
        with self.assertRaisesRegex(ValueError, "Unexpected source"):
            self.build()

    def test_shared_digital_url_or_wrong_name_requires_separate_review(self):
        original = self.captures["motm"]
        self.captures["motm"] = page("motm", 96536, "")
        with self.assertRaisesRegex(ValueError, "no longer differ"):
            self.build()
        self.captures["motm"] = original.replace(b">Sacred Statue</a>", b">Animated Statue</a>")
        with self.assertRaisesRegex(ValueError, "Unexpected result"):
            self.build()

    def test_index_cannot_promote_rules_parent_relationship_or_denominator(self):
        result = self.build()
        for key in ("printedChallengeRatingVerified", "fullStatBlocksCompared", "exactErrataVersionVerified", "accepted", "complete"):
            self.assertFalse(result[key])
        self.assertFalse(result["relatedPublicationEvidence"]["motmParentConnectionVerified"])
        self.assertIsNone(result["approvedDenominator"])
        self.assertIsNone(result["canonicalId"])
        self.baseline["accepted"] = True
        with self.assertRaisesRegex(ValueError, "review must remain open"):
            self.build()


if __name__ == "__main__":
    unittest.main()
