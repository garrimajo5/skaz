import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('frozen_component',ROOT/'scripts/audit-frozen-sick-component-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def article():
    return '<h1>Running Winter Adventures in D&amp;D</h1><section class="p-article-content"><p><a href="'+M.SNAPSHOTS['child.html'][1]+'">Frozen Sick</a> is a short adventure. It was included in Explorer’s Guide to Wildemount.</p></section>'
def parent():
    return '<h1>Explorer\'s Guide to Wildemount</h1><h1>Explorer’s Guide to Wildemount</h1><div class="compendium-toc-full-text"><a href="/sources/egtw/adventures-in-wildemount-frozen-sick">Frozen Sick</a></div>'
def child():
    return '<link rel="canonical" href="'+M.SNAPSHOTS['child.html'][1]+'"><h1>Frozen Sick</h1><p>Unreviewed fixture adventure prose.</p>'

class FrozenSickComponentTest(unittest.TestCase):
    def test_curly_apostrophe_title_does_not_invent_a_different_book(self):
        self.assertEqual(M.inspect_parent(parent())['title'],M.PARENT)
        self.assertTrue(M.inspect_article(article())['explicitAdventureIncludedInParent'])

    def test_other_wildemount_or_critical_role_book_is_not_assumed_equivalent(self):
        for text in [parent().replace('Wildemount','Tal\'Dorei'),parent().replace('/sources/egtw/','/sources/taldorei/')]:
            with self.assertRaises(ValueError):M.inspect_parent(text)

    def test_duplicate_component_target_is_not_silently_deduplicated(self):
        text=parent().replace('</div>','<a href="/sources/egtw/adventures-in-wildemount-frozen-sick">Frozen Sick</a></div>')
        with self.assertRaises(ValueError):M.inspect_parent(text)

    def test_article_requires_child_link_not_just_words_or_comments(self):
        for text in [article().replace('/sources/dnd/wa/frozen-sick','/sources/other/frozen-sick'),article().replace('p-article-content','comments')]:
            with self.assertRaises(ValueError):M.inspect_article(text)

    def test_child_identity_never_collects_or_reports_adventure_prose(self):
        d=M.inspect_child_identity(child())
        self.assertFalse(d['semanticFullAdventureRulesReviewed'])
        self.assertNotIn('Unreviewed fixture',json.dumps(d))

    def test_claim_page_or_unrelated_title_is_not_a_public_chapter_identity(self):
        for text in [child().replace('/sources/dnd/wa/frozen-sick','/claim/source/frozen-sick'),child().replace('>Frozen Sick<','>Different Adventure<')]:
            with self.assertRaises(ValueError):M.inspect_child_identity(text)

    def test_cobrand_and_existing_publication_evidence_stay_separate(self):
        d=json.loads((ROOT/'catalog/frozen-sick-publication-component-2014.json').read_text(encoding='utf-8'))
        self.assertEqual({r['displayedPublisher'] for r in d['providerReferences']},{'Critical Role'})
        self.assertEqual(d['existingParentPublicationEvidence']['publisher'],'Wizards of the Coast')
        for field in ['publisherLabelIsAutomaticExclusion','childScopeAutomaticallyInherited','ownerThirdPartyExclusionChanged']:
            self.assertFalse(d['coBrandBoundary'][field])
        self.assertEqual(d['relationship']['existingParentDndsuSourceId'],'116');self.assertIsNone(d['relationship']['childDndsuSourceId'])
        self.assertFalse(d['accepted']);self.assertIsNone(d['approvedDenominator'])
        self.assertEqual(d['relationship']['fullTextEquivalence'],'unverified')

    def test_generator_and_reused_parser_provenance_are_individually_pinned(self):
        d=json.loads((ROOT/'catalog/frozen-sick-publication-component-2014.json').read_text(encoding='utf-8'))
        for key in ['generator','upstreamParser']:
            self.assertEqual(d[key]['sha256'],M.sha((ROOT/d[key]['path']).read_bytes().replace(b'\r\n',b'\n')))
        self.assertTrue(all(path.endswith('.json') for path in d['inputSha256']))

if __name__=='__main__':unittest.main()
