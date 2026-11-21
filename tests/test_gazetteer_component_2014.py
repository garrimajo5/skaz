import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('gazetteer',ROOT/'scripts/audit-gazetteer-component-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)

def parent():return '<h1>'+M.BOOK+'</h1><div class="compendium-toc-full-text"><h3><a href="'+M.CHAPTER+'">'+M.CHILD+'</a></h3><a href="'+M.CHAPTER+'#BaldursGateCharacterBackgrounds">Baldur’s Gate Character Backgrounds</a></div>'
def claim():return '<h1>Claim '+M.CHILD+' now!</h1><h1>'+M.CHILD+'</h1><div class="claim-main"><p>City districts and people; unlock backgrounds.</p><p>This claim unlocks the '+M.CHILD+' for the compendium and character builder.</p><span class="claim-main__purchase-inactive">This promotion is no longer available.</span></div>'
AL="Previous sword instructions. BALDUR’S GATE GAZETTEER Background features presented in this section are available to Season 9 characters. Not for resale. Footer"
def report():return json.loads((ROOT/'catalog/gazetteer-component-boundary-2014.json').read_text(encoding='utf-8'))

class GazetteerComponentTest(unittest.TestCase):
    def test_gazetteer_own_heading_and_background_fragment_are_retained(self):
        d=M.inspect_parent(parent());self.assertEqual(d['gazetteerChapterUrl'],M.CHAPTER);self.assertTrue(d['backgroundSectionReference'].endswith('#BaldursGateCharacterBackgrounds'))
    def test_parent_book_or_wrong_fragment_cannot_replace_gazetteer_target(self):
        for target in [M.CHAPTER+'#Monster','https://www.dndbeyond.com/sources/dnd/bgdia']:
            with self.assertRaises(ValueError):M.inspect_parent(parent().replace('href="'+M.CHAPTER+'"','href="'+target+'"'))
    def test_background_link_from_other_chapter_is_rejected(self):
        with self.assertRaises(ValueError):M.inspect_parent(parent().replace('#BaldursGateCharacterBackgrounds','#AnotherBackground'))
    def test_duplicate_heading_or_unscoped_title_cannot_identify_component(self):
        for html in [parent()+parent(),parent().replace('compendium-toc-full-text','recommendations')]:
            with self.assertRaises(ValueError):M.inspect_parent(html)
    def test_parent_advertisement_counts_are_outside_claim_scope(self):
        a=M.inspect_claim(claim());b=M.inspect_claim(claim()+'<aside><p>37 monsters and12 magic items. unlock backgrounds.</p></aside>')
        self.assertEqual(a,b);self.assertFalse(a['advertisedParentMonsterOrItemCountsAttributedToChild']);self.assertFalse(a['fullGazetteerTextInspected'])
    def test_offer_expiry_or_description_outside_claim_scope_is_rejected(self):
        for html in [claim().replace('claim-main','recommendations'),claim().replace('unlock backgrounds','whole adventure'),claim().replace('no longer available','available now')]:
            with self.assertRaises(ValueError):M.inspect_claim(html)
    def test_historical_season_context_is_not_global_action_limit_or_grant(self):
        d=M.inspect_al(AL);self.assertEqual(d['historicalSeason'],9)
        for key in ['ordinaryProfileBackgroundSelectionBlocked','allCharactersAutomaticallyGrantedFeatures','currentGlobalAlEligibilityEstablished']:self.assertFalse(d[key])
        for text in [AL.replace('Season 9','all'),AL.replace('BALDUR’S GATE GAZETTEER','OTHER CHAPTER')]:
            with self.assertRaises(ValueError):M.inspect_al(text)
    def test_season_statement_after_footer_cannot_be_inherited(self):
        text=AL.replace('Background features presented in this section are available to Season 9 characters.','')+' Background features presented in this section are available to Season 9 characters.'
        with self.assertRaises(ValueError):M.inspect_al(text)
    def test_three_source_namespaces_and_full_rules_limits_are_preserved(self):
        d=report();r=d['relationship'];self.assertEqual((r['childProviderSourceId'],r['parentProviderSourceId'],r['existingParentDndsuSourceId']),(122,48,'126'))
        self.assertIsNone(r['childDndsuSourceId']);self.assertFalse(r['automaticRecordAttribution']);self.assertFalse(r['wholeParentBookOrAllParentMonstersIncluded']);self.assertFalse(d['accepted']);self.assertIsNone(d['approvedDenominator'])
    def test_report_and_code_sha_pins_match_local_inputs(self):
        d=report()
        for p,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/p).read_bytes().replace(b'\r\n',b'\n')),digest)
        for r in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/r['path']).read_bytes().replace(b'\r\n',b'\n')),r['sha256'])

if __name__=='__main__':unittest.main()
