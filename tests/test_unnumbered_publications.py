import json,runpy,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];m=runpy.run_path(str(ROOT/'scripts/review-unnumbered-publications-2014.py'))
def inputs():return [json.loads((ROOT/p).read_text(encoding='utf-8')) for p in m['FILES']]
def html():
 cards=[]
 for bid,name,title,slug in m['EXPECTED'].values():cards.append(f'<li class="listing-card-race" data-collapsible-search="{name}|{title}"><a class="listing-card__link" href="/species/{slug}">Details</a></li>')
 cards.append('<li class="listing-card-race" data-collapsible-search="Tortle|Mordenkainen Presents: Monsters of the Multiverse"><a class="listing-card__link" href="/species/1026404-tortle">Details</a></li>')
 return ''.join(cards).encode()
class PublicationTests(unittest.TestCase):
 def test_explicit_non_numeric_refs_work_without_invented_numeric_id(self):
  r=m['review'](*inputs(),html());self.assertEqual(r['summary']['explicitBibliographicRelations'],3);self.assertEqual(r['summary']['preservedExcludedObservations'],72);self.assertEqual(r['summary']['publisherIdentityRecords'],4);self.assertFalse(r['accepted']);self.assertIsNone(r['approvedDenominator']);self.assertTrue(all(x['numericSourceId'] is None and x['observedSourceIds']==[] for x in r['relations']))
 def test_source_title_cannot_replace_explicit_bibliography_id(self):
  a=inputs();next(x for x in a[0]['records'] if x['id']=='dndsu:race:184')['bibliographyEvidenceId']='bibliography:locathah-rising'
  with self.assertRaisesRegex(ValueError,'reference attribution'):m['review'](*a,html())
 def test_numeric_or_excluded_scope_cannot_be_promoted(self):
  for key,value in [('sourceIds',['158']),('inclusion','excluded-homebrew')]:
   a=inputs();next(x for x in a[0]['records'] if x['id']=='dndsu:race:184')[key]=value
   with self.assertRaises(ValueError):m['review'](*a,html())
 def test_duplicate_bibliography_rejected(self):
  a=inputs();a[1]['records'].append(a[1]['records'][0])
  with self.assertRaisesRegex(ValueError,'Duplicate bibliography'):m['review'](*a,html())
 def test_motm_card_cannot_substitute_legacy_tortle(self):
  with self.assertRaisesRegex(ValueError,'publisher identity'):m['review'](*inputs(),html().replace(b'41-tortle',b'1026404-tortle'))
 def test_same_name_different_publication_is_not_equivalence(self):
  r=m['review'](*inputs(),html());self.assertEqual(len([x for x in r['primaryIndex']['records'] if x['name']=='Tortle']),2);self.assertTrue(all(x['fullTextEquivalence']=='unverified' for x in r['relations']))
 def test_changed_plaque_or_translation_permission_fails(self):
  a=inputs();a[3]['secondaryEvidence']['literalPublicationTitle']='MotM'
  with self.assertRaisesRegex(ValueError,'plaque'):m['review'](*a,html())
  a=inputs();a[1]['records'][0]['reusePermission']='CC-BY-4.0'
  with self.assertRaisesRegex(ValueError,'bibliography basis'):m['review'](*a,html())
 def test_committed_report_has_no_false_clearance(self):
  r=json.loads((ROOT/'catalog/unnumbered-publication-relations-2014.json').read_text(encoding='utf-8'));self.assertEqual(r['summary']['acceptedCanonicalUnits'],0);self.assertFalse(r['complete']);self.assertIsNone(r['approvedDenominator'])


class CurrentPolicyTests(unittest.TestCase):
 def test_historical_bibliography_status_never_replaces_effective_policy(self):
  r=m['review'](*inputs(),html());byid={x['observationId']:x for x in r['relations']}
  self.assertEqual(byid['dndsu:race:184']['historicalBibliographyScopeDecision'],'awaiting-game-designer-review')
  self.assertEqual(byid['dndsu:race:184']['currentNamedPublicationDisposition'],'eligible-publication-records-need-review')
  self.assertEqual(byid['dndsu:race:178']['currentNamedPublicationDisposition'],'eligible-publication-records-need-review')
  self.assertEqual(byid['dndsu:race:169']['currentNamedPublicationDisposition'],'needs-official-rules-status-review')
 def test_changed_current_decision_requires_explicit_review(self):
  a=inputs();a[4]['records'][0]['disposition']='eligible-publication-records-need-review'
  with self.assertRaisesRegex(ValueError,'current named policy decision'):m['review'](*a,html())
if __name__=='__main__':unittest.main()
