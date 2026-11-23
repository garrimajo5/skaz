import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('storm',ROOT/'scripts/audit-stormwreck-publication-pair-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def article():return '<link rel="canonical" href="'+M.BODY_PINS['article.html'][0]+'"><h1>'+M.ARTICLE+'</h1><section class="p-article-content"><p>It includes two encounters, Voyage to Stormwreck Isle and Drowned Sailors, that tie into Dragons of Stormwreck Isle.</p><ul><li>Voyage to Stormwreck Isle is set aboard a ship en route to the island.</li><li>Drowned Sailors is from the first chapter of Dragons of Stormwreck Isle and follows the events of Voyage to Stormwreck Isle.</li></ul></section>'
def parent():return '<link rel="canonical" href="'+M.BODY_PINS['parent.html'][0]+'"><h1>'+M.BOOK+'</h1><div class="compendium-toc-full-text"><a href="/sources/dosi/dragons-rest#DrownedSailors">Drowned Sailors</a></div>'

class StormwreckPublicationPairTest(unittest.TestCase):
    def test_two_encounters_do_not_become_whole_intro_or_chapter_equality(self):
        d=M.inspect_article(article());self.assertEqual(len(d['encounterEvidence']),2)
        self.assertEqual(d['encounterEvidence'][0]['originRelativeToFullBook'],'not-established')
        self.assertTrue(d['encounterEvidence'][1]['explicitFirstChapterReuseReference']);self.assertFalse(d['allIntroTextOrWholeFirstChapterIdentical'])

    def test_partial_reuse_statement_is_required_not_title_similarity(self):
        with self.assertRaises(ValueError):M.inspect_article(article().replace('is from the first chapter of','resembles an event in'))

    def test_other_canonical_or_unscoped_comment_is_not_publisher_evidence(self):
        for text in [article().replace('p-article-content','comments'),article().replace(M.BODY_PINS['article.html'][0],'https://other.test/article')]:
            with self.assertRaises(ValueError):M.inspect_article(text)

    def test_parent_requires_exact_shared_encounter_fragment(self):
        self.assertIn('#DrownedSailors',M.inspect_book(parent())['sharedEncounterReference']['url'])
        with self.assertRaises(ValueError):M.inspect_book(parent().replace('#DrownedSailors','#OtherEncounter'))

    def test_body_only_capture_cannot_invent_lost_http_metadata(self):
        raw=b'archived public body';url='https://www.dndbeyond.com/source';digest=M.sha(raw)
        good={'recordType':'saved-response-body-without-retained-transaction','requestedUrl':url,'httpStatus':None,'finalUrl':None,'bytes':len(raw),'sha256':digest}
        self.assertIsNone(M.verify_body(raw,good,url,digest)['httpStatus'])
        for changed in [{**good,'httpStatus':200},{**good,'finalUrl':url},{**good,'status':200},{**good,'bytes':0}]:
            with self.assertRaises(ValueError):M.verify_body(raw,changed,url,digest)
        with self.assertRaises(ValueError):M.verify_body(raw+b'x',good,url,digest)

    def test_two_provider_witnesses_keep_own_numeric_ids_unknown(self):
        d=json.loads((ROOT/'catalog/stormwreck-publication-pair-boundary-2014.json').read_text(encoding='utf-8'))
        self.assertEqual(d['providerSourceIds'],[94,128]);self.assertEqual(set(d['perProviderWitnesses']),{'94','128'})
        for r in d['perProviderWitnesses'].values():
            self.assertIsNone(r['numericDndsuSourceId']);self.assertIsNone(r['canonicalSourceId']);self.assertFalse(r['fullRulesReviewed'])
        self.assertFalse(d['relationship']['starterSetBrandInventsHistoricalIdOrAlias']);self.assertFalse(d['accepted']);self.assertIsNone(d['approvedDenominator'])

    def test_failed_intro_does_not_become_claim_status_or_complete_body_provenance(self):
        d=json.loads((ROOT/'catalog/stormwreck-publication-pair-boundary-2014.json').read_text(encoding='utf-8'));p=d['authorObservedAccessAndProvenanceLimits']
        self.assertFalse(p['introBodyOrAccessStateInspected']);self.assertFalse(p['introRequest']['retried'])
        self.assertTrue(p['successfulBodyResponsesRetainedWithoutTransactionMetadata'])
        self.assertTrue(all(r['httpStatus'] is None and r['finalUrl'] is None for r in d['sources'].values()))

    def test_generator_and_parser_pins_stay_separate_from_json_sources(self):
        d=json.loads((ROOT/'catalog/stormwreck-publication-pair-boundary-2014.json').read_text(encoding='utf-8'))
        for key in ['generator','upstreamParser']:self.assertEqual(d[key]['sha256'],M.sha((ROOT/d[key]['path']).read_bytes().replace(b'\r\n',b'\n')))
        self.assertTrue(all(p.endswith('.json') for p in d['inputSha256']))

if __name__=='__main__':unittest.main()
