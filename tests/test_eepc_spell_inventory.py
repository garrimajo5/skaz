import runpy
import unittest
from pathlib import Path

implementation = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/audit-eepc-spell-inventory.py"))
extract_headings = implementation["extract_headings"]
join_observations = implementation["join_observations"]


class EepcSpellInventoryTest(unittest.TestCase):
    def test_only_description_headings_count_and_ritual_is_retained(self):
        result = extract_headings([
            "List only\n2nd-level transmutation",
            "Spell Descriptions\nSkywrite\n2nd-level transmutation (ritual)",
            "Melf�s Minute Meteors\n3rd-level evocation",
        ])
        self.assertEqual(set(result), {"skywrite", "melf's minute meteors"})
        self.assertEqual(result["skywrite"], {
            "pdfPage": 2, "level": 2, "school": "transmutation", "ritual": True,
        })

    def test_ambiguous_boundary_and_duplicate_heading_are_rejected(self):
        for body in [
            "Spell Descriptions\nSpell Descriptions",
            "Spell Descriptions\nGust\nTransmutation cantrip\nGust\nTransmutation cantrip",
        ]:
            with self.subTest(body=body), self.assertRaises(ValueError):
                extract_headings([body])

    def test_unknown_replacement_character_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unrecognized character"):
            extract_headings(["Spell Descriptions\nGuff�\nTransmutation cantrip"])

    def test_two_sources_preserve_pages_but_disagreeing_metadata_is_rejected(self):
        observations = [{"id": "a", "names": {"en": "Gust"}, "sourceIds": ["107", "109"]}]
        first = extract_headings(["Spell Descriptions\nGust\nTransmutation cantrip"])
        second = extract_headings(["Spell Descriptions", "Gust\nTransmutation cantrip"])
        result = join_observations(observations, first, second)
        self.assertEqual(result[0]["pdfPages"], {"ee2015": 1, "ee2016": 2})
        self.assertEqual(result[0]["originalSourceIds"], ["107", "109"])
        second["gust"]["level"] = 1
        with self.assertRaisesRegex(ValueError, "Publisher metadata differs"):
            join_observations(observations, first, second)


if __name__ == "__main__":
    unittest.main()
