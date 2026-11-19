import copy,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-infernal-machine-index.py'))
def page(number,next_page=None,source='Infernal Machine Rebuild'):
 card=f'<div class="info" data-type="monsters"><div class="monster-name"><a href="/monsters/{number}-test-creature">Same Name</a><span class="source">{source}</span></div><div class="monster-challenge">1/2</div><div class="monster-type">Fey</div><div class="monster-size">Small</div><div class="monster-alignment">Any Alignment</div></div>'
 link='' if next_page is None else f'<a rel="next" href="/monsters?filter-source=56&amp;page={next_page}">Next</a>'
 return '<option id="filter-source-infernal-machine-rebuild" value="56" selected>IMR</option>'+link+'<ul class="rpgmonster-listing">'+card+'</ul>'+link
def fixture():
 pages=[page(1,2),page(2,3,'Monster Manual (2014)'),page(3)]
 d=dict(publicIndexTraversalComplete=True,historicalBookInventoryComplete=False,fullStatBlocksRead=False,accepted=False,complete=False,approvedDenominator=None,publicIndexPagesCaptured=3,filterValue='56',filterOptionId='filter-source-infernal-machine-rebuild',pages=[dict(page=i+1,**m['parse'](s,'56','filter-source-infernal-machine-rebuild')) for i,s in enumerate(pages)],summary=dict(digitalRows=3,displayedSourceCounts={'Infernal Machine Rebuild':2,'Monster Manual (2014)':1}))
 return d,pages
class MonsterIndexChainTests(unittest.TestCase):
 def test_same_names_distinct_cards_and_identical_top_bottom_next_controls_are_valid(self):
  d,pages=fixture();self.assertEqual(m['audit_pages'](d,pages),3)
 def test_lost_page_wrong_order_or_extra_next_is_not_complete(self):
  d,pages=fixture()
  for changed in [pages[:2],list(reversed(pages)),pages[:2]+[page(3,4)], [pages[0].replace('page=2','page=3'),*pages[1:]]]:
   with self.assertRaises(ValueError):m['audit_pages'](d,changed)
 def test_duplicate_across_pages_cannot_be_hidden_by_matching_manifest(self):
  d,pages=fixture();pages[2]=page(1);d['pages'][2]['rows']=copy.deepcopy(d['pages'][0]['rows'])
  with self.assertRaisesRegex(ValueError,'Repeated card'):m['audit_pages'](d,pages)
 def test_source_counts_and_boundary_flags_are_not_inferred_from_traversal(self):
  d,pages=fixture()
  for flag in ['historicalBookInventoryComplete','fullStatBlocksRead','accepted','complete']:
   bad=copy.deepcopy(d);bad[flag]=True
   with self.assertRaises(ValueError):m['audit_pages'](bad,pages)
  d['summary']['displayedSourceCounts']['Infernal Machine Rebuild']=3
  with self.assertRaisesRegex(ValueError,'Summary mismatch'):m['audit_pages'](d,pages)
