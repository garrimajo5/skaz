import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('granularity',ROOT/'scripts/review-class-unit-granularity-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
def inputs():return [json.loads((ROOT/p).read_text(encoding='utf-8')) for p in [M.MATRIX,M.WIZARD_TABLE]]
def report():return json.loads((ROOT/'catalog/class-unit-granularity-proposal-2014.json').read_text(encoding='utf-8'))
class ClassUnitGranularityTests(unittest.TestCase):
 def test_original_130_observations_order_source_claims_and_levels_preserved(self):
  matrix,table=inputs();before=copy.deepcopy(matrix);p=M.model(matrix,table);self.assertEqual(matrix,before);self.assertEqual(p['sourceIdOrderPreserved'],[r['candidateReference']['id'] for r in matrix['candidateRows']])
  for row,old in zip(p['rows'],matrix['candidateRows']):
   c=old['candidateReference'];self.assertEqual(row['sourceObservationId'],c['id']);self.assertEqual(row['sourceClaimsPreserved'],{k:c[k] for k in ['sourceIds','sourceBasis','sourceUrl']});self.assertEqual(row['observedInitialLevelsPreserved'],c['observedInitialLevels']);self.assertIsNone(row['canonicalId']);self.assertFalse(row['automaticallyGrantedByCatalogPresence'])
 def test_projection_does_not_share_mutable_source_claim_arrays(self):
  matrix,table=inputs();before=copy.deepcopy(matrix);p=M.model(matrix,table);p['rows'][0]['sourceClaimsPreserved']['sourceIds'].append('foreign');self.assertEqual(matrix,before)
 def test_all_subclass_children_resolve_within_their_class(self):
  p=M.model(*inputs());by={r['sourceObservationId']:r for r in p['rows']}
  for row in p['rows']:
   parent=row['proposedParentObservationId']
   if parent is not None:self.assertEqual(by[parent]['classGroupKey'],row['classGroupKey']);self.assertEqual(by[parent]['observedKind'],'subclass')
 def test_unknown_kind_or_cross_class_parent_fails(self):
  for mutation in ['kind','parent','namespace']:
   matrix,table=inputs();target=next(r for r in matrix['candidateRows'] if r['candidateReference']['kind']=='subclass-feature')
   if mutation=='kind':target['candidateReference']['kind']='unknown'
   elif mutation=='parent':target['candidateReference']['parent']='missing-artificer-parent'
   else:target['classSlug']='artificer'
   with self.assertRaises(ValueError):M.model(matrix,table)
 def test_auxiliary_23_are_preserved_components_not_23_extra_grants(self):
  p=M.model(*inputs());self.assertEqual(len(p['auxiliaryArtificerHeadingRows']),23);self.assertTrue(all(not r['countedAsAdditionalCatalogCapability'] and r['canonicalId'] is None for r in p['auxiliaryArtificerHeadingRows']))
 def test_auxiliary_parent_cannot_point_to_wizard(self):
  matrix,table=inputs();target=next(r for r in matrix['artificerHeadingRows'] if r['originalParentFeatureObservationId']);target['originalParentFeatureObservationId']='scope:wizard:class-features:feature.spellcasting'
  with self.assertRaises(ValueError):M.model(matrix,table)
 def test_asi_level_occurrences_are_not_five_catalog_copies_or_reapplication(self):
  x=M.model(*inputs())['occurrenceExample'];self.assertEqual(x['classLevelOccurrences'],[4,8,12,16,19]);self.assertFalse(x['catalogEntryCopiesPerOccurrence'] or x['importedImprovementsAppliedAgain'])
 def test_shared_guidance_keeps_two_parents_and_no_canonical_alias(self):
  d=report();g=d['sharedGuidanceProposal'];self.assertEqual([x['headingOrdinal'] for x in g['witnesses']],[96,102]);self.assertEqual(len({x['bodySha256'] for x in g['witnesses']}),1);self.assertFalse(g['sourceObservationsMergedOrRemoved'] or g['canonicalAliasOrPrimaryBookTextEqualityAccepted'] or g['newAutomaticCapabilityCreated'])
 def test_changed_secondary_guidance_source_is_not_same_name_proof(self):
  with self.assertRaises(ValueError):M.shared_guidance(b'<p>same title only</p>')
 def test_representation_counts_are_not_runtime_import_kinds_or_global_denominator(self):
  d=report();self.assertEqual(d['projection']['proposedRoleCounts'],{'class-feature-candidate':21,'subclass-choice-parent-candidate':17,'subclass-feature-candidate':90,'supporting-rule-reference-candidate':2});self.assertFalse(d['runtimeCompatibility']['importableCatalogBundle'] or d['runtimeCompatibility']['newClassSpecificSchemaOrMigrationIntroduced']);self.assertTrue(d['runtimeCompatibility']['proposedRepresentationRolesAreNotAcceptedRuntimeKinds']);self.assertIsNone(d['approvedDenominator']);self.assertFalse(d['m0Boundary']['m0OrFullCatalogAccepted'])
 def test_inputs_code_pins_and_bounded_status(self):
  d=report()
  for path,digest in {**d['inputSha256'],**d['upstreamCodeSha256']}.items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
  self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')));self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertEqual(d['summary']['canonicalUnitsAccepted'],0)
if __name__=='__main__':unittest.main()
