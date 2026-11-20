import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-fiendish-folio-tables.py'))
load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
# Independent transcription from the two visible tables on printed page2.
TRANSCRIPT='''Assassin Bug|4|3
Blindheim|5|2
Crab Folk|6|3
Dire Corby|7|1/2
Eye of Fear and Flame|8|9
Forlarren|9|3
Giant, Fog|10|11
Jermlaine|11|1/8
Khargra|12|1/8
Killmoulis|13|0
Mite|14|1/4
Needlefolk|15|1/2
Needle Lord|16|3
Norker|17|1/2
Norker War Leader|17|3
Screaming Devilkin|19|1
Ygorl|20|23
Xill|21|3'''
def fixture():
    rows=[line.split('|') for line in TRANSCRIPT.splitlines()]
    return 'ContentsContents '+''.join(f'{n} ... {p} ' for n,p,c in rows)+'Monsters by Challenge Rating Monster CR '+''.join(f'{n} ... {c} ' for n,p,c in rows)+'Sample file'
class FolioTableTests(unittest.TestCase):
    def setUp(self):
        self.d=load('catalog/fiendish-folio-version-evidence-2014.json');self.i=load('catalog/fiendish-folio-inventory-2014.json');self.rows=m['parse_tables'](fixture())
    def test_all_eighteen_rows_match(self):self.assertEqual(m['audit'](self.d,self.rows,self.i),18)
    def test_cr_is_not_page_and_fraction_is_not_zero(self):
        self.assertEqual(next(r for r in self.rows if r['name']=='Khargra'),{'name':'Khargra','printedPage':12,'challengeRating':'1/8'})
        d=copy.deepcopy(self.d);d['printEvidence']['rows'][8]['challengeRating']='0'
        with self.assertRaises(ValueError):m['audit'](d,self.rows,self.i)
    def test_extra_missing_and_duplicate_rows_rejected(self):
        for changed in [fixture().replace('Xill ... 3 ','Extra ... 2 Xill ... 3 '),fixture().replace('Xill ... 3 ',''),fixture().replace('Xill ... 3 ','Mite ... 3 ')]:
            with self.assertRaises(ValueError):m['parse_tables'](changed)
    def test_unclear_boundary_and_leftover_rejected(self):
        for changed in [fixture()+'Sample file',fixture().replace('ContentsContents','Contents'),fixture().replace('Xill ... 21 ','Xill ... 21 Unexpected ')]:
            with self.assertRaises(ValueError):m['parse_tables'](changed)
    def test_reordering_or_reassigning_identity_rejected(self):
        d=copy.deepcopy(self.d);d['printEvidence']['rows'][0]['unitId']=d['printEvidence']['rows'][1]['unitId']
        with self.assertRaises(ValueError):m['audit'](d,self.rows,self.i)
        changed=fixture().replace('Assassin Bug ... 3 Blindheim ... 2','Blindheim ... 2 Assassin Bug ... 3')
        with self.assertRaises(ValueError):m['parse_tables'](changed)
    def test_no_acceptance_from_equal_cr_or_staff_count(self):
        for path in [('accepted',),('complete',),('countEvidence','printDigitalDifferenceResolved'),('countEvidence','automaticDeletion'),('needleEvidence','identityConfirmed'),('needleEvidence','automaticRename')]:
            d=copy.deepcopy(self.d);target=d
            for k in path[:-1]:target=target[k]
            target[path[-1]]=True
            with self.assertRaises(ValueError):m['audit'](d,self.rows,self.i)
