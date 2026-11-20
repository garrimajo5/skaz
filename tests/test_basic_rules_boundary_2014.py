import importlib.util
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('basic_boundary',ROOT/'scripts/audit-basic-rules-boundary-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def fixture():
    blocks=[]
    for n in range(1,16):
        title='Classes' if n==3 else ('Races' if n==2 else 'Chapter'+str(n))
        blocks.append(f'<h4><a href="{M.BASE}{title.lower()}">Ch. {n}: {title}</a></h4>')
        if n in [2,3]:
            names=['Choosing a Race','Racial Traits','Dwarf','Elf'] if n==2 else ['Classes Summary','Barbarian','Bard']
            for name in names:blocks.append(f'<a href="{M.BASE}{title.lower()}#{name.replace(" ","")}">{name}</a>')
    return '<h1>Basic Rules (2014)</h1><a href="https://other.test/#Wizard">Wizard</a><div class="compendium-toc-full-text">'+''.join(blocks)+'</div>'

def pdf_fixture():
    toc='Not for resale personal use only '
    for n in range(1,15):
        title={2:'Races',3:'Classes'}.get(n,'Chapter'+str(n))
        toc+=f'Ch. {n}: {title} .... {n} '
        if n==2:toc+='Choosing a Race ... 13 Racial Traits ... 13 Dwarf ... 14 Elf ... 15 Halfling ... 18 Human ... 19 '
        if n==3:toc+='Cleric ... 22 Fighter ... 26 Rogue ... 28 Wizard ... 31 '
    toc+='Appendix A: Conditions ... 171'
    return 'D&D Basic Rules, Version 1.0, Released November 2018 ©2018 Wizards',toc

class BasicRulesBoundaryTest(unittest.TestCase):
    def test_class_names_only_inside_exact_container_and_class_section(self):
        facts=M.inspect_digital(fixture())
        self.assertEqual(facts['classTocNames'],['Barbarian','Bard'])
        self.assertEqual(facts['raceTocNames'],['Dwarf','Elf'])
        self.assertNotIn('Wizard',facts['classTocNames'])

    def test_conflicting_or_duplicate_toc_is_rejected(self):
        with self.assertRaisesRegex(ValueError,'container'):M.inspect_digital(fixture()+fixture())

    def test_missing_middle_chapter_is_not_a_complete_inventory(self):
        with self.assertRaisesRegex(ValueError,'chapter'):M.inspect_digital(fixture().replace('Ch. 8:','Ch. 9:'))

    def test_2024_page_is_not_accepted_from_familiar_route(self):
        with self.assertRaisesRegex(ValueError,'title'):M.inspect_digital(fixture().replace('Basic Rules (2014)','Free Rules (2024)'))

    def test_foreign_child_or_chapter_target_is_rejected(self):
        for text in [fixture().replace(M.BASE+'classes#Bard','https://other.test/#Bard'),fixture().replace(M.BASE+'chapter15','https://other.test/chapter15')]:
            with self.assertRaisesRegex(ValueError,'Foreign'):M.inspect_digital(text)

    def test_duplicate_class_identity_is_not_counted_twice(self):
        with self.assertRaisesRegex(ValueError,'Duplicate'):M.inspect_digital(fixture().replace('#Bard">Bard','#Barbarian">Barbarian'))

    def test_pdf_versions_and_four_class_inventory_read_from_pages(self):
        cover,toc=pdf_fixture();d=M.inspect_basic_pdf(cover,toc,180)
        self.assertEqual(d['releaseYear'],2018);self.assertEqual(d['version'],'1.0')
        self.assertEqual([r['name'] for r in d['classTocEntries']],['Cleric','Fighter','Rogue','Wizard'])
        self.assertEqual(d['raceCount'],4)

    def test_missing_personal_use_or_cover_is_not_assumed(self):
        cover,toc=pdf_fixture()
        for a,b in [(cover,toc.replace('personal use only','')),(cover.replace('Version 1.0',''),toc)]:
            with self.assertRaises(ValueError):M.inspect_basic_pdf(a,b,180)

    def test_truncated_pdf_or_repeated_toc_boundary_fails(self):
        cover,toc=pdf_fixture()
        for text,pages in [(toc,179),(toc+' Ch. 3: Classes',180)]:
            with self.assertRaises(ValueError):M.inspect_basic_pdf(cover,text,pages)

    def test_capture_needs_exact_body_url_and_status(self):
        raw=b'public-fixture';sha=M.digest(raw);url='https://publisher.test/file'
        good={'requestedUrl':url,'finalUrl':url,'status':200,'bytes':len(raw),'sha256':sha,'capturedAt':'fixture'}
        self.assertEqual(M.verify_capture(raw,good,url,sha)['sha256'],sha)
        for key,value in [('status',403),('bytes',1),('finalUrl',url+'/login'),('sha256','0'*64)]:
            with self.assertRaises(ValueError):M.verify_capture(raw,{**good,key:value},url,sha)
        with self.assertRaises(ValueError):M.verify_capture(raw+b'x',good,url,sha)

    def test_heading_window_preserves_earlier_extraction_page(self):
        def page(text):return SimpleNamespace(extract_text=lambda:text)
        reader=SimpleNamespace(pages=[page('Previous class ending'),page('Rogue Class Features'),page('Wizard Class Features')])
        d=M.locate_srd_heading(reader,'Rogue',1)
        self.assertEqual(d['existingTableExtractionPage'],1);self.assertEqual(d['headingPage'],2)
        self.assertEqual(d['inspectedPdfPages'],[1,2])
        with self.assertRaises(ValueError):M.locate_srd_heading(reader,'Wizard',1)

    def test_witness_cannot_become_full_text_or_cross_document_license(self):
        d=json.loads((ROOT/'catalog/basic-rules-publication-boundary-2014.json').read_text(encoding='utf-8'))
        self.assertFalse(d['accepted']);self.assertFalse(d['complete']);self.assertIsNone(d['approvedDenominator'])
        self.assertIsNone(d['numericDndsuSourceId']);self.assertFalse(d['automaticAttribution'])
        self.assertFalse(d['relations']['srdLicenseExtendsToOtherDocuments'])
        self.assertEqual(d['relations']['digitalSrdFullTextEquivalence'],'unverified')
        self.assertEqual(d['basicPdf']['classCount'],4);self.assertEqual(d['digitalToc']['classCount'],12)

    def test_generator_is_pinned_separately_from_json_inputs(self):
        d=json.loads((ROOT/'catalog/basic-rules-publication-boundary-2014.json').read_text(encoding='utf-8'))
        self.assertTrue(all(path.endswith('.json') for path in d['inputSha256']))
        self.assertEqual(d['generator']['sha256'],M.digest((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))

if __name__=='__main__':unittest.main()
