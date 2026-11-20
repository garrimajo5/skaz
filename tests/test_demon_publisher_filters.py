import hashlib,json,runpy,unittest
from pathlib import Path
from urllib.parse import urlencode
ROOT=Path(__file__).resolve().parents[1];m=runpy.run_path(str(ROOT/'scripts/audit-demon-publisher-filters-2014.py'))
def data():
 policy,prior=[json.loads((ROOT/p).read_text(encoding='utf-8')) for p in m['FILES']];manifest=[];raws={};old={g['name']:g for g in prior['groups']}
 for name in m['NAMES']:
  for book,(value,sid,option_id,label,title) in m['BOOKS'].items():
   source='158' if book=='motm' else '129';r=next(r for r in old[name]['rows'] if r['sourceIdOfPrimaryListing']==source)
   raw=('<select id="filter-source" name="filter-source"><option id="'+option_id+'" value="'+value+'" selected>'+label+'</option></select><ul class="rpgmonster-listing"><div class="monster-name"><a href="'+r['cardUrl'].removeprefix('https://www.dndbeyond.com')+'">'+name+'</a><span class="source">'+r['displayedSource']+'</span></div></ul>').encode()
   url='https://www.dndbeyond.com/monsters?'+urlencode({'filter-search':name,'filter-source':value});raws[name,book]=raw;manifest.append({'name':name,'bookKey':book,'publisherFilterValue':value,'requestedUrl':url,'resolvedUrl':url,'status':200,'sha256':hashlib.sha256(raw).hexdigest()})
 return [policy,prior,manifest,raws]
def rehash(a):
 for r in a[2]:r['sha256']=hashlib.sha256(a[3][r['name'],r['bookKey']]).hexdigest()
class PublisherFilterTests(unittest.TestCase):
 def test_verified_filter_memberships_share_legacy_record_but_not_motm(self):
  r=m['audit'](*data());self.assertEqual(r['summary']['filteredRecordOccurrences'],6);self.assertEqual(r['summary']['uniqueDigitalRecordsInSelectedFilters'],4);self.assertEqual(r['summary']['groupsWithSharedLegacyDigitalRecord'],2);self.assertEqual(r['summary']['groupsWithDistinctMotmDigitalRecord'],2);self.assertFalse(r['accepted']);self.assertIsNone(r['approvedDenominator'])
 def test_mtof_filter_keeps_actual_outa_display_label(self):
  r=m['audit'](*data());rows=[r for r in r['captures'] if r['bookKey']=='mtof'];self.assertTrue(all(r['selectedPublisherLabel']=='Mordenkainen’s Tome of Foes' and r['record']['displayedSource']=='Out of the Abyss' for r in rows));self.assertTrue(all(r['referenceSourceId']=='113' and r['publisherFilterValue']=='33' for r in rows))
 def test_query_url_does_not_prove_a_filter_was_applied(self):
  a=data();a[3]['Juiblex','mtof']=a[3]['Juiblex','mtof'].replace(b' selected',b'');rehash(a)
  with self.assertRaisesRegex(ValueError,'selected book'):m['audit'](*a)
  a=data();a[3]['Juiblex','mtof']=a[3]['Juiblex','mtof'].replace(b'value="33"',b'value="9"');rehash(a)
  with self.assertRaisesRegex(ValueError,'filter not verified'):m['audit'](*a)
 def test_reference_source_id_cannot_replace_provider_filter_value(self):
  a=data();a[2][0]['publisherFilterValue']='129'
  with self.assertRaisesRegex(ValueError,'capture attribution'):m['audit'](*a)
 def test_duplicate_scope_or_wrong_hash_or_redirect_fails(self):
  a=data();a[2][1]=a[2][0]
  with self.assertRaisesRegex(ValueError,'six-filter'):m['audit'](*a)
  a=data();a[3]['Juiblex','oota']+=b'changed'
  with self.assertRaisesRegex(ValueError,'capture attribution'):m['audit'](*a)
  a=data();a[2][0]['resolvedUrl']='https://example.test'
  with self.assertRaisesRegex(ValueError,'capture attribution'):m['audit'](*a)
 def test_distinct_mtof_record_would_not_be_forced_into_shared_identity(self):
  a=data();a[3]['Juiblex','mtof']=a[3]['Juiblex','mtof'].replace(b'17416-juiblex',b'99999-juiblex');rehash(a);r=m['audit'](*a);g=next(g for g in r['groups'] if g['name']=='Juiblex');self.assertFalse(g['sameDigitalRecordObservedUnderOotaAndMtof']);self.assertFalse(g['automaticMerge']);self.assertFalse(g['originalPrintingEquivalenceAccepted'])
 def test_non_listing_name_and_multiple_exact_rows_do_not_make_a_witness(self):
  raw=b'<select id="filter-source" name="filter-source"><option value="9" id="filter-source-out-of-the-abyss" selected>Out of the Abyss</option></select><script>Juiblex</script><ul class="rpgmonster-listing"></ul>'
  with self.assertRaisesRegex(ValueError,'exact-name'):m['extract'](raw,'Juiblex','oota')
  a=data();raw=a[3]['Juiblex','oota'];piece=raw[raw.index(b'<div'):raw.index(b'</div>')+6]
  with self.assertRaisesRegex(ValueError,'exact-name'):m['extract'](raw.replace(b'</ul>',piece+b'</ul>'),'Juiblex','oota')
 def test_digital_reuse_cannot_accept_printed_rules_or_remove_modern_secondary_plaque(self):
  r=json.loads((ROOT/'catalog/demon-publisher-filter-overlap-2014.json').read_text(encoding='utf-8'));self.assertTrue(all(not g['originalPrintedRulesCompared'] and not g['modernSecondaryOotaPlaqueValidated'] and not g['automaticSourceRemoval'] and g['canonicalUnitCountApproved'] is None for g in r['groups']));self.assertFalse(r['referenceSourceIdsChanged']);self.assertFalse(r['runtimeChanged'])
if __name__=='__main__':unittest.main()
