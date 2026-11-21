import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('class_toc',ROOT/'scripts/audit-class-multisource-toc-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def fixture(key):
 b=M.BOOKS[key];heads=('<h1>'+b['title']+'</h1>')*(2 if key=='tcoe' else 1);links=''.join('<a href="'+href+'">'+M.LABELS[slug][key]+'</a>' for slug,href in b['links'].items());links+=''.join('<a href="/sources/tcoe/dungeon-masters-tools#'+label+'">'+label+'</a>' for label in M.SIDEKICKS) if key=='tcoe' else '';return (heads+'<div class="compendium-toc-full-text">'+links+'</div>').encode()
def report():return json.loads((ROOT/'catalog/class-multisource-toc-2014.json').read_text(encoding='utf-8'))
class PublisherClassTocTests(unittest.TestCase):
 def test_three_bounded_tocs_select_eight_family_and_three_sidekick_links(self):
  self.assertEqual(sum(len(M.parse_toc(fixture(key),key)) for key in M.BOOKS),11)
 def test_publisher_heading_echo_is_pinned_not_first_h1_heuristic(self):
  raw=fixture('tcoe');self.assertEqual(len(M.parse_toc(raw,'tcoe')),7)
  for changed in [raw.replace(('<h1>'+M.BOOKS['tcoe']['title']+'</h1>').encode(),b'',1),raw+b'<h1>Different book</h1>']:
   with self.assertRaises(ValueError):M.parse_toc(changed,'tcoe')
 def test_link_outside_toc_cannot_substitute_for_missing_inside_link(self):
  raw=fixture('moot');target=b'<a href="/sources/moot/character-creation#BardCollegeofEloquence">Bard: College of Eloquence</a>';raw=raw.replace(target,b'')+target
  with self.assertRaises(ValueError):M.parse_toc(raw,'moot')
 def test_duplicate_toc_or_selected_link_rejected(self):
  for raw in [fixture('ggtr')+fixture('ggtr'),fixture('ggtr').replace(b'</div>',b'<a href="https://www.dndbeyond.com/compendium/rules/ggtr/character-creation#ClericOrderDomain">Cleric: Order Domain</a></div>')]:
   with self.assertRaises(ValueError):M.parse_toc(raw,'ggtr')
 def test_changed_source_path_label_or_fragment_cannot_be_name_only_witness(self):
  raw=fixture('moot')
  for changed in [raw.replace(b'/sources/moot/',b'/sources/tcoe/'),raw.replace(b'#BardCollegeofEloquence',b'#Other'),raw.replace(b'Bard: College of Eloquence',b'Other')]:
   with self.assertRaises(ValueError):M.parse_toc(changed,'moot')
 def test_index_receipt_cannot_approve_unknown_raw_bytes(self):
  row=report()['sources'][0]['capture']
  with self.assertRaises(ValueError):M.verified_receipt(row,b'unretained html','tcoe')
 def test_chapter_status200_and_redirect_are_not_complete_rule_or_proven_paywall(self):
  for row in report()['chapterAttempts']:
   self.assertEqual(row['status'],200);self.assertTrue(row['headersObserved']);self.assertFalse(row['fullBodyRetained'] or row['primarySubclassRulesCompared'] or row['accessBarrierProvedToBePaywall']);self.assertEqual(row['errorType'],'TimeoutError');self.assertFalse(row['retried'])
 def test_chapter_attempt_cannot_be_promoted_to_body_or_wrong_target(self):
  row={**report()['chapterAttempts'][0],'bodyFile':None,'bytes':None,'sha256':None};requested=row['requestedUrl'];final=row['finalUrl']
  M.chapter_boundary(row,requested,final)
  for change in [{'bodyFile':'fake.html'},{'outcome':'complete'},{'sha256':'0'*64},{'finalUrl':'https://example.com'}]:
   with self.assertRaises(ValueError):M.chapter_boundary({**row,**change},requested,final)
 def test_four_families_preserve28ids_order_and_unsettled_versions(self):
  d=report();units=json.loads((ROOT/M.UNITS).read_text(encoding='utf-8'));self.assertEqual(len(d['familyWitnesses']),4)
  for row,old in zip(d['familyWitnesses'],units['versionDecisionGroups']):
   self.assertEqual(row['memberObservationIds'],old['memberObservationIds']);self.assertEqual(row['originalSourceIdsPreserved'],old['sourceIds']);self.assertTrue(row['primaryIndexPresenceForBothSources']);self.assertFalse(row['fullRuleEqualityAccepted'] or row['canonicalAliasAccepted']);self.assertIsNone(row['canonicalVersionCount'])
 def test_three_sidekicks_are_reference_presence_not_automatically_playable_classes(self):
  rows=report()['sidekickReferenceWitnesses'];self.assertEqual(len(rows),3)
  for row in rows:self.assertTrue(row['referencePresenceVerified']);self.assertFalse(row['playerClassAutomaticallyAdded'] or row['fullRulesOrCanonicalUnitAccepted']);self.assertEqual(row['originalDiscoveryObservation']['url'],row['publisherTocLink']['secondaryClassUrl'])
 def test_bounded_guide_intro_excludes_comments_and_keeps_whole_selected_paragraphs(self):
  raw=('<p>outside</p><section class="p-article-content u-typography-format">'+''.join('<p>scope'+str(i)+'</p>' for i in range(10))+'<h2>next</h2><p>not selected</p></section><p>comment</p>').encode()
  rows=M.sidekick_intro(raw);self.assertEqual([r['paragraphIndex'] for r in rows],[7,8]);self.assertEqual(rows[0]['wholeParagraphSha256'],M.sha(b'scope7'))
  for changed in [raw.replace(b'<p>scope0</p>',b''),raw.replace(b'</section>',b''),raw+raw]:
   with self.assertRaises(ValueError):M.sidekick_intro(changed)
 def test_editorial_context_cannot_be_rulebook_or_automatic_level_cap(self):
  g=report()['sidekickVersionContext'];f=g['manualAssessments'];self.assertEqual(g['sourceKind'],'publisher-platform-editorial-guide-not-rulebook');self.assertIsNone(g['numericRulebookSourceId']);self.assertIsNone(f['tceMaximumLevelProvedBySelectedParagraphs']);self.assertFalse(g['wholeGuideRulesAccepted'] or f['earlierLevelSixCapAutomaticallyInheritedByTce'] or f['manualCharacterChoiceForbidden']);self.assertTrue(f['sidekicksMayBePlayedAsHeroesNotOnlyDmControlledNpcs'])
 def test_wrong_guide_bytes_cannot_inherit_editorial_scope(self):
  with self.assertRaises(ValueError):M.sidekick_version_context(b'unknown guide',report()['sidekickVersionContext']['capture'])
 def test_input_capture_tool_generator_pins_and_bounded_summary(self):
  d=report()
  for path,digest in {**d['inputSha256'],**d['upstreamCaptureToolSha256']}.items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
  self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')));self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertEqual(d['summary']['completeSubclassComparisons'],0);self.assertIsNone(d['approvedDenominator'])
if __name__=='__main__':unittest.main()
