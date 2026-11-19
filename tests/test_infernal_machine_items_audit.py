import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-infernal-machine-items.py'))
def item(name='Synthetic Gem',url='1-synthetic-gem',attunement='——'):
 return f'<div class="info" data-type="magic-items"><div class="item-name"><a href="/magic-items/{url}"><span>{name}</span></a><span class="rarity">Rare</span></div><div class="item-type"><span>Wondrous Item</span></div><div class="requires-attunement">{attunement}</div><div class="notes">Consumable</div></div>'
def page(cards=None,next_page=None):
 return '<select><option id="filter-source-infernal-machine-rebuild" value="56" selected>IMR</option></select><ul class="rpgmagic-item-listing">'+(cards if cards is not None else item())+'</ul>'+('' if next_page is None else f'<a href="/magic-items?filter-source=56&amp;page={next_page}" rel="next">Next</a>')
class ItemIndexParserTests(unittest.TestCase):
 def test_nested_name_and_dash_label_preserved_without_rule_inference(self):
  r=m['parse_page'](page())['rows'][0];self.assertEqual(r['digitalName'],'Synthetic Gem');self.assertEqual(r['attunementLabel'],'——');self.assertEqual(r['typeLabel'],'Wondrous Item')
 def test_attunement_required_and_empty_note_are_distinct(self):
  r=m['parse_page'](page(item(attunement='Required')).replace('Consumable',''))['rows'][0];self.assertEqual(r['attunementLabel'],'Required');self.assertEqual(r['notesLabel'],'')
 def test_wrong_filter_redirect_or_conflicting_next_page_rejected(self):
  for text in [page().replace(' selected',''),page().replace('value="56"','value="57"'),page(next_page=2).replace('/magic-items?','https://example.com/magic-items?'),page(next_page=2)+'<a rel="next" href="/magic-items?filter-source=56&amp;page=3">Next</a>']:
   with self.assertRaises(ValueError):m['parse_page'](text)
 def test_missing_duplicate_and_malformed_fields_rejected(self):
  for text in [page(item()+item()),page().replace('class="rarity"','class="missing"'),page().replace('/magic-items/1-synthetic-gem','/magic-items/not-an-id'),page('')]:
   with self.assertRaises(ValueError):m['parse_page'](text)
 def test_page_chain_and_observed_metadata_are_checked(self):
  pages=[page(next_page=2),page(item('Second Gem','2-second-gem'))];expected=[{'page':i+1,**m['parse_page'](s)} for i,s in enumerate(pages)]
  d={'accepted':False,'complete':False,'approvedDenominator':None,'fullRulesVerified':False,'pages':expected,'digitalRowCount':2};self.assertEqual(m['audit'](d,pages),2)
  for changed in [[pages[1],pages[0]],[pages[0]], [pages[0],pages[1].replace('Rare','Common')]]:
   with self.assertRaises(ValueError):m['audit'](d,changed)
  bad=copy.deepcopy(d);bad['approvedDenominator']=2
  with self.assertRaises(ValueError):m['audit'](bad,pages)
