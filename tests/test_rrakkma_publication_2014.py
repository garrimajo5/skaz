import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('rrakkma',ROOT/'scripts/audit-rrakkma-publication-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def source():return '<h1>Rrakkma</h1><blockquote class="compendium-toc-blockquote"><h5>AN INTRODUCTORY ADVENTURE FOR MORDENKAINEN\'S TOME OF FOES</h5><p>Adventure Code: DDIA-MORD</p></blockquote>'
def article():return '<h1>'+M.ARTICLE+'</h1><section class="p-article-content"><p>I wrote this back in third edition, updated it to fifth edition, and it was an entire rewrite.</p></section>'

class RrakkmaPublicationTest(unittest.TestCase):
    def test_own_code_and_for_book_relation_come_from_bounded_intro(self):
        d=M.inspect_source(source());self.assertEqual(d['adventureCode'],'DDIA-MORD');self.assertEqual(d['introductoryForBook'],M.BOOK)

    def test_wrong_code_or_modern_book_is_not_assumed_equivalent(self):
        for text in [source().replace('DDIA-MORD','DDAL-OTHER'),source().replace('TOME OF FOES','MONSTERS OF THE MULTIVERSE')]:
            with self.assertRaises(ValueError):M.inspect_source(text)

    def test_meta_or_navigation_words_cannot_substitute_for_visible_intro(self):
        text=source().replace('compendium-toc-blockquote','navigation')
        text+='<meta name="description" content="AN INTRODUCTORY ADVENTURE FOR MORDENKAINEN\'S TOME OF FOES Adventure Code: DDIA-MORD">'
        with self.assertRaises(ValueError):M.inspect_source(text)

    def test_original_edition_and_rewrite_must_be_one_primary_statement(self):
        d=M.inspect_article(article());self.assertTrue(d['FifthEditionRewriteExplicit'])
        for text in [article().replace('entire rewrite','same old text'),article().replace(', updated it','.</p><p>updated it')]:
            with self.assertRaises(ValueError):M.inspect_article(text)

    def test_comment_statement_is_not_publisher_body_evidence(self):
        with self.assertRaises(ValueError):M.inspect_article(article().replace('p-article-content','comments'))

    def test_companion_relation_does_not_become_alias_containment_or_generic_al_attribution(self):
        d=json.loads((ROOT/'catalog/rrakkma-publication-boundary-2014.json').read_text(encoding='utf-8'))
        self.assertEqual(d['relationship']['containedInBook'],'not-established')
        self.assertFalse(d['relationship']['isAliasOfIntroducedBook']);self.assertFalse(d['relationship']['genericALSource169InferredFromAdventureCode'])
        self.assertIsNone(d['numericDndsuSourceId']);self.assertIsNone(d['approvedDenominator']);self.assertFalse(d['accepted'])

    def test_generator_and_upstream_parser_hashes_remain_independent_of_json_inputs(self):
        d=json.loads((ROOT/'catalog/rrakkma-publication-boundary-2014.json').read_text(encoding='utf-8'))
        for key in ['generator','upstreamParser']:
            self.assertEqual(d[key]['sha256'],M.sha((ROOT/d[key]['path']).read_bytes().replace(b'\r\n',b'\n')))
        self.assertTrue(all(p.endswith('.json') for p in d['inputSha256']))

if __name__=='__main__':unittest.main()
