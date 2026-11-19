import copy,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-skt-index.py'))
parse=m['parse']
def page(number,cr='',next_page=None):
 card=f'<div class="info" data-type="monsters"><div class="monster-name"><a href="/monsters/{number}-synthetic">Synthetic</a><span class="source">Storm King\'s Thunder</span></div><div class="monster-challenge">{cr}</div><div class="monster-type">Humanoid</div><div class="monster-size">Medium</div><div class="monster-alignment">Any Alignment</div></div>'
 return '<option id="filter-source-storm-kings-thunder" value="12" selected>SKT</option><ul class="rpgmonster-listing">'+card+'</ul>'+('' if next_page is None else f'<a rel="next" href="/monsters?filter-source=12&amp;page={next_page}">Next</a>')
def fixture():
 pages=[page(i,'' if i%2 else '0',i+1 if i<6 else None) for i in range(1,7)]
 d=dict(accepted=False,complete=False,historicalBookInventoryComplete=False,fullStatBlocksRead=False,approvedDenominator=None,publicIndexTraversalComplete=True,allowBlankChallengeRatings=True,blankChallengeRatingMeaning='not shown in public index; never infer zero',publicIndexPagesCaptured=6,pages=[dict(page=i+1,**parse(p,'12','filter-source-storm-kings-thunder',allow_blank_cr=True)) for i,p in enumerate(pages)],summary={'digitalRows':6,'blankChallengeRatingRows':3,'displayedSourceCounts':{"Storm King's Thunder":6}})
 return d,pages
class SktIndexAuditTests(unittest.TestCase):
 def test_blank_cr_is_opt_in_and_distinct_from_zero(self):
  with self.assertRaises(ValueError):parse(page(1),'12','filter-source-storm-kings-thunder')
  absent=parse(page(1),'12','filter-source-storm-kings-thunder',allow_blank_cr=True)['rows'][0]
  zero=parse(page(1,'0'),'12','filter-source-storm-kings-thunder',allow_blank_cr=True)['rows'][0]
  self.assertEqual(absent['challengeRating'],'');self.assertEqual(zero['challengeRating'],'0')
 def test_missing_cr_cell_and_malformed_value_remain_errors(self):
  for html in [page(1).replace('monster-challenge','absent'),page(1,'unknown'),page(1,'1/2 or 1')]:
   with self.assertRaises(ValueError):parse(html,'12','filter-source-storm-kings-thunder',allow_blank_cr=True)
 def test_six_page_chain_and_blank_counter_match(self):
  d,pages=fixture();self.assertEqual(m['audit_pages'](d,pages),(6,3))
  for changed in [pages[:5],list(reversed(pages)),pages[:5]+[page(6,'0',7)], [pages[0].replace('page=2','page=3'),*pages[1:]]]:
   with self.assertRaises(ValueError):m['audit_pages'](d,changed)
  d['summary']['blankChallengeRatingRows']=2
  with self.assertRaises(ValueError):m['audit_pages'](d,pages)
 def test_matching_manifest_cannot_hide_duplicate_card_or_acceptance(self):
  d,pages=fixture();pages[5]=page(1,'0');d['pages'][5]['rows']=parse(pages[5],'12','filter-source-storm-kings-thunder',allow_blank_cr=True)['rows']
  with self.assertRaisesRegex(ValueError,'Repeated card'):m['audit_pages'](d,pages)
  d,pages=fixture();d['accepted']=True
  with self.assertRaises(ValueError):m['audit_pages'](d,pages)
