import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('race_toc', Path(__file__).resolve().parents[1]/'scripts/extract-race-toc-evidence.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class RaceTocTests(unittest.TestCase):
    def html(self):
        return b'<h1>The Wild Beyond the Witchlight</h1><a href="/sources/twbtw/into-the-feywild#Fairy">Fairy</a><a href="/sources/twbtw/into-the-feywild#Harengon">Harengon</a><p>Full rules must not be retained.</p>'
    def test_only_selected_metadata(self):
        result = m.extract(self.html(), 'twbtw')
        self.assertEqual([r['name'] for r in result['records']], ['fairy','harengon'])
        self.assertNotIn('Full rules', str(result))
        self.assertEqual(len(result['htmlSha256']), 64)
    def test_wrong_title(self):
        with self.assertRaises(ValueError): m.extract(self.html().replace(b'Witchlight', b'Other Book'), 'twbtw')
    def test_duplicate_and_missing(self):
        for raw in [self.html()+b'<a href="/sources/twbtw/other">Fairy</a>', self.html().replace(b'>Fairy<',b'>Not Fairy<')]:
            with self.assertRaises(ValueError): m.extract(raw,'twbtw')
    def test_wrong_host_book_query(self):
        for url in [b'https://www.dndbeyond.com.evil.invalid/sources/twbtw/a',b'/sources/ggtr/a',b'/sources/twbtw/a?x=1']:
            with self.assertRaises(ValueError): m.extract(self.html().replace(b'/sources/twbtw/into-the-feywild#Fairy',url),'twbtw')
    def test_selected_nested_text_and_entities(self):
        raw=b'<h1>Guildmasters&#39; Guide to Ravnica</h1><a href="/compendium/rules/ggtr/character-creation#Centaur"><span>Centaur</span></a><a href="/sources/dnd/ggtr/character-creation#Minotaur">Minotaur</a>'
        self.assertEqual(len(m.extract(raw,'ggtr')['records']),2)

if __name__ == '__main__': unittest.main()
