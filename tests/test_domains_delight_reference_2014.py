import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('domains',ROOT/'scripts/audit-domains-delight-reference-2014.py');M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)
TEXT=('D&D ADVENTURERS LEAGUE DUNGEONCRAFT ADVENTURES: WILD BEYOND THE WITCHLIGHT Version 1.1 '
      'You can create your own fixture using The Wild Beyond the Witchlight and Domains of Delight. '
      'Domains of Delight can be found for sale in the DMs Guild. GENERAL GUIDELINES '
      'There is a section in the Domains of Delight supplement. Using Creatures. '
      'You cannot use the archfey presented in Domains of Delight. Adventure Setting. fixture')
URI=['https://www.dmsguild.com/product/371449/Domains-of-Delight-5e?src=fixture']

def report():return json.loads((ROOT/'catalog/domains-delight-reference-boundary-2014.json').read_text(encoding='utf-8'))

class DomainsReferenceTest(unittest.TestCase):
    def test_supplement_product_identity_does_not_imply_whole_parent_book(self):
        d=M.inspect_page(TEXT,URI);self.assertTrue(d['supplementKindExplicit']);self.assertFalse(d['productNumberIsDndsuSourceId'])
        self.assertEqual(d['sameAsWholeWitchlightOrContainedChapter'],'not-established')
    def test_foreign_version_or_programme_is_rejected(self):
        for a,b in [('Version 1.1','Version 2.0'),('DUNGEONCRAFT ADVENTURES','GENERAL PROFILE RULES')]:
            with self.assertRaises(ValueError):M.inspect_page(TEXT.replace(a,b),URI)
    def test_reference_outside_intro_cannot_supply_distribution_relation(self):
        with self.assertRaises(ValueError):M.inspect_page(TEXT.replace(' GENERAL GUIDELINES',' Domains of Delight supplement GENERAL GUIDELINES',1).replace('using The Wild Beyond the Witchlight and Domains of Delight','using another book'),URI)
    def test_wrong_product_or_host_cannot_substitute_for_pdf_link(self):
        for uri in ['https://www.dmsguild.com/product/371449/Another-Book','https://other.test/product/371449/Domains-of-Delight-5e','https://www.dmsguild.com/product/116/Domains-of-Delight-5e']:
            with self.assertRaises(ValueError):M.inspect_page(TEXT,[uri])
    def test_duplicate_same_product_annotations_are_not_distinct_publications(self):
        self.assertEqual(M.inspect_page(TEXT,URI*2),M.inspect_page(TEXT,URI))
    def test_restriction_must_stay_inside_creature_subsection(self):
        misplaced=TEXT.replace('You cannot use the archfey presented in Domains of Delight.','').replace('Adventure Setting.','Adventure Setting. You cannot use the archfey presented in Domains of Delight.')
        with self.assertRaises(ValueError):M.inspect_page(misplaced,URI)
        d=M.inspect_page(TEXT,URI)['campaignArchfeyRestriction'];self.assertFalse(d['blocksOrdinaryProfileActions']);self.assertFalse(d['provesBookUnofficialOrEmpty'])
    def test_wrong_provider_edition_or_publisher_is_rejected(self):
        library=json.loads((ROOT/'catalog/publisher-library-observations-2026-11-21.json').read_text(encoding='utf-8'));r=next(x for x in library['records'] if x['providerSourceId']==116);M.validate_provider(r)
        for key,value in [('providerSourceId',371449),('sku','SRC-00117'),('providerRuleset',{'name':'2024'}),('displayedPublisher','Other')]:
            wrong=copy.deepcopy(r);wrong[key]=value
            with self.assertRaises(ValueError):M.validate_provider(wrong)
    def test_failed_captures_are_not_full_body_or_permanent_denial_evidence(self):
        d=report();self.assertFalse(d['accessAndCaptureLimits']['fullSupplementRead']);self.assertFalse(d['accessAndCaptureLimits']['marketplaceBodyRetained'])
        self.assertEqual(len(d['accessAndCaptureLimits']['limitedAttempts']),3)
        self.assertTrue(all(a['sha256'] is None and not a['retried'] for a in d['accessAndCaptureLimits']['limitedAttempts']))
        self.assertFalse(d['accepted']);self.assertIsNone(d['approvedDenominator']);self.assertIsNone(d['numericDndsuSourceId'])
    def test_report_code_pins_and_json_inputs_reproduce(self):
        d=report()
        for key in ['generator','upstreamParser']:self.assertEqual(d[key]['sha256'],M.sha((ROOT/d[key]['path']).read_bytes().replace(b'\r\n',b'\n')))
        for path,expected in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),expected)

if __name__=='__main__':unittest.main()
