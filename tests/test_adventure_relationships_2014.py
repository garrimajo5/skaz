import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('aux',ROOT/'scripts/audit-adventure-relationships-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)

def body(pid,paras):return '<h1>'+M.ARTICLES[pid]+'</h1><section class="p-article-content">'+''.join('<p>'+p+'</p>' for p in paras)+'</section>'
def lightning():return body(126,['We introduce Lightning Keep, inspired by Minecraft for 3rd-level characters.',"D&D's previous Minecraft supplement, Monstrous Compendium Volume 3: Minecraft Creatures."])
def claim():return '<h1>Claim Lightning Keep now!</h1><h1>Get Lightning Keep at no cost!</h1><div class="claim-main"><p>four to six characters of level 3; three or four hours in a world of your choosing; <a href="https://www.dndbeyond.com/sources/mcv3">Monstrous Compendium Volume 3: Minecraft Creatures</a>.</p><span class="claim-main__purchase-inactive">This promotion is no longer available.</span></div>'
def feast():return body(129,["<a href='https://www.dndbeyond.com/marketplace/adventures/heroes-feast-saving-the-childrens-menu?icid_source=fixture'>Heroes’ Feast: Saving the Children’s Menu</a> is based on a recipe included in Heroes’ Feast Flavors of the Multiverse, a cookbook.",'A D&D adventure for 10th-level adventurers.',"Wizards first wrote me about publishing Saving the Children's Menu."])
def vecna():return body(135,['<a href="https://marketplace.dndbeyond.com/category/SRC-00135?icid_source=fixture">Vecna: Nest of the Eldritch Eye</a>, a one-shot adventure for 3rd-level characters. It serves as a prequel to Vecna: Eve of Ruin.','A prequel to Vecna: Eve of Ruin: 10th to 20th level; the transition is up to you as the Dungeon Master.'])
def report(pid):return json.loads((ROOT/'catalog'/M.OUTPUTS[pid]).read_text(encoding='utf-8'))

class AdventureRelationshipsTest(unittest.TestCase):
    def test_lightning_related_creatures_do_not_mean_whole_supplement_or_fixed_world(self):
        d=M.inspect_lightning(lightning(),claim());self.assertEqual((d['relatedProviderSourceId'],d['relatedExistingDndsuSourceId']),(115,'199'))
        self.assertFalse(d['worldChoiceForcedToMinecraft']);self.assertFalse(d['isAliasOfRelatedBook']);self.assertEqual(d['allSupplementCreaturesOrExactStatblocksIncluded'],'not-established')
    def test_lightning_related_book_name_and_target_are_both_required(self):
        for html in [claim().replace('/sources/mcv3','/sources/lke'),claim().replace('a world of your choosing','only Minecraft')]:
            with self.assertRaises(ValueError):M.inspect_lightning(lightning(),html)
    def test_lightning_reuse_in_comments_cannot_supply_article_evidence(self):
        with self.assertRaises(ValueError):M.inspect_lightning(lightning().replace('p-article-content','comments'),claim())
    def test_ended_promotion_does_not_prove_prior_owner_access(self):
        d=M.inspect_lightning(lightning(),claim());self.assertTrue(d['promotionEndedNotice']);self.assertFalse(d['previousClaimantAccessTested']);self.assertFalse(d['claimSubmitted'])
        with self.assertRaises(ValueError):M.inspect_lightning(lightning(),claim().replace('no longer available','available now'))
    def test_feast_recipe_inspiration_does_not_add_cookbook_to_rules_catalog(self):
        d=M.inspect_feast(feast());self.assertEqual(d['advertisedLevel'],10);self.assertFalse(d['cookbookImportedAsRulesSource']);self.assertFalse(d['authorIsPublisher'])
        self.assertEqual(d['containedInCookbookOrIdenticalRules'],'not-established')
    def test_feast_wrong_product_or_missing_publishing_context_is_rejected(self):
        for html in [feast().replace('/marketplace/adventures/heroes-feast-saving-the-childrens-menu','/marketplace/adventures/other'),feast().replace('Wizards first wrote me','Other group wrote me')]:
            with self.assertRaises(ValueError):M.inspect_feast(html)
    def test_feast_duplicate_recipe_paragraph_is_ambiguous(self):
        with self.assertRaises(ValueError):M.inspect_feast(feast().replace('</section>',"<p>Heroes’ Feast: Saving the Children’s Menu is based on a recipe included in Heroes’ Feast Flavors of the Multiverse cookbook.</p></section>"))
    def test_vecna_prequel_and_dm_level_transition_are_separate_from_automatic_level(self):
        d=M.inspect_vecna(vecna());self.assertEqual(d['advertisedPrequelLevel'],3);self.assertEqual(d['relatedCampaignLevelRange'],[10,20]);self.assertTrue(d['transitionDeterminedByDm']);self.assertFalse(d['automaticLevel3To10Granted'])
    def test_vecna_wrong_prequel_product_or_removed_dm_discretion_is_rejected(self):
        for html in [vecna().replace('/category/SRC-00135','/category/SRC-00134'),vecna().replace('up to you as the Dungeon Master','automatic')]:
            with self.assertRaises(ValueError):M.inspect_vecna(html)
    def test_vecna_intro_statement_cannot_come_from_outside_article_scope(self):
        with self.assertRaises(ValueError):M.inspect_vecna(vecna().replace('p-article-content','recommended'))
    def test_year_2024_is_not_revised_rules_or_related_provider_sku_identity(self):
        d=report(135);self.assertTrue(d['providerReference']['providerReleaseDate'].startswith('2024-'));self.assertEqual(d['providerReference']['providerRuleset']['name'],'5e')
        self.assertFalse(d['relationship']['calendarYear2024AutomaticallyMeansRevisedRules']);self.assertEqual((d['relationship']['relatedProviderSourceId'],d['relationship']['relatedSku']),(132,'SRC-00134'))
    def test_related_provider_sku_cannot_be_guessed_from_numeric_id(self):
        lib=json.loads((ROOT/M.INPUTS[0]).read_text(encoding='utf-8'));r=next(r for r in lib['records'] if r['providerSourceId']==132);M.validate_related_provider(r,132)
        for k,v in [('sku','SRC-00132'),('providerSourceId',134),('providerRuleset',{'name':'2024'})]:
            wrong=copy.deepcopy(r);wrong[k]=v
            with self.assertRaises(ValueError):M.validate_related_provider(wrong,132)
    def test_raw_feast_title_whitespace_preserved_but_not_used_as_separate_identity(self):
        d=report(129);self.assertTrue(d['providerReference']['title'].endswith(' '));self.assertEqual(M.clean(d['providerReference']['title']),M.TITLES[129])
    def test_failed_source_bodies_are_not_claimed_as_full_access(self):
        for pid in [129,135]:
            d=report(pid);self.assertEqual(len(d['limitedSourceAttempts']),1);c=d['limitedSourceAttempts'][0]
            self.assertIsNone(c['sha256']);self.assertIsNone(c['bodyFile']);self.assertFalse(c['retried']);self.assertFalse(d['fullRulesReviewed'])
    def test_all_reports_have_matching_code_json_pins_and_no_accepted_units(self):
        for pid in [126,129,135]:
            d=report(pid);self.assertFalse(d['accepted']);self.assertFalse(d['automaticAttribution']);self.assertIsNone(d['canonicalSourceId']);self.assertIsNone(d['numericDndsuSourceId']);self.assertIsNone(d['approvedDenominator'])
            for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
            for r in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/r['path']).read_bytes().replace(b'\r\n',b'\n')),r['sha256'])

if __name__=='__main__':unittest.main()
