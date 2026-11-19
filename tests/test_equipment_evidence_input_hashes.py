import hashlib,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class InputHashTests(unittest.TestCase):
    def test_crlf_lf_equivalence_and_content_change(self):
        for file in ['audit-srd-armor-weapons.py','audit-srd-gear-tool-weights.py']:
            digest=runpy.run_path(str(ROOT/'scripts'/file))['input_digest']
            self.assertEqual(digest(b'{\n"value":1\n}\n'),digest(b'{\r\n"value":1\r\n}\r\n'))
            self.assertNotEqual(digest(b'{\n"value":1\n}\n'),digest(b'{\n"value":2\n}\n'))
            self.assertNotEqual(digest(b'x\ry'),digest(b'x\ny'))
