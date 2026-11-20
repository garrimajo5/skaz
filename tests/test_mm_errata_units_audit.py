import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-mm-errata-units.py'))
DATA=json.loads((ROOT/'catalog/mm-errata-unit-inventory-2014.json').read_text(encoding='utf-8'))
def minimal_pages():
 # This tests heading extraction only; the real pinned PDF audit verifies the actual inventory.
 p=['Introduction Spellcasting (p. 10). Excluded. ','']
 for r in DATA['records']:p[r['pdfPage']-1]+=r['primaryName']+' (p. '+r['bookPageLabel']+'). Placeholder. '
 return p
class UnitInventoryTests(unittest.TestCase):
 def test_all_heading_kinds_and_page_range_remain_distinct(self):
  r=m['extract_units'](minimal_pages());self.assertEqual(m['audit'](DATA,r),{'correctionHeadings':80,'namedStatBlockHeadings':75,'namedVariantHeadings':1,'nonIndividualUnits':4})
  swarm=next(x for x in r if x['primaryName']=='Swarm of X');self.assertEqual(swarm['bookPageLabel'],'337\u201339');self.assertEqual(swarm['unitKind'],'stat-block-family')
  self.assertNotIn('Spellcasting',[x['primaryName'] for x in r])
 def test_duplicate_and_omitted_heading_fail(self):
  p=minimal_pages();p[1]+='Noble (p. 348). Extra.'
  with self.assertRaises(ValueError):m['extract_units'](p)
  p=minimal_pages();p[1]=p[1].replace('Noble (p. 348).','')
  with self.assertRaises(ValueError):m['extract_units'](p)
 def test_family_cannot_be_relabelled_as_single_monster(self):
  d=copy.deepcopy(DATA);next(r for r in d['records'] if r['primaryName']=='Swarm of X')['unitKind']='named-stat-block'
  with self.assertRaises(ValueError):m['audit'](d,m['extract_units'](minimal_pages()))
 def test_book_acceptance_wrong_counts_and_pages_fail(self):
  for change in [lambda d:d.update(completeBookInventory=True),lambda d:d['summary'].update(correctionHeadings=79),lambda d:d['records'][0].update(pdfPage=2)]:
   d=copy.deepcopy(DATA);change(d)
   with self.assertRaises(ValueError):m['audit'](d,m['extract_units'](minimal_pages()))
if __name__=='__main__':unittest.main()
