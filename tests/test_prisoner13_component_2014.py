import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('prisoner_component',ROOT/'scripts/audit-prisoner13-component-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def article():
    return '<h1>'+M.ARTICLE_TITLE+'</h1><section class="p-article-content"><p>Prisoner 13 is a heist-based adventure from the upcoming anthology <em><a href="https://www.dndbeyond.com/marketplace/adventures/keys-from-the-golden-vault?tracking=fixture">Keys from the Golden Vault</a></em>.</p><p>Users can claim Prisoner 13 at no cost.</p></section>'
def parent():
    return '<h1>'+M.PARENT+'</h1><div class="compendium-toc-full-text"><h3><a href="/sources/kftgv/prisoner-13">Prisoner 13</a></h3><a href="/sources/kftgv/prisoner-13#Prisoner13"><strong>Stat Block:</strong> Prisoner 13</a></div>'

class PrisonerComponentTest(unittest.TestCase):
    def test_publisher_relation_requires_scoped_statement_and_direct_parent_link(self):
        d=M.inspect_article(article());self.assertTrue(d['explicitAdventureFromAnthologyStatement'])
        self.assertTrue(d['publicArticleOffersClaimAtNoCost'])
        self.assertIn('tracking=fixture',d['parentLink'])

    def test_matching_words_in_comments_are_not_publisher_evidence(self):
        text=article().replace('heist-based adventure from the upcoming anthology','different story')
        text+='<section class="comments"><p>Prisoner 13 is a heist-based adventure from the upcoming anthology Keys from the Golden Vault</p></section>'
        with self.assertRaisesRegex(ValueError,'statement'):M.inspect_article(text)

    def test_missing_or_foreign_parent_link_is_rejected(self):
        for text in [article().replace('https://www.dndbeyond.com/marketplace','https://wrong.test/marketplace'),article().replace('>Keys from the Golden Vault</a>','>Different Book</a>')]:
            with self.assertRaises(ValueError):M.inspect_article(text)

    def test_duplicate_or_missing_article_container_is_ambiguous(self):
        for text in [article()+article(),article().replace('p-article-content','comments')]:
            with self.assertRaises(ValueError):M.inspect_article(text)

    def test_adventure_and_same_name_statblock_remain_separate(self):
        d=M.inspect_parent(parent())
        self.assertNotEqual(d['adventureChapterUrl'],d['sameNameStatblock']['url'])
        self.assertEqual(d['sameNameStatblock']['catalogUnitDecision'],'separate-kind-review-required')

    def test_statblock_alone_cannot_prove_an_adventure_component(self):
        text=parent().replace('<h3>','<p>').replace('</h3>','</p>')
        with self.assertRaisesRegex(ValueError,'adventure'):M.inspect_parent(text)

    def test_fragment_or_other_book_is_not_the_adventure_heading(self):
        for text in [parent().replace('prisoner-13">Prisoner 13</a></h3>','prisoner-13#Prisoner13">Prisoner 13</a></h3>'),parent().replace('/sources/kftgv/','/sources/other/')]:
            with self.assertRaises(ValueError):M.inspect_parent(text)

    def test_capture_pins_redirect_separately_without_claiming_access(self):
        raw=b'public claim landing';digest=M.sha(raw);url='https://publisher.test/source';final='https://publisher.test/claim'
        c={'requestedUrl':url,'finalUrl':final,'status':200,'bytes':len(raw),'sha256':digest,'capturedAt':'fixture'}
        self.assertEqual(M.verify_capture(raw,c,url,final,digest)['finalUrl'],final)
        for key,val in [('finalUrl',url),('status',403),('bytes',0),('sha256','0'*64)]:
            with self.assertRaises(ValueError):M.verify_capture(raw,{**c,key:val},url,final,digest)
        with self.assertRaises(ValueError):M.verify_capture(raw+b'x',c,url,final,digest)

    def test_report_does_not_join_provider105_to_historical105_or_grant_text_rights(self):
        d=json.loads((ROOT/'catalog/prisoner13-publication-component-2014.json').read_text(encoding='utf-8'))
        self.assertFalse(d['accepted']);self.assertFalse(d['complete']);self.assertIsNone(d['approvedDenominator'])
        self.assertIsNone(d['relationship']['childDndsuSourceId']);self.assertEqual(d['relationship']['existingParentDndsuSourceId'],'189')
        self.assertFalse(d['relationship']['automaticRecordAttribution']);self.assertEqual(d['relationship']['fullTextEquivalence'],'unverified')
        self.assertFalse(d['accessBoundary']['claimSubmitted']);self.assertFalse(d['accessBoundary']['childFullAdventureTextInspected'])
        self.assertFalse(d['accessBoundary']['freeClaimOfferIsPublicationPermission'])
        self.assertEqual([r['providerIsFree'] for r in d['providerReferences']],[False,False])

    def test_generator_hash_and_json_only_input_pins(self):
        d=json.loads((ROOT/'catalog/prisoner13-publication-component-2014.json').read_text(encoding='utf-8'))
        self.assertTrue(all(x.endswith('.json') for x in d['inputSha256']))
        self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))

if __name__=='__main__':unittest.main()
