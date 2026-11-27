import importlib.util
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "audit-oracle-artificer-scope-2014.py"
spec = importlib.util.spec_from_file_location("oracle_artificer_scope", SCRIPT)
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)


class OracleArtificerScopeTest(unittest.TestCase):
    def test_region_has_exactly_one_ordered_pair_or_available_page_end(self):
        self.assertEqual(oracle.select_region("prefix start text finish", "start", "finish"), "start text")
        self.assertEqual(oracle.select_region("prefix start text", "start", None), "start text")

        for text in ("start start finish", "finish start", "start text", "start finish finish"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                oracle.select_region(text, "start", "finish")

    def test_capture_rejects_mismatched_bytes_before_opening_pdf(self):
        filename = "oracle-player-guide.pdf"
        pin = oracle.SOURCES[filename]
        with TemporaryDirectory() as folder:
            folder = Path(folder)
            raw = b"not the pinned PDF"
            (folder / filename).write_bytes(raw)
            receipt = {
                "requestedUrl": pin["url"], "finalUrl": pin["url"], "status": 200,
                "outcome": "complete", "bodyFile": filename, "bytes": len(raw), "sha256": pin["sha256"],
            }
            with self.assertRaisesRegex(ValueError, "does not match its pin"):
                oracle.inspect_capture(folder, filename, pin, receipt)

    def test_checked_report_preserves_campaign_boundaries_and_one_witness_per_clause(self):
        path = ROOT / "catalog" / "oracle-artificer-scope-2014.json"
        report = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(report["ruleset"], "5e-2014")
        self.assertEqual(report["campaignGuideVersion"], "1.5")
        self.assertEqual(report["witnesses"], {key: region["facts"] for key, region in oracle.REGIONS.items()})
        self.assertEqual({source["faqPage"] for source in report["sources"].values()}, {5, 8})
        for filename, source in report["sources"].items():
            self.assertEqual(source["sha256"], oracle.SOURCES[filename]["sha256"])
            self.assertEqual(
                source["normalizedRegionSha256"],
                {key: region["sha256"] for key, region in oracle.REGIONS.items()},
            )
        self.assertTrue(report["limits"]["campaignSpecific"])
        self.assertFalse(report["limits"]["globalPublicationEquivalenceEstablished"])
        self.assertFalse(report["limits"]["spellSlotRoundingVerified"])
        self.assertFalse(report["limits"]["automaticGrantOrRemoval"])
        self.assertFalse(report["limits"]["createsCatalogRecords"])
        self.assertFalse(report["limits"]["redistributionPermissionEstablished"])


if __name__ == "__main__":
    unittest.main()
