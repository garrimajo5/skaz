import importlib.util
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location('remaining_evidence',Path(__file__).resolve().parents[1]/'scripts/extract-remaining-bestiary-evidence.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class RemainingEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.spec={'sourceId':'157','policyTitle':'Essentials Kit: Dragon of Icespire peak','kind':'publisher-toc','sourceUrl':'https://www.dndbeyond.com/sources/dnd/doip','expectedPublishedTitle':'Dragon of Icespire Peak','bookCode':'doip','contextLabels':['Sidekicks'],'unapprovedAlternates':{}}
    def source(self,inside='',outside=''):
        return ('<h1>Dragon of Icespire Peak</h1>'+outside+'<div class="compendium-toc-full"><div class="compendium-toc-full-text">'+inside+'</div></div>').encode()
    def test_exact_scoped_heading_keeps_literal_target(self):
        x=mod.extract_source(self.source('<a href="/sources/doip/sidekicks#Warrior">Warrior</a>'),self.spec,['warrior'])
        self.assertEqual(len(x['records']),1)
        self.assertTrue(x['records'][0]['publicationPresenceOnly'])
    def test_navigation_and_rule_body_mentions_are_not_index_records(self):
        outside='<nav><a href="/sources/doip/sidekicks#Warrior">Warrior</a></nav><div class="article-main"><p><a href="/sources/doip/sidekicks#Warrior">Warrior</a></p></div>'
        x=mod.extract_source(self.source(outside=outside),self.spec,['warrior'])
        self.assertEqual(x['records'],[]);self.assertEqual(len(x['missing']),1)
    def test_parent_sidekick_chapter_does_not_prove_four_variants(self):
        x=mod.extract_source(self.source('<a href="/sources/doip/sidekicks">Sidekicks</a>'),self.spec,['warrior','expert','spellcaster (mage)','spellcaster (healer)'])
        self.assertEqual(x['records'],[]);self.assertEqual(len(x['missing']),4)
        self.assertFalse(x['parentContexts'][0]['satisfiesCreatureClaim'])
    def test_duplicate_heading_is_unresolved(self):
        link='<a href="/sources/doip/sidekicks#Warrior">Warrior</a>'
        x=mod.extract_source(self.source(link+link),self.spec,['warrior'])
        self.assertEqual(x['records'],[]);self.assertEqual(x['missing'][0]['reason'],'ambiguous-scoped-heading')
    def test_foreign_book_title_and_target_fail_closed(self):
        with self.assertRaisesRegex(ValueError,'publisher title'):
            mod.extract_source(b'<h1>Different Book</h1>',self.spec,['warrior'])
        with self.assertRaisesRegex(ValueError,'outside its publication'):
            mod.extract_source(self.source('<a href="/sources/tcoe/sidekicks#Warrior">Warrior</a>'),self.spec,['warrior'])
    def test_label_fragment_mismatch_is_not_repaired(self):
        x=mod.extract_source(self.source('<a href="/sources/doip/sidekicks#Expert">Warrior</a>'),self.spec,['warrior'])
        self.assertEqual(x['records'],[]);self.assertFalse(x['linkAnomalies'][0]['automaticCorrection'])
    def test_one_good_link_cannot_hide_one_wrong_fragment(self):
        x=mod.extract_source(self.source('<a href="/sources/doip/sidekicks#Warrior">Warrior</a><a href="/sources/doip/sidekicks#Expert">Warrior</a>'),self.spec,['warrior'])
        self.assertEqual(x['records'],[]);self.assertEqual(len(x['missing']),1)
    def test_unapproved_longer_label_never_fills_observed_name(self):
        self.spec['unapprovedAlternates']={'red ruffian':['Redbrand Ruffian']}
        x=mod.extract_source(self.source('<a href="/sources/doip/creatures#RedbrandRuffian">Redbrand Ruffian</a>'),self.spec,['red ruffian'])
        self.assertEqual(x['records'],[]);self.assertFalse(x['unapprovedAlternates'][0]['aliasAccepted'])
    def test_publisher_article_mention_is_not_book_toc(self):
        self.spec.update(kind='publisher-article',sourceUrl='https://www.dndbeyond.com/posts/1-title')
        raw=self.source(outside='<div class="article-main"><a href="/monsters/1-warrior">Warrior</a></div>')
        x=mod.extract_source(raw,self.spec,['warrior'])
        self.assertEqual(x['records'],[]);self.assertFalse(x['articleMentions'][0]['acceptedAsPublicationWitness'])
    def test_inaccessible_parent_is_recorded_without_claim(self):
        raw=self.source('<a href="/sources/doip/sidekicks">Sidekicks</a>')
        x=mod.extract_source(raw,self.spec,['warrior'],{'requestedUrl':'https://www.dndbeyond.com/sources/doip/sidekicks','error':'timed out'})
        self.assertEqual(x['chapterAccess']['status'],'unavailable');self.assertFalse(x['chapterAccess']['usedAsCreatureEvidence'])
        self.assertEqual(x['records'],[])

if __name__=='__main__':unittest.main()
