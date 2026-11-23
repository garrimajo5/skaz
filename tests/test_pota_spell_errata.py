import runpy
import unittest
from pathlib import Path

extract_appendix = runpy.run_path(
    str(Path(__file__).resolve().parents[1] / "scripts/audit-pota-spell-errata.py")
)["extract_appendix"]

SPELLS = [
    {"observationId": "tidal", "observedName": "Tidal wave", "school": "conjuration"},
    {"observationId": "catapult", "observedName": "Catapult", "school": "transmutation"},
]
APPENDIX = (
    "Version 1.5 Appendix B Sorcerer Spells (p. 231). Tidal wave (con- juration) (5th printing). "
    "Catapult (p. 233). Correction. (fu - ture printing). Correction. (5th printing)."
)


class PotaSpellErrataTest(unittest.TestCase):
    def test_class_and_description_phases_remain_separate(self):
        descriptions, additions = extract_appendix(APPENDIX, SPELLS)
        self.assertEqual(additions[0]["printing"], "5th")
        self.assertEqual(additions[0]["observationId"], "tidal")
        self.assertEqual(descriptions[0]["printings"], ["future", "5th"])
        self.assertEqual(descriptions[0]["printedPage"], 233)

    def test_wrong_version_and_unlabelled_amendment_are_rejected(self):
        for body in [
            APPENDIX.replace("Version 1.5", "Version 1.0"),
            APPENDIX.replace("(fu - ture printing). Correction. (5th printing).", ""),
        ]:
            with self.subTest(body=body), self.assertRaises(ValueError):
                extract_appendix(body, SPELLS)

    def test_conflicting_school_is_not_imported(self):
        with self.assertRaisesRegex(ValueError, "changed school"):
            extract_appendix(APPENDIX.replace("con- juration", "evocation"), SPELLS)


if __name__ == "__main__":
    unittest.main()
