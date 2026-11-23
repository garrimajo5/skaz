import importlib.util
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('academy',ROOT/'scripts/audit-spelljammer-academy-series-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def toc():
    out=['<h1>Spelljammer Academy</h1>']
    for n,(name,slug) in enumerate(M.PARTS,1):
        out += [f'<h2>0{n}: {name}</h2>','<div class="compendium-toc-full-text">',f'<h3><a href="/sources/sja/{slug}#Introduction">Introduction</a></h3>',f'<h3><a href="/sources/sja/{slug}#CreatureStatistics">Creature Statistics</a></h3>','</div>']
    return '\n'.join(out)

class AcademySeriesTest(unittest.TestCase):
    def test_later_parts_cannot_inherit_previous_part_links(self):
        d=M.inspect_parts(toc());self.assertEqual(len(d['orderedPartReferences']),4)
        for row,(_,slug) in zip(d['orderedPartReferences'],M.PARTS):
            self.assertTrue(all('/'+slug+'#' in a['url'] for a in row['creatureStatisticsReferences']))


def article():return '<h1>'+M.ARTICLE+'</h1><section class="p-article-content"><p>A series of four adventures takes characters from levels 1-5. They prepare for Light of Xaryxis, included in Spelljammer: Adventures in Space.</p></section>'
def claim():return '<h1>Claim Spelljammer Academy now!</h1><h1>Spelljammer Academy</h1><div class="claim-main"><p>A series of four adventures.</p><span class="claim-main__purchase-inactive">This promotion is no longer available.</span></div>'
def timing():return 'SPELLJAMMER ACADEMY LEVEL REQUIREMENTS FOR PLAY. As designed, play the parts sequentially; as an option for SJA Adventurers League play, characters may play in any order. Do not advance above 4th level before finishing all the Spelljammer Academy adventures they wish to play.'

class AcademyBoundariesTest(unittest.TestCase):
    def test_repeated_creature_headings_remain_four_scoped_references(self):
        d=M.inspect_parts(toc());refs=[r['creatureStatisticsReferences'] for r in d['orderedPartReferences']]
        self.assertEqual([len(r) for r in refs],[1,1,1,1]);self.assertEqual(len({r[0]['url'] for r in refs}),4)

    def test_parts_cannot_be_sorted_silently_or_unexpected_fifth_ignored(self):
        for text in [toc().replace('02: Trial','03: Trial'),toc()+'\n<h2>05: Fifth unpublished part</h2>']:
            with self.assertRaises(ValueError):M.inspect_parts(text)

    def test_wrong_part_target_is_not_relabelled_by_title(self):
        with self.assertRaises(ValueError):M.inspect_parts(toc().replace('/sources/sja/trial-by-fire','/sources/sja/orientation'))

    def test_part_heading_inside_toc_is_rejected(self):
        with self.assertRaises(ValueError):M.inspect_parts(toc().replace('<h3><a href="/sources/sja/orientation','<h2>02: Trial By Fire</h2><h3><a href="/sources/sja/orientation',1))

    def test_same_article_paragraph_must_tie_series_completion_and_preparation(self):
        self.assertEqual(M.inspect_article(article())['advertisedCompletionLevel'],5)
        for text in [article().replace('levels 1-5','levels 1-4'),article().replace('series of four','series of five'),article().replace('p-article-content','comments')]:
            with self.assertRaises(ValueError):M.inspect_article(text)

    def test_optional_al_before_completion_timing_is_not_global_cap(self):
        d=M.inspect_al_timing(timing());self.assertEqual(d['alBeforeSelectedAdventuresFinishedOrdinaryMaximumLevel'],4)
        for key in ['allFourPartsAlwaysMandatory','globalProfileMaximumLevelIs4','automaticLevelGrantedOnMetadataImport']:self.assertFalse(d[key])
        for text in [timing().replace('before finishing','after finishing'),timing().replace('as an option for SJA Adventurers League play','globally mandatory'),timing().replace('they wish to play.','every player must play.')]:
            with self.assertRaises(ValueError):M.inspect_al_timing(text)

    def test_ended_promotion_is_not_owner_access_or_full_content_review(self):
        d=M.inspect_claim(claim());self.assertTrue(d['currentPromotionEndedNotice'])
        self.assertFalse(d['claimSubmitted']);self.assertFalse(d['priorClaimantAccessTested']);self.assertFalse(d['fullAdventureRulesReviewed'])
        with self.assertRaises(ValueError):M.inspect_claim(claim().replace('This promotion is no longer available.','Available now.'))

    def test_series_does_not_inherit_boxed_set_or_al_source_id(self):
        import json
        d=json.loads((ROOT/'catalog/spelljammer-academy-series-boundary-2014.json').read_text(encoding='utf-8'));r=d['relationship']
        self.assertEqual(r['containedInBoxedSet'],'not-established');self.assertFalse(r['isAliasOfBoxedSet']);self.assertFalse(r['genericALSource169Assigned'])
        self.assertIsNone(d['numericDndsuSourceId']);self.assertFalse(d['accepted']);self.assertIsNone(d['approvedDenominator'])

    def test_self_and_reused_parsers_have_separate_code_hashes(self):
        import json
        d=json.loads((ROOT/'catalog/spelljammer-academy-series-boundary-2014.json').read_text(encoding='utf-8'))
        for pin in [d['generator'],*d['upstreamParsers']]:self.assertEqual(pin['sha256'],M.sha((ROOT/pin['path']).read_bytes().replace(b'\r\n',b'\n')))
        self.assertTrue(all(p.endswith('.json') for p in d['inputSha256']))

if __name__=='__main__':unittest.main()
