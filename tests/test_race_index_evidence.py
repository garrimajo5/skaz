import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('race_evidence',Path(__file__).resolve().parents[1]/'scripts/extract-race-index-evidence.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

def card(name='Synthetic',publication='Synthetic Book',link='/species/123-synthetic'):
    return f'<li class="listing-card-race" data-collapsible-search="{name}|{publication}"><a class="listing-card__link" href="{link}">No rules retained</a></li>'

class EvidenceParserTests(unittest.TestCase):
    def test_only_selected_exact_card_tokens_and_identity_links(self):
        html=card()+card('Other')+card().replace('listing-card-race','not-listing-card-race')
        self.assertEqual(module.extract(html,['synthetic']),[{'name':'Synthetic','publication':'Synthetic Book','url':'https://www.dndbeyond.com/species/123-synthetic'}])
    def test_duplicate_or_unclosed_cards_fail(self):
        for html in [card()+card(),card().replace('</li>','')]:
            with self.assertRaises(ValueError):module.extract(html,['synthetic'])
    def test_missing_ambiguous_and_foreign_links_fail(self):
        for html in [card(link='https://example.org/species/123-synthetic'),card(link='/species/'),card().replace('listing-card__link','other'),card().replace('</li>','<a class="listing-card__link" href="/species/124-other"></a></li>')]:
            with self.assertRaises(ValueError):module.extract(html,['synthetic'])
    def test_entities_and_nested_list_do_not_truncate_metadata(self):
        html=card(publication='A &amp; B').replace('</a>','<ul><li>Not a species</li></ul></a>')
        self.assertEqual(module.extract(html,['synthetic'])[0]['publication'],'A & B')
    def test_source_is_required_and_comments_cannot_create_cards(self):
        self.assertEqual(module.extract('<!--'+card()+'-->',['synthetic']),[])
        with self.assertRaises(ValueError):module.extract(card(publication=''),['synthetic'])

if __name__=='__main__':unittest.main()
