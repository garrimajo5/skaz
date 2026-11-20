import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('genasi',Path(__file__).resolve().parents[1]/'scripts/extract-genasi-granularity-evidence.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class GenasiEvidenceTests(unittest.TestCase):
    def motm(self):
        rows='<li><a href="/sources/motm/fantastical-races#Genasi">Genasi</a></li>'
        for element in m.ELEMENTS:
            rows+=f'<li class="toc--indented"><a href="/sources/motm/fantastical-races#{element}GenasiTraits">{element} Genasi</a></li>'
        return ('<h1>Mordenkainen Presents: Monsters of the Multiverse</h1><ul>'+rows+'</ul><p>Private rule body excluded.</p>').encode()
    def legacy(self):
        rows='<h1>Genasi</h1>'
        for element in m.ELEMENTS:
            rows+=f'<h2 id="{element}Genasi" data-content-slug="elemental-evil-players-companion" data-content-type="species-option" aria-describedby="legacy-badge">{element} Genasi <span>Legacy <span>Tooltip excluded</span></span></h2><p>Private rule body excluded.</p>'
        return rows.encode()
    def test_only_headings_and_evidenced_indentation(self):
        r=m.extract_motm(self.motm());self.assertEqual(len(r['records']),5)
        self.assertEqual([x['parentHeading'] for x in r['records']],[None]+['Genasi']*4)
        self.assertNotIn('Private rule',str(r));self.assertEqual(len(r['htmlSha256']),64)
    def test_not_inferred_from_flat_matching_names_or_wrong_parent(self):
        for raw in [self.motm().replace(b'class="toc--indented"',b'class="other"',1),self.motm().replace(b'>Genasi</a>',b'>Different family</a>'),self.motm().replace(b'<li class="toc--indented">',b'</ul><ul><li class="toc--indented">',1)]:
            with self.assertRaises(ValueError):m.extract_motm(raw)
    def test_wrong_race_chapter_fragment_origin_query_and_edition_rejected(self):
        original=b'/sources/motm/fantastical-races#AirGenasiTraits'
        for target in [b'/sources/motm/bestiary-a#AirGenasiTraits',b'/sources/motm/fantastical-races#EarthGenasiTraits',b'/sources/motm/fantastical-races?x=1#AirGenasiTraits',b'https://www.dndbeyond.com.evil.invalid/sources/motm/fantastical-races#AirGenasiTraits',b'/sources/phb-2024/species#AirGenasiTraits']:
            with self.assertRaises(ValueError):m.extract_motm(self.motm().replace(original,target))
    def test_missing_or_ambiguous_heading_fails(self):
        for raw in [self.motm().replace(b'>Water Genasi<',b'>Missing<'),self.motm()+b'<a href="/sources/motm/fantastical-races#WaterGenasiTraits">Water Genasi</a>']:
            with self.assertRaises(ValueError):m.extract_motm(raw)
    def test_combined_evidence_does_not_accept_another_pota_chapter(self):
        pota=b'<h1>Princes of the Apocalypse</h1><a href="/sources/pota/appendix-a-genasi">Appendix A: Genasi</a><p>Private rule body excluded.</p>'
        result=m.extract(self.motm(),pota,self.legacy())
        self.assertEqual(result['pota']['sourceId'],'107')
        self.assertIsNone(result['supportingOtherPublication']['sourceId'])
        self.assertNotIn('Private rule',str(result))
        with self.assertRaises(ValueError):m.extract(self.motm(),pota.replace(b'/appendix-a-genasi',b'/different'),self.legacy())
    def test_wrong_book_is_not_another_version(self):
        with self.assertRaises(ValueError):m.extract_motm(self.motm().replace(b'Monsters of the Multiverse',b'Princes of the Apocalypse'))
    def test_legacy_metadata_has_separate_publication_and_no_rules(self):
        r=m.extract_legacy(self.legacy());self.assertEqual(r['sourceId'],None);self.assertFalse(r['observationSourceAssignment'])
        self.assertEqual(len(r['records']),4);self.assertTrue(all(x['legacy'] for x in r['records']))
        self.assertNotIn('Private rule',str(r));self.assertNotIn('Tooltip',str(r))
    def test_legacy_cannot_be_relabelled_pota_or_latest(self):
        for old,new in [(b'elemental-evil-players-companion',b'princes-of-the-apocalypse'),(b'legacy-badge',b'new-rules'),(b'species-option',b'monster'),(b'id="AirGenasi"',b'id="EarthGenasi"')]:
            with self.assertRaises(ValueError):m.extract_legacy(self.legacy().replace(old,new,1))
    def test_legacy_missing_duplicate_and_wrong_family_fail(self):
        for raw in [self.legacy().replace(b'>Air Genasi ',b'>Missing ',1),self.legacy()+self.legacy(),self.legacy().replace(b'<h1>Genasi</h1>',b'<h1>Other</h1>')]:
            with self.assertRaises(ValueError):m.extract_legacy(raw)

if __name__=='__main__':unittest.main()
