import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('multi',Path(__file__).resolve().parents[1]/'scripts/extract-multibook-monster-evidence.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class MultibookEvidenceTests(unittest.TestCase):
    def book(self,label='Derro',fragment='Derro',path='appendix-c-creatures'):
        return f'<h1>Out of the Abyss</h1><a href="https://www.dndbeyond.com/compendium/adventures/oota/{path}#{fragment}">{label}</a><p>Full stat block excluded.</p>'.encode()
    def row(self,name,source,link,kind='Fiend (demon)',size='Huge',cr='26'):
        return f'<div class="info" data-type="monsters"><div class="monster-name"><a href="/monsters/{link}">{name}</a><span class="source">{source}</span></div><div class="monster-type">{kind}</div><div class="monster-size">{size}</div><div class="monster-challenge">{cr}</div></div>'
    def listing(self):
        return ('<h1>Monsters</h1><ul class="rpgmonster-listing">'+self.row('Demogorgon','Out of the Abyss','1-demogorgon')+self.row('Demogorgon','Mordenkainen Presents: Monsters of the Multiverse','2-demogorgon')+self.row('Demogorgon (Monstrosity)','Hunt for the Thessalhydra','3-demogorgon-monstrosity','Monstrosity','Medium','4')+self.row('"The Demogorgon"','Infernal Machine Rebuild','4-other','Giant','Large','8')+'</ul><p>Full stat block excluded.</p>').encode()
    def test_exact_book_chapter_heading_metadata_only(self):
        r=m.extract_book(self.book(),'oota',['derro']);self.assertEqual(len(r['records']),1);self.assertEqual(r['missing'],[]);self.assertNotIn('Full stat',str(r))
    def test_absent_heading_is_unknown_not_absent_rules(self):
        r=m.extract_book(self.book(),'oota',['derro','derro savant']);self.assertEqual(r['missing'],[{'name':'derro savant','reason':'missing-index-heading'}])
    def test_wrong_fragment_is_anomaly_never_an_automatic_repair(self):
        r=m.extract_book(self.book('Female Steeder','MaleSteeder'),'oota',['female steeder']);self.assertEqual(r['records'],[]);self.assertEqual(r['missing'][0]['reason'],'label-fragment-mismatch');self.assertEqual(r['linkAnomalies'][0]['observedFragment'],'MaleSteeder');self.assertIn('#MaleSteeder',r['linkAnomalies'][0]['targetUrl'])
    def test_wrong_book_foreign_origin_race_chapter_query_rejected(self):
        for raw in [self.book().replace(b'<h1>Out of the Abyss',b'<h1>Other'),self.book().replace(b'www.dndbeyond.com',b'www.dndbeyond.com.evil.invalid'),self.book(path='races'),self.book().replace(b'#Derro',b'?x=1#Derro')]:
            with self.assertRaises(ValueError):m.extract_book(raw,'oota',['derro'])
    def test_duplicate_exact_headings_remain_ambiguous(self):
        r=m.extract_book(self.book()+self.book(),'oota',['derro']);self.assertEqual(r['records'],[]);self.assertEqual(r['missing'][0]['reason'],'ambiguous-index-heading')
    def test_literal_curly_witness_is_separate_from_exact_name(self):
        raw='<h1>Mordenkainen Presents: Monsters of the Multiverse</h1><a href="/sources/motm/bestiary-ek#Grazzt">Graz\u2019zt</a>'.encode()
        r=m.extract_book(raw,'motm',["graz'zt"]);self.assertEqual(r['records'],[]);self.assertEqual(len(r['alternateSpellings']),1);self.assertFalse(r['alternateSpellings'][0]['acceptedAlias'])
    def test_listing_keeps_distinct_typed_identity_and_ignores_quoted_giant(self):
        r=m.extract_demogorgon(self.listing());self.assertEqual(len(r['records']),3);self.assertEqual({r['sourceId'] for r in r['records']},{'123','129','158'});self.assertNotIn('Giant',str(r['records']));self.assertNotIn('Full stat',str(r))
    def test_missing_duplicate_listing_identity_and_wrong_page_fail(self):
        for raw in [self.listing().replace(b'Demogorgon (Monstrosity)',b'Missing'),self.listing().replace(b'</ul>',self.row('Demogorgon','Out of the Abyss','9-duplicate').encode()+b'</ul>'),self.listing().replace(b'<h1>Monsters</h1>',b'<h1>Other</h1>')]:
            with self.assertRaises(ValueError):m.extract_demogorgon(raw)
    def test_lookalike_source_or_suffix_is_not_automatically_mapped(self):
        with self.assertRaises(ValueError):m.extract_demogorgon(self.listing().replace(b'Hunt for the Thessalhydra',b'Hunt for the Thessalhydra 2024'))
        with self.assertRaises(ValueError):m.extract_demogorgon(self.listing().replace(b'Demogorgon (Monstrosity)',b'Demogorgon (Fiend)'))

if __name__=='__main__':unittest.main()
