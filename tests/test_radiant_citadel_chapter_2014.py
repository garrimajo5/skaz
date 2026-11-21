import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('radiant',ROOT/'scripts/audit-radiant-citadel-chapter-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def article():return '<h1>'+M.ARTICLE+'</h1><section class="p-article-content"><p>The first chapter of this book describes a hub of extraplanar adventure.</p><p>The first chapter of Journeys Through the Radiant Citadel. The chapter is listed as &quot;The Radiant Citadel.&quot;</p></section>'
def parent():return '<h1>'+M.BOOK+'</h1><h2 id="Contents">Contents</h2><div class="compendium-toc-full-text"><h3><a href="/sources/jttrc/the-radiant-citadel">The Radiant Citadel</a></h3></div><h2 id="Statblocks">Statblocks</h2><div class="compendium-toc-full-text"><h3><a href="/sources/jttrc/other#Monster">Other monster</a></h3></div>'
def claim():return '<h1>Claim The Radiant Citadel now!</h1><h1>The Radiant Citadel</h1><div class="claim-main"><p>You can try unlocking the first chapter of Journeys Through the Radiant Citadel at no cost.</p><span class="claim-main__purchase-inactive">This promotion is no longer available.</span></div>'

class RadiantChapterBoundaryTest(unittest.TestCase):
    def test_first_chapter_kind_and_distribution_label_are_separate_evidence(self):
        d=M.inspect_article(article());self.assertTrue(d['firstChapterSettingHubExplicit']);self.assertEqual(d['separateChapterListingLabel'],M.CHILD)
        for text in [article().replace('first chapter of this book','whole book'),article().replace('p-article-content','comments')]:
            with self.assertRaises(ValueError):M.inspect_article(text)

    def test_contents_and_statblocks_are_separate_named_tocs(self):
        d=M.inspect_parent(parent());self.assertEqual(d['observedTocSectionIds'],['Contents','Statblocks'])
        self.assertEqual(d['selectedTocSectionId'],'Contents')

    def test_same_name_in_statblocks_does_not_prove_chapter(self):
        with self.assertRaises(ValueError):M.inspect_parent(parent().replace('id="Contents"','id="Other"').replace('Other monster','The Radiant Citadel'))

    def test_section_transition_cannot_leak_into_selected_contents(self):
        with self.assertRaises(ValueError):M.inspect_parent(parent().replace('<h3><a href="/sources/jttrc/the-radiant-citadel">','<h2 id="Statblocks">Statblocks</h2><h3><a href="/sources/jttrc/the-radiant-citadel">'))

    def test_book_or_statblock_url_cannot_substitute_for_chapter_url(self):
        for target in ['/sources/jttrc/the-radiant-citadel#Creature','/sources/dnd/jttrc']:
            with self.assertRaises(ValueError):M.inspect_parent(parent().replace('/sources/jttrc/the-radiant-citadel',target))

    def test_duplicate_contents_container_is_ambiguous(self):
        with self.assertRaises(ValueError):M.inspect_parent(parent()+parent())

    def test_ended_notice_is_required_inside_claim_scope(self):
        self.assertTrue(M.inspect_claim(claim())['currentPromotionEndedNotice'])
        for text in [claim().replace('claim-main__purchase-inactive','other'),claim().replace('This promotion is no longer available.','Available now.')]:
            with self.assertRaises(ValueError):M.inspect_claim(text)

    def test_expiry_outside_claim_or_whole_book_offer_cannot_be_assumed(self):
        for text in [claim().replace('claim-main','footer'),claim().replace('first chapter of Journeys Through','whole anthology of Journeys Through')]:
            with self.assertRaises(ValueError):M.inspect_claim(text)

    def test_expired_promotion_does_not_claim_prior_owner_access_or_full_rules(self):
        d=M.inspect_claim(claim())
        for key in ['claimSubmitted','authenticatedAccessUsed','fullChapterRulesInspected','priorClaimantOrBookOwnerAccessTested','categoryRecordCountsEstablished']:self.assertFalse(d[key])

    def test_provider_type_observation_does_not_set_whole_anthology_or_zero_rule_count(self):
        d=json.loads((ROOT/'catalog/radiant-citadel-chapter-boundary-2014.json').read_text(encoding='utf-8'));r=d['relationship']
        self.assertEqual(r['childProviderSourceId'],92);self.assertEqual(r['parentProviderSourceId'],87);self.assertEqual(r['existingParentDndsuSourceId'],'171')
        self.assertFalse(r['wholeAnthologyUnlockedOrReviewed']);self.assertFalse(r['zeroOrNonzeroRulesRecordCountInferredFromMetadata']);self.assertIsNone(r['childDndsuSourceId'])
        self.assertFalse(d['accepted']);self.assertIsNone(d['approvedDenominator'])

    def test_generator_and_parser_have_code_pins_separate_from_json_inputs(self):
        d=json.loads((ROOT/'catalog/radiant-citadel-chapter-boundary-2014.json').read_text(encoding='utf-8'))
        for key in ['generator','upstreamParser']:self.assertEqual(d[key]['sha256'],M.sha((ROOT/d[key]['path']).read_bytes().replace(b'\r\n',b'\n')))
        self.assertTrue(all(p.endswith('.json') for p in d['inputSha256']))

if __name__=='__main__':unittest.main()
