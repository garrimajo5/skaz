import importlib.util
import hashlib
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('sage_boundary',ROOT/'scripts/audit-sage-advice-boundary-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)
SAMPLE='Sage Advice Compendium Rules References Official Rulings Compiled Answers first published in 2014 Version 2.7 ©2021 Wizards personal use only'

class SageAdviceBoundaryTest(unittest.TestCase):
    def test_version_and_year_are_read_from_document_not_url(self):
        facts=M.inspect_first_page(SAMPLE)
        self.assertEqual(facts['pdfVersion'],'2.7');self.assertEqual(facts['copyrightYear'],2021)
        self.assertNotEqual(facts['copyrightYear'],int(M.URL.split('/')[3]))

    def test_all_reference_boundaries_are_required(self):
        for heading in ['Rules References','Official Rulings','Compiled Answers']:
            with self.assertRaisesRegex(ValueError,'boundary'):M.inspect_first_page(SAMPLE.replace(heading,''))

    def test_conflicting_version_or_year_fails(self):
        for extra in [' Version 2.6',' ©2020 Wizards']:
            with self.assertRaisesRegex(ValueError,'Ambiguous'):M.inspect_first_page(SAMPLE+extra)

    def test_era_and_reuse_notice_are_not_assumed_from_host(self):
        for phrase in ['first published in 2014','personal use only']:
            with self.assertRaises(ValueError):M.inspect_first_page(SAMPLE.replace(phrase,''))

    def test_witness_does_not_accept_full_rules_or_invent_numeric_namespace(self):
        d=json.loads((ROOT/'catalog/sage-advice-publication-boundary-2014.json').read_text(encoding='utf-8'))
        self.assertFalse(d['accepted']);self.assertFalse(d['complete']);self.assertIsNone(d['numericDndsuSourceId'])
        self.assertFalse(d['semanticReview']['fullAnswersReviewed']);self.assertFalse(d['automaticAttribution'])
        self.assertEqual(d['semanticReview']['exactDigitalPdfEquivalence'],'unverified')

    def test_generator_provenance_is_current(self):
        d=json.loads((ROOT/'catalog/sage-advice-publication-boundary-2014.json').read_text(encoding='utf-8'))
        self.assertEqual(hashlib.sha256((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')).hexdigest(),d['generator']['sha256'])

if __name__=='__main__':unittest.main()
