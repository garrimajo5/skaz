"""Checks only committed synthetic PDFs/images, not OCR or real player sheets."""
import json, unittest
from pathlib import Path
from PIL import Image, ImageChops, ImageOps, ImageStat
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
 def test_exif_normalization_preserves_the_hp_and_dexterity_regions(self):
  case=next(c for c in M['cases'] if c['id']=='single-class')
  asset=next(a for a in case['assets'] if a['kind']=='jpeg-exif')
  original=next(a for a in case['assets'] if a['sha256']==asset['derivedFromSha256'])
  raw_rotation=next(a for a in case['assets'] if a['kind']=='jpeg-rotated')
  with Image.open(ROOT/asset['file']) as encoded, Image.open(ROOT/original['file']) as png, Image.open(ROOT/raw_rotation['file']) as manual:
   self.assertEqual(encoded.getexif().get(0x0112),6)
   self.assertIsNone(manual.getexif().get(0x0112))
   self.assertEqual(encoded.tobytes(),manual.tobytes(),'same rotated pixels with a different orientation path')
   upright=ImageOps.exif_transpose(encoded)
   self.assertEqual(upright.size,(asset['uprightWidth'],asset['uprightHeight']))
   self.assertEqual(upright.size,png.size)
   self.assertIsNone(upright.getexif().get(0x0112),'avoid applying the tag a second time')
   fields={'hp.max','hp.current','hp.temp','abilities.dex'}
   for field in fields:
    region=next(r for r in case['regions'] if r['field']==field)
    with self.subTest(field=field):
     x,y,width,height=region['box'];box=(x,y,x+width,y+height)
     expected=png.crop(box).convert('L')
     self.assertLess(expected.getextrema()[0],64,'region contains printed ink')
     residual=ImageChops.difference(expected,upright.crop(box).convert('L'))
     self.assertLess(ImageStat.Stat(residual).mean[0],3.0,'canonical raster ROI within JPEG tolerance')
 def test_partial_crop_matches_source_pixels_without_attributing_digits(self):
  original=next(c for c in M['cases'] if c['id']=='unknown-hp')
  crop=next(c for c in M['extraCases'] if c['id']=='cropped-hp')
  asset=crop['assets'][0]
  source=next(a for a in original['assets'] if a['sha256']==asset['derivedFromSha256'])
  x,y,w,h=asset['cropSourceBox']
  with Image.open(ROOT/source['file']) as complete, Image.open(ROOT/asset['file']) as partial:
   self.assertEqual(ImageChops.difference(complete.crop((x,y,x+w,y+h)),partial).getbbox(),None)
   self.assertFalse(crop['regions'],'source crop contains no attributable field region')
   for field,has_ink in [('hp.max',True),('hp.current',False),('hp.temp',True)]:
    with self.subTest(field=field):
     left,top,width,height=next(r['box'] for r in original['regions'] if r['field']==field)
     visible=partial.crop((left-x,top-y,min(left+width,x+w)-x,top+height-y)).convert('L')
     self.assertEqual(visible.getextrema()[0]<64,has_ink)
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
