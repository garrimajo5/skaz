import runpy
import unittest
from pathlib import Path
extract = runpy.run_path(str(Path(__file__).resolve().parents[1]/'scripts/extract-srd-spell-bodies.py'))['extract_bodies']


class SpellBodyTests(unittest.TestCase):
    def test_capitalized_bullet_is_not_a_new_heading_and_continuation_is_preserved(self):
        index=[{'id':'a','nameEn':'Restoration','level':5,'school':'abjuration','page':150},
               {'id':'b','nameEn':'Guardian','level':4,'school':'conjuration','page':151}]
        pages={150:'Restoration 5th-level abjuration Casting Time: 1 action Body. • One effect reducing the target',
               151:"hit point maximum Guardian 4th-level conjuration Casting Time: 1 action Other body."}
        result=extract(pages,index)
        self.assertEqual(result[0]['pages'],[150,151])
        self.assertTrue(result[0]['body'].endswith('hit point maximum'))
        self.assertNotIn('Guardian',result[0]['body'])

    def test_cantrip_ritual_and_body_mentions(self):
        index=[{'id':'a','nameEn':'Light','level':0,'school':'evocation','page':1},
               {'id':'b','nameEn':'Ward','level':1,'school':'abjuration','page':1}]
        result=extract({1:'Light evocation cantrip Casting Time: 1 action Mentions Ward. Ward 1st-level abjuration (ritual) Casting Time: 1 minute End.'},index)
        self.assertTrue(result[0]['body'].endswith('Mentions Ward.'))
        self.assertTrue(result[1]['body'].endswith('End.'))

    def test_missing_duplicate_or_wrong_page_headings_fail_closed(self):
        index=[{'id':'a','nameEn':'Ward','level':1,'school':'abjuration','page':1}]
        header='Ward 1st-level abjuration Casting Time: 1 action '
        for pages in [{1:'Missing'}, {1:header+header}, {2:header}]:
            with self.assertRaises(ValueError):extract(pages,index)


if __name__ == '__main__':unittest.main()
