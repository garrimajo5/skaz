"""Weight auditing uses a source-derived fixture, not regenerated manifest values."""
import copy,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
m=runpy.run_path(str(ROOT/'scripts/audit-srd-gear-tool-weights.py'))
load=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8-sig'))
fixture=load('tests/fixtures/srd51-gear-tool-table-excerpts.json')
class GearToolWeightTests(unittest.TestCase):
    def tables(self):return {k:m['parse_table'](fixture[k],k) for k in ['gear','tools']}
    def check(self,d=None,tables=None):
        return m['audit'](d or load('catalog/srd51-gear-tool-weights-2014.json'),tables or self.tables(),{k:load(f'catalog/{k}-canonical-proposal-2014.json') for k in ['gear','tools']})
    def test_all_source_rows_match(self):
        self.assertEqual(self.check(),134)
        self.assertEqual([len(x) for x in self.tables().values()],[99,35])
    def test_pack_weight_and_fractions_remain_source_values(self):
        t=self.tables()['gear']
        self.assertEqual(t['Crossbow bolts (20)']['weightLb'],1.5)
        self.assertEqual(t['Sling bullets (20)']['weightLb'],1.5)
        self.assertEqual(t['Piton']['weightLb'],0.25)
        self.assertEqual(t['Mirror, steel']['weightLb'],0.5)
        self.assertEqual(t['Ball bearings (bag of 1,000)']['weightLb'],2)
        self.assertEqual(t['Waterskin']['fillState'],'full')
        self.assertEqual(t['Waterskin']['weightLb'],5)
        self.assertEqual(t['Ink (1 ounce bottle)']['weightLb'],None)
    def test_unknown_is_not_zero_and_full_is_not_empty(self):
        for name,key,value in [('Waterskin','fillState','empty'),('Waterskin','sourceWeight','5 lb.'),('Dice set','weightLb',0),('Arrows (20)','weightBasis','per-projectile'),('Crossbow bolts (20)','weightLb',0.075)]:
            d=load('catalog/srd51-gear-tool-weights-2014.json')
            next(r for r in d['records'] if r['nameEn']==name)[key]=value
            with self.subTest(name=name,key=key):
                with self.assertRaisesRegex(ValueError,'Weight metadata mismatch'):self.check(d)
    def test_swapped_or_duplicate_ids_fail(self):
        for duplicate in [True,False]:
            d=load('catalog/srd51-gear-tool-weights-2014.json');a,b=d['records'][:2]
            if duplicate:a['candidateItemId']=b['candidateItemId']
            else:a['candidateItemId'],b['candidateItemId']=b['candidateItemId'],a['candidateItemId']
            with self.assertRaises(ValueError):self.check(d)
    def test_missing_extra_and_misplaced_headings_fail(self):
        cases=[('gear',fixture['gear'].replace('Abacus 2 gp 2 lb. ','')),('gear',fixture['gear'].replace('Abacus 2 gp 2 lb. ','Abacus 2 gp 2 lb. Unknown tool 1 gp 1 lb. ')),('gear',fixture['gear'].replace('Arcane focus ','').replace('Backpack 2 gp','Arcane focus Backpack 2 gp')),('tools',fixture['tools'].replace('Vehicles (land or water) * *','Vehicles (land or water) 0 gp 0 lb.'))]
        for kind,text in cases:
            with self.subTest(kind=kind):
                with self.assertRaises(ValueError):m['parse_table'](text,kind)
    def test_changed_source_name_and_price_do_not_pass(self):
        t=self.tables();value=t['gear'].pop('Abacus');t['gear']['Unknown']=value
        with self.assertRaisesRegex(ValueError,'names differ'):self.check(tables=t)
        t=self.tables();t['gear']['Abacus']['costCp']=1
        with self.assertRaisesRegex(ValueError,'price mismatch'):self.check(tables=t)
    def test_runtime_and_source_drift_fail(self):
        d=load('catalog/srd51-gear-tool-weights-2014.json');d['records'][0]['runtimeImported']=True
        with self.assertRaisesRegex(ValueError,'runtime'):self.check(d)
        d=load('catalog/srd51-gear-tool-weights-2014.json');d['inputSha256']['catalog/gear-canonical-proposal-2014.json']='0'*64
        with self.assertRaisesRegex(ValueError,'input changed'):self.check(d)
    def test_no_transport_row_or_invented_empty_weight(self):
        d=load('catalog/srd51-gear-tool-weights-2014.json')
        self.assertFalse(any('vehicle' in r['candidateItemId'] for r in d['records']))
        self.assertTrue(all(r['weightBasis']=='entire-listed-entry' for r in d['records']))
        self.assertEqual([r['nameEn'] for r in d['records'] if r['fillState']=='full'],['Waterskin'])
        self.assertFalse(d['applicationBoundary']['unknownWeightIsZero'])
        self.assertFalse(d['applicationBoundary']['automaticQuantitySplit'])
if __name__=='__main__':unittest.main()
