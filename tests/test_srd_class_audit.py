import runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
tables=runpy.run_path(str(ROOT/'scripts/extract-srd-class-tables.py'))
spells=runpy.run_path(str(ROOT/'scripts/extract-srd-class-spells.py'))
class ClassTableTests(unittest.TestCase):
    def test_all_twenty_levels_required_and_columns_cannot_be_swallowed(self):
        rows=['The Fighter','Level Bonus Features']+[str(n)+('st' if n==1 else 'nd' if n==2 else 'rd' if n==3 else 'th')+' +'+str(2+(n-1)//4)+' Feature' for n in range(1,21)]+['Fighting Style','Body']
        text='\n'.join(rows)
        parsed=tables['parse_table'](text,'fighter',0,'Fighting Style')
        self.assertEqual(len(parsed),20);self.assertEqual(parsed[19]['proficiency'],6)
        with self.assertRaises(ValueError):tables['parse_table'](text.replace('19th +6','18th +6'),'fighter',0,'Fighting Style')
        with self.assertRaises(ValueError):tables['parse_table'](text.replace('20th +6','20th +5'),'fighter',0,'Fighting Style')
        with self.assertRaises(ValueError):tables['parse_table'](text,'fighter',10,'Fighting Style')
    def test_spell_lists_join_ids_and_reject_level_mismatch_and_duplicates(self):
        catalog=[{'id':'stable-spell','name':{'en':'Test Spell'},'spell':{'level':1}}]
        text='\n'.join(c+' Spells\n1st Level\nTest Spell' for c in sorted(spells['CLASSES']))
        result=spells['extract']([(105,text)],catalog)
        self.assertEqual(len(result),8);self.assertEqual(result['wizard'][0]['spellId'],'stable-spell')
        with self.assertRaises(ValueError):spells['extract']([(105,text.replace('1st Level','2nd Level',1))],catalog)
        with self.assertRaises(ValueError):spells['extract']([(105,text.replace('Test Spell','Test Spell\nTest Spell',1))],catalog)
        with self.assertRaises(ValueError):spells['extract']([(105,text.replace('Test Spell','Unknown Spell',1))],catalog)
