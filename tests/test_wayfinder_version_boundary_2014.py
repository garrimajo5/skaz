import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('wayfinder',ROOT/'scripts/audit-wayfinder-version-boundary-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def prototype():return '<h1>Wayfinder\'s Guide to Eberron</h1><blockquote class="compendium-toc-blockquote"><p>A campaign prototype.</p></blockquote>'
def staff():
    return '<a class="first-dev-comment" data-first-dev-comment-index="1" href="'+M.TOPIC+'?comment=1">First Staff Post</a><div id="forum-post-body-1"><p>Specific content from the old version of WGtE was recreated as public homebrew for those non-official mechanics.</p></div><div id="forum-post-body-2"><p>Other user reply.</p></div>'
def guide():
    return ['Version 2.4','For the official organized play campaign; otherwise use these as suggestions.',"Eberron Campaign. Wayfinder's Guide to Eberron is not a legal source, except in the case where content matches Eberron: Rising from the Last War exactly. Always use the most recent iteration."]

class WayfinderVersionBoundaryTest(unittest.TestCase):
    def test_prototype_metadata_is_scoped_to_named_book_intro(self):
        self.assertTrue(M.inspect_prototype(prototype())['prototypeDescriptionStillDisplayed'])
        with self.assertRaises(ValueError):M.inspect_prototype(prototype().replace('Wayfinder\'s Guide to Eberron','Rising from the Last War'))

    def test_meta_or_navigation_cannot_supply_prototype_description(self):
        with self.assertRaises(ValueError):M.inspect_prototype(prototype().replace('compendium-toc-blockquote','navigation'))

    def test_exact_first_staff_post_is_required_not_arbitrary_reply(self):
        self.assertEqual(M.inspect_staff_revision(staff())['postIndex'],1)
        for text in [staff().replace('data-first-dev-comment-index="1"','data-first-dev-comment-index="2"'),staff().replace('id="forum-post-body-1"','id="forum-post-body-3"'),staff().replace('?comment=1','?comment=2')]:
            with self.assertRaises(ValueError):M.inspect_staff_revision(text)

    def test_old_specific_mechanics_cannot_turn_into_all_versions(self):
        d=M.inspect_staff_revision(staff());self.assertFalse(d['allVersionsOrAllBookTextDeclaredHomebrew'])
        for phrase in ['old version','Specific content','non-official mechanics']:
            with self.assertRaises(ValueError):M.inspect_staff_revision(staff().replace(phrase,'different statement'))

    def test_quoted_or_metadata_copy_is_not_original_staff_statement(self):
        with self.assertRaises(ValueError):M.inspect_staff_revision(staff().replace('<p>Specific content','<blockquote><p>Specific content').replace('</p></div>','</p></blockquote></div>',1))
        with self.assertRaises(ValueError):M.inspect_staff_revision(staff().replace('Specific content','Different content',1)+'<meta content="Specific content from the old version of WGtE public homebrew non-official mechanics">')

    def test_conditional_al_exception_and_campaign_scope_are_both_required(self):
        v,s,t=guide();d=M.inspect_al_boundaries(v,s,t,67)
        self.assertTrue(d['exactRisingTextExceptionPresent']);self.assertFalse(d['alLegalityIsGeneralCatalogOrHomeGamePermission'])
        for changed in [t.replace('except in the case','without exception'),t.replace('Eberron Campaign','Another Campaign')]:
            with self.assertRaises(ValueError):M.inspect_al_boundaries(v,s,changed,67)

    def test_event_guidance_cannot_be_recast_as_global_game_restriction(self):
        v,s,t=guide()
        with self.assertRaises(ValueError):M.inspect_al_boundaries(v,s.replace('use these as suggestions','globally forbidden'),t,67)

    def test_wrong_pdf_version_or_page_count_fails(self):
        v,s,t=guide()
        for version,pages in [('Version 2.5',67),(v,66)]:
            with self.assertRaises(ValueError):M.inspect_al_boundaries(version,s,t,pages)

    def test_report_keeps_updated_version_unknown_and_user_manual_path(self):
        d=json.loads((ROOT/'catalog/wayfinder-version-boundary-2014.json').read_text(encoding='utf-8'));p=d['versionScopeProposal']
        self.assertEqual(p['currentOrUpdatedVersionOfficialStatus'],'requires-version-specific-evidence')
        self.assertFalse(p['prototypeMarketingLabelAutomaticallyExcludesEveryVersion']);self.assertFalse(p['wotcPublisherLabelAutomaticallyIncludesAllMechanics'])
        self.assertTrue(p['profileManualExceptionsRetained']);self.assertFalse(p['alEventRestrictionBlocksOrdinaryProfileAction'])
        self.assertFalse(d['accepted']);self.assertIsNone(d['numericDndsuSourceId']);self.assertIsNone(d['approvedDenominator'])

    def test_failed_limited_attempts_are_not_publication_status_evidence_or_retried(self):
        d=json.loads((ROOT/'catalog/wayfinder-version-boundary-2014.json').read_text(encoding='utf-8'));a=d['authorObservedExternalConditions']
        self.assertFalse(a['currentFullMechanicsRead']);self.assertEqual(len(a['limitedAttempts']),2)
        self.assertTrue(all(not r['retried'] for r in a['limitedAttempts']))

    def test_code_provenance_separate_from_json_inputs(self):
        d=json.loads((ROOT/'catalog/wayfinder-version-boundary-2014.json').read_text(encoding='utf-8'))
        for key in ['generator','upstreamParser']:self.assertEqual(d[key]['sha256'],M.sha((ROOT/d[key]['path']).read_bytes().replace(b'\r\n',b'\n')))
        self.assertTrue(all(p.endswith('.json') for p in d['inputSha256']))

if __name__=='__main__':unittest.main()
