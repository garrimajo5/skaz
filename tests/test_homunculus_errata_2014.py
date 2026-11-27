import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "audit-homunculus-errata-2014.py"
SPEC = importlib.util.spec_from_file_location("homunculus_errata", SCRIPT)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class HomunculusErrataTest(unittest.TestCase):
    def test_tasha_negative_witness_cannot_be_confused_with_printed_page(self):
        pages = [AUDIT.normalize("Homunculus\n Servant"), AUDIT.normalize("Homunculus Servant (p. 62)")]
        self.assertEqual(AUDIT.named_pages(pages, AUDIT.TARGET), [1, 2])
        self.assertEqual(AUDIT.named_pages(pages, AUDIT.PRINTED_TARGET), [2])

    def test_capture_rejects_changed_bytes_even_with_expected_receipt(self):
        filename = "eberron-errata.pdf"
        pin = AUDIT.SOURCES[filename]
        fake = b"not the pinned PDF"
        receipt = {
            "requestedUrl": pin["url"], "finalUrl": pin["url"],
            "status": 200, "outcome": "complete", "bodyFile": filename,
            "bytes": len(fake), "sha256": pin["sha256"],
        }
        with TemporaryDirectory() as folder:
            folder = Path(folder)
            (folder / filename).write_bytes(fake)
            with self.assertRaisesRegex(ValueError, "does not match its pin"):
                AUDIT.inspect_capture(folder, filename, pin, receipt)

    def test_committed_evidence_preserves_both_edition_scopes(self):
        path = ROOT / "catalog" / "homunculus-errata-2014.json"
        report = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(report["ruleset"], "5e-2014")
        self.assertEqual(
            report["findings"],
            {
                "eberron": {"scope": "Eberron errata v2.0", "printedPage": 62, "pdfPages": [1, 2]},
                "tasha": {"scope": "Tasha errata v1.0 only", "namedErrataFound": False},
            },
        )
        self.assertEqual(set(report["sources"]), set(AUDIT.SOURCES))
        for filename, found in report["sources"].items():
            with self.subTest(filename=filename):
                pin = AUDIT.SOURCES[filename]
                self.assertEqual(found["sha256"], pin["sha256"])
                self.assertEqual(found["finalUrl"], pin["url"])
                self.assertEqual(found["errataVersion"], pin["errataVersion"])
                self.assertEqual(found["pdfPages"], pin["pages"])
                self.assertEqual(found["printedPage62Markers"], pin["homunculusPages"])
                self.assertEqual(found["normalizedPageSha256"], pin["pageHashes"])


if __name__ == "__main__":
    unittest.main()
