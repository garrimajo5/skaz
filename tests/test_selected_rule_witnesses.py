"""Behavior tests for witness scope, pinned versions and non-acceptance."""
import copy
import hashlib
import importlib.util
import unittest
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("selected_rule_witnesses", Path(__file__).resolve().parents[1] / "scripts/audit-selected-rule-witnesses.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class SelectedRuleWitnessTests(unittest.TestCase):
    def setUp(self):
        self.blobs = {"test": b"a pinned, synthetic source"}
        self.pages = {"test": ["Previous item. Selected item. See invisible creatures. Next item. This robe has 3 charges."]}
        self.contract = {"ruleset": "5e-2014", "acceptedForRuntime": False, "runtimeChanged": False,
                         "sources": [{"id": "test", "sha256": hashlib.sha256(self.blobs["test"]).hexdigest(), "pageCount": 1}],
                         "units": [{"key": "selected", "source": "test", "pdfPage": 1, "start": "Selected item.", "stop": "Next item.",
                                    "anchors": ["See invisible creatures"], "forbidden": ["3 charges"]}]}

    def test_next_item_does_not_contaminate_selected_item(self):
        result = mod.audit(self.contract, self.blobs, self.pages)
        self.assertEqual(result["anchorCount"], 1)
        self.assertFalse(result["acceptedForRuntime"])
        self.assertFalse(result["ruleInterpretationVerified"])

    def test_anchor_in_adjacent_item_is_not_a_witness(self):
        self.contract["units"][0]["anchors"] = ["3 charges"]
        with self.assertRaisesRegex(ValueError, "Missing scoped witness"):
            mod.audit(self.contract, self.blobs, self.pages)

    def test_foreign_fact_inside_scope_is_rejected(self):
        self.pages["test"][0] = "Selected item. See invisible creatures. 3 charges. Next item."
        with self.assertRaisesRegex(ValueError, "Foreign rule"):
            mod.audit(self.contract, self.blobs, self.pages)

    def test_changed_pdf_even_with_same_words_is_rejected(self):
        self.blobs["test"] = b"replacement edition with same visible words"
        with self.assertRaisesRegex(ValueError, "Source hash differs"):
            mod.audit(self.contract, self.blobs, self.pages)

    def test_2024_contract_is_not_silently_used(self):
        self.contract["ruleset"] = "5e-2024"
        with self.assertRaisesRegex(ValueError, "2014"):
            mod.audit(self.contract, self.blobs, self.pages)

    def test_runtime_acceptance_cannot_be_promoted(self):
        self.contract["acceptedForRuntime"] = True
        with self.assertRaisesRegex(ValueError, "cannot promote"):
            mod.audit(self.contract, self.blobs, self.pages)

    def test_duplicate_heading_needs_manual_disambiguation(self):
        self.pages["test"][0] += " Selected item. another occurrence Next item."
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            mod.audit(self.contract, self.blobs, self.pages)

    def test_stop_before_start_is_not_an_end(self):
        with self.assertRaisesRegex(ValueError, "section end"):
            mod.section("Next item. Selected item. See invisible creatures.", "Selected item.", "Next item.")

    def test_whitespace_is_normalized_but_apostrophes_are_not_aliases(self):
        self.assertEqual(mod.section("Selected\n item. A\t B Next item.", "Selected item.", "Next item."), "Selected item. A B ")
        self.assertNotEqual(mod.normalize("Fraz-Urb’luu"), mod.normalize("Fraz-Urb'luu"))

    def test_missing_source_or_page_count_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "exactly"):
            mod.audit(self.contract, {}, self.pages)
        with self.assertRaisesRegex(ValueError, "page count"):
            mod.audit(self.contract, self.blobs, {"test": []})

    def test_invalid_page_and_empty_anchor_are_rejected(self):
        c = copy.deepcopy(self.contract)
        c["units"][0]["pdfPage"] = True
        with self.assertRaisesRegex(ValueError, "Invalid source page"):
            mod.audit(c, self.blobs, self.pages)
        self.contract["units"][0]["anchors"] = ["  "]
        with self.assertRaisesRegex(ValueError, "Empty witness"):
            mod.audit(self.contract, self.blobs, self.pages)

    def test_duplicate_unit_is_rejected(self):
        self.contract["units"].append(copy.deepcopy(self.contract["units"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            mod.audit(self.contract, self.blobs, self.pages)


    def test_primary_source_cannot_be_overwritten_by_report(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.pdf"
            source.write_bytes(b"synthetic primary bytes")
            with self.assertRaises(FileExistsError):
                mod.write_new_report(source, "replacement")
            self.assertEqual(source.read_bytes(), b"synthetic primary bytes")

    def test_existing_review_report_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "review.json"
            report.write_text("first evidence", encoding="utf-8")
            with self.assertRaises(FileExistsError):
                mod.write_new_report(report, "second evidence")
            self.assertEqual(report.read_text(encoding="utf-8"), "first evidence")

    def test_new_report_is_written_without_changing_source(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "review.json"
            mod.write_new_report(report, '{"accepted":false}\n')
            self.assertEqual(report.read_text(encoding="utf-8"), '{"accepted":false}\n')


if __name__ == "__main__":
    unittest.main()
