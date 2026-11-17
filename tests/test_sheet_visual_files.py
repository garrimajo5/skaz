"""Checks only committed synthetic PDFs/images, not OCR or real player sheets."""
import json, unittest
from pathlib import Path
from PIL import Image
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[1]/'docs/design/fixtures/sheet-visual'
M=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
ASSETS=[a for c in M['cases']+M['extraCases'] for a in c['assets']]+[M['qualityCase']['asset']]
class VisualFiles(unittest.TestCase):
 def test_image_dimensions_match_actual_decoded_files(self):
  for a in ASSETS:
   if a['file'].endswith(('.png','.jpg')):
    with self.subTest(file=a['file']),Image.open(ROOT/a['file']) as im:
     im.load();self.assertEqual(im.size,(a['width'],a['height']));self.assertEqual(im.mode,'RGB')
 def test_pdf_pages_are_a4_and_not_encrypted_or_interactive(self):
  for a in ASSETS:
   if a['file'].endswith('.pdf'):
    with self.subTest(file=a['file']):
     r=PdfReader(ROOT/a['file']);self.assertFalse(r.is_encrypted);self.assertEqual(len(r.pages),a['pages'])
     self.assertNotIn('/OpenAction',r.trailer['/Root']);self.assertNotIn('/AcroForm',r.trailer['/Root'])
     for page in r.pages:self.assertAlmostEqual(float(page.mediabox.width),595.28,places=1);self.assertAlmostEqual(float(page.mediabox.height),841.89,places=1)
 def test_text_and_scan_are_distinct_inputs(self):
  self.assertIn('Лира',PdfReader(ROOT/'single-class-text.pdf').pages[0].extract_text())
  self.assertEqual(PdfReader(ROOT/'single-class-scan.pdf').pages[0].extract_text().strip(),'')
  self.assertIn('Lyra',PdfReader(ROOT/'english-two-column.pdf').pages[0].extract_text())
 def test_conflicting_pages_retain_both_disagreeing_values(self):
  r=PdfReader(ROOT/'conflicting-pages.pdf');a,b=[p.extract_text() for p in r.pages]
  self.assertIn('Бард 5',a);self.assertIn('33',a);self.assertIn('Бард 4',b);self.assertIn('27',b)
if __name__=='__main__':unittest.main()
