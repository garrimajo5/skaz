import importlib.util
from copy import deepcopy
from pathlib import Path
import json
import hashlib
import unittest
SPEC=importlib.util.spec_from_file_location('links',Path(__file__).resolve().parents[1]/'scripts/review-library-source-links-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def source(ident='101',title="Player's Handbook"):
    return {'sourceId':ident,'title':title,'scope':'candidate-2014','group':'Core'}
def book(ident=2,title='Player’s Handbook (2014)',path='/sources/dnd/phb-2014',edition='5e',sku='SRC-00002',publisher='Wizards of the Coast'):
    return {'providerSourceId':ident,'observationId':'ddb:library-source:'+str(ident),'title':title,'sourceUrl':'https://www.dndbeyond.com'+path,'providerRuleset':{'name':edition},'sku':sku,'displayedPublisher':publisher,'providerIsThirdParty':False,'providerType':'sourcebook','metadataBucket':'test'}
def fixtures(books=None,sources=None,evidence=None):
    sources=[source()] if sources is None else sources
    return [{'records':[book()] if books is None else books},{'sources':sources},{'records':[{'sourceId':'101','ruleset':'5e-2014','publisher':'Wizards of the Coast','publicationKind':'official-wotc-2014-publication','editionEvidenceUrl':'https://www.dndbeyond.com/sources/dnd/phb-2014'}] if evidence is None else evidence},{'records':[{'sourceId':s['sourceId'],'disposition':'eligible-publication-records-need-review'} for s in sources]}]

class LibrarySourceLinksTest(unittest.TestCase):
    def test_direct2014_evidence_does_not_choose_same_name2024(self):
        values=fixtures(books=[book(),book(145,"Player’s Handbook",'/sources/dnd/phb-2024','5.5e','DB3709000')]);before=deepcopy(values)
        row=M.review(*values)['records'][0];chosen=[c['providerSourceId'] for c in row['candidates'] if c['preferredByEvidence']]
        self.assertEqual(chosen,[2]);self.assertEqual(len(row['candidates']),2);self.assertEqual(values,before)
        self.assertFalse(row['accepted']);self.assertIsNone(row['canonicalSourceId'])

    def test_empty_sku_never_matches_every_evidence_url(self):
        values=fixtures(books=[book(sku='')],sources=[source(title='Unrelated')],evidence=[{'sourceId':'101','evidenceUrl':'https://marketplace.dndbeyond.com/category/SRC-00002'}])
        self.assertEqual(M.review(*values)['records'][0]['candidates'],[])

    def test_chapter_and_exact_sku_keep_their_provenance(self):
        evidence=[{'sourceId':'101','editionEvidenceUrl':'https://www.dndbeyond.com/sources/dnd/phb-2014/chapter','evidenceUrl':'https://marketplace.dndbeyond.com/category/SRC-00002'}]
        row=M.review(*fixtures(evidence=evidence))['records'][0]
        kinds={r['kind'] for r in row['candidates'][0]['reasons']}
        self.assertIn('chapter-under-compendium-url',kinds);self.assertIn('same-explicit-marketplace-sku',kinds)

    def test_same_numeric_id_never_matches_across_namespaces(self):
        values=fixtures(books=[book(101,'Unrelated','/sources/dnd/other')],evidence=[])
        row=M.review(*values)['records'][0];self.assertEqual(row['candidates'],[]);self.assertEqual(row['dndsuSourceId'],'101')

    def test_cobrand_label_does_not_overwrite_existing_publisher_evidence(self):
        row=M.review(*fixtures(books=[book(publisher='Critical Role')]))['records'][0]
        self.assertEqual(row['publicationEvidence']['publisher'],'Wizards of the Coast')
        self.assertEqual(row['candidates'][0]['displayedPublisher'],'Critical Role')

    def test_explicit_source_conflict_and_unmatched_sources_survive(self):
        values=fixtures(books=[book(145,"Player's Handbook",'/sources/dnd/phb-2024','5.5e')]);values[2]['records'][0]['editionEvidenceUrl']='https://www.dndbeyond.com/sources/dnd/phb-2024'
        self.assertEqual(M.review(*values)['records'][0]['relationshipStatus'],'evidence-ruleset-conflict')
        values=fixtures(books=[],sources=[source(),source('169','Adventurers League')],evidence=[])
        report=M.review(*values);self.assertEqual(report['summary']['preservedHistoricalSources'],2)
        self.assertTrue(all(r['relationshipStatus']=='no-library-candidate' for r in report['records']))

    def test_volume_alias_keeps_observed_words_and_no_automatic_replacement(self):
        values=fixtures(books=[book(124,'Monstrous Compendium Vol. 4: Eldraine Creatures','/sources/dnd/mcv4')],sources=[source(title='Monstrous Compendium Vol. Four: Eldraine Creatures')],evidence=[])
        row=M.review(*values)['records'][0]
        self.assertEqual(row['candidates'][0]['reasons'][0]['kind'],'volume-label-alias-candidate')
        self.assertIn('Four',row['historicalTitle']);self.assertFalse(row['automaticSourceReplacement'])

    def test_lost_or_duplicate_source_policy_fails(self):
        values=fixtures();values[3]['records']=[]
        with self.assertRaisesRegex(ValueError,'Policy'):M.review(*values)
        values=fixtures();values[1]['sources']*=2
        with self.assertRaisesRegex(ValueError,'Duplicate'):M.review(*values)

    def test_manifest_generator_pin_matches_without_misusing_json_pins(self):
        root=Path(__file__).resolve().parents[1]
        d=json.loads((root/'catalog/library-source-link-proposals-2014.json').read_text(encoding='utf-8'))
        self.assertEqual(hashlib.sha256((root/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')).hexdigest(),d['generator']['sha256'])

if __name__=='__main__':unittest.main()
