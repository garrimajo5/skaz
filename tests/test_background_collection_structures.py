import hashlib,json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];m=runpy.run_path(str(ROOT/'scripts/audit-background-collection-structures-2014.py'))
def data():
 scope,prior,selection=[json.loads((ROOT/p).read_text(encoding='utf-8')) for p in m['FILES']];manifest=[];raws={};props={r['observationId']:r for r in prior['records']}
 for s in selection['records']:
  ident=s['observationId'];url=props[ident]['referenceEvidence']['url'];hs=''.join('<'+h['level']+'>'+h['text']+'</'+h['level']+'>' for h in s['expectedHeadings'])
  raw=('<meta property="og:url" content="'+url+'"><h2>navigation decoy</h2><div class="card" data-id="'+ident.removeprefix('dndsu:')+'"><div class="card__body new-article">'+hs+'<div id="comments"><h3>comment decoy</h3></div><script>fake heading</script></div></div>').encode();raws[ident]=raw;manifest.append({'observationId':ident,'requestedUrl':url,'resolvedUrl':url,'status':200,'file':ident.split(':')[-1]+'.html','sha256':hashlib.sha256(raw).hexdigest()})
 return [scope,prior,selection,manifest,raws]
class CollectionTests(unittest.TestCase):
 def test_five_structures_not_five_accepted_backgrounds(self):
  r=m['audit'](*data());self.assertEqual(r['summary']['selectedHeadings'],23);self.assertEqual(r['summary']['acceptedStandaloneBackgrounds'],0);self.assertFalse(r['complete']);self.assertIsNone(r['approvedDenominator']);self.assertTrue(all(x['observedEnglishName']=='' and not x['automaticProfileChange'] for x in r['records']))
 def test_comments_navigation_script_not_collection_headings(self):
  r=m['audit'](*data());self.assertFalse(any('decoy' in h['text'] for x in r['records'] for h in x['headings']))
 def test_same_name_wrong_observation_card_fails(self):
  a=data();ident=a[3][0]['observationId'];a[-1][ident]=a[-1][ident].replace(b'data-id="backgrounds:845"',b'data-id="backgrounds:999"');a[3][0]['sha256']=hashlib.sha256(a[-1][ident]).hexdigest()
  with self.assertRaisesRegex(ValueError,'exact observation'):m['audit'](*a)
 def test_hash_or_redirect_does_not_count_as_content(self):
  a=data();a[3][0]['resolvedUrl']='https://example.test/login'
  with self.assertRaisesRegex(ValueError,'capture'):m['audit'](*a)
  a=data();a[-1][a[3][0]['observationId']]+=b'changed'
  with self.assertRaisesRegex(ValueError,'capture'):m['audit'](*a)
 def test_changed_source_or_invented_english_name_fails(self):
  a=data();ident=a[3][0]['observationId'];next(r for r in a[0]['records'] if r['id']==ident)['sourceIds']=['102']
  with self.assertRaisesRegex(ValueError,'attribution'):m['audit'](*a)
  a=data();a[1]['records'][0]['observedEnglishName']='Invented Background'
  with self.assertRaisesRegex(ValueError,'attribution'):m['audit'](*a)
 def test_repeated_id_or_lost_component_heading_fails(self):
  a=data();a[3][1]=a[3][0]
  with self.assertRaisesRegex(ValueError,'scope'):m['audit'](*a)
  a=data();ident=a[3][0]['observationId'];a[-1][ident]=a[-1][ident].replace('<h2>Наследник</h2>'.encode(),b'');a[3][0]['sha256']=hashlib.sha256(a[-1][ident]).hexdigest()
  with self.assertRaisesRegex(ValueError,'structure'):m['audit'](*a)
 def test_prior_proposal_cannot_grant_profile_features(self):
  a=data();a[1]['records'][0]['automaticProfileChange']=True
  with self.assertRaisesRegex(ValueError,'promoted'):m['audit'](*a)
 def test_committed_report_retains_pending_semantic_review(self):
  r=json.loads((ROOT/'catalog/background-collection-structures-2014.json').read_text(encoding='utf-8'));self.assertEqual(r['summary']['referencePages'],5);self.assertFalse(r['accepted']);self.assertTrue(all(not x['fullPrimarySectionRead'] for x in r['records']))
if __name__=='__main__':unittest.main()
