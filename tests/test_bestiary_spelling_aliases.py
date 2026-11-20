import unittest
import runpy
import copy
import json
from pathlib import Path
m=runpy.run_path(str(Path(__file__).resolve().parent.parent/'scripts/review-bestiary-spelling-aliases.py'))
def fixture():
 review={'identityGroups':[]};policy={'records':[]};raws={}
 for key,(published,reason,books) in m['SPECS'].items():
  review['identityGroups'].append({'reviewId':'test:'+key,'section':'bestiary','comparisonKey':key,'decision':'define-separate-source-version-units','members':[{'id':'synthetic:'+book+':'+key,'sourceIds':[m['shared']['BOOKS'][book][0]],'observedName':key.title()} for book in books]})
 for book,(source_id,title) in m['shared']['BOOKS'].items():
  policy['records'].append({'sourceId':source_id,'observedTitle':m['POLICY_TITLES'][source_id],'disposition':'eligible-publication-records-need-review'})
  names=[published for observed,(published,reason,books) in m['SPECS'].items() if book in books and not(book=='vgtm' and observed=='deep rothe')]
  html='<h1>'+title+'</h1>'+''.join('<a href="/sources/'+book+'/bestiary#Test">'+name.title()+'</a>' for name in names)+'<p>Do not copy rule bodies.</p>'
  raws[book]=html.encode()
 return review,policy,raws
class AliasTests(unittest.TestCase):
 def test_explicit_proposals_preserve_four_observations_without_approval(self):
  data=fixture();before=copy.deepcopy(data);r=m['build'](*data)
  self.assertEqual(r['summary'],{'consideredGroups':2,'preservedObservations':4,'publishedSpellingWitnesses':3,'completeProposedRelations':1,'incompleteGroups':1,'acceptedAliases':0})
  self.assertEqual(data,before);self.assertIsNone(r['approvedDenominator']);self.assertFalse(r['complete']);self.assertNotIn('rule bodies',json.dumps(r))
  self.assertTrue(all(not u['accepted'] and not u['automaticAlias'] and u['canonicalId'] is None for g in r['groups'] for u in g['units']))
 def test_other_book_does_not_fill_missing_volo_witness(self):
  r=m['build'](*fixture());deep=next(g for g in r['groups'] if g['observedKey']=='deep rothe');self.assertIsNone(deep['units'][0]['proposedAlias']);self.assertIsNotNone(deep['units'][1]['proposedAlias'])
 def test_changed_original_name_source_or_policy_fails(self):
  for mutation in ['name','source','policy']:
   data=fixture()
   if mutation=='name':data[0]['identityGroups'][0]['members'][0]['observedName']='Different creature'
   if mutation=='source':data[0]['identityGroups'][0]['members'][0]['sourceIds']=['111']
   if mutation=='policy':next(p for p in data[1]['records'] if p['sourceId']=='113')['disposition']='excluded'
   with self.subTest(mutation=mutation),self.assertRaises(ValueError):m['build'](*data)
 def test_missing_published_spelling_is_not_normalized_back_to_the_observed_name(self):
  data=fixture();data[2]['mtof']=data[2]['mtof'].replace('Kith’Rak'.encode(),"Kith'Rak".encode());r=m['build'](*data);self.assertEqual(r['summary']['completeProposedRelations'],0)
 def test_wrong_publication_heading_and_foreign_target_are_rejected(self):
  data=fixture();data[2]['mtof']=data[2]['mtof'].replace(b"Mordenkainen's Tome of Foes",b'Wrong publication')
  with self.assertRaises(ValueError):m['build'](*data)
  data=fixture();data[2]['mtof']=data[2]['mtof'].replace(b'/sources/mtof/bestiary#Test',b'https://untrusted.invalid/sources/mtof/bestiary#Test')
  with self.assertRaises(ValueError):m['build'](*data)
if __name__=='__main__':unittest.main()
