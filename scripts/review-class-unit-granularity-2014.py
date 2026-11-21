"""Game-design representation proposal for selected class observations; no canonical imports."""
import argparse
import ast
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[1]
MATRIX='catalog/wizard-artificer-source-scopes-2014.json'
WIZARD_TABLE='catalog/wizard-table-concordance-2014.json'
CLASS_SHA='5014af15fd61af05dde5bd29e19514b8fd87fe10ea60fbcd8a81f6574e2053c8'
KIND_MAP={'base-feature':'class-feature-candidate','subclass':'subclass-choice-parent-candidate','subclass-feature':'subclass-feature-candidate','rules-guidance':'supporting-rule-reference-candidate'}
AUX_MAP={'base-rule':'starting-rule-data','choice-index-and-rules':'choice-collection-component','creation-guidance':'reference-guidance','excluded-section-marker':'excluded-boundary-marker','feature-effect-table':'feature-table-component','feature-subrule':'feature-body-component','lore':'reference-lore','multiclass-rule-group':'multiclass-reference','presentation-guidance':'reference-presentation','progression-table':'occurrence-and-progression-reference','section-container':'section-container'}

def sha(raw):return hashlib.sha256(raw).hexdigest()

def model(matrix,table):
 rows=matrix['candidateRows'];ids=[r['candidateReference']['id'] for r in rows]
 if len(ids)!=130 or len(set(ids))!=130 or len(matrix['artificerHeadingRows'])!=23:raise ValueError('Changed selected observation/auxiliary baseline')
 if {r['classSlug'] for r in rows}!={'wizard','artificer'}:raise ValueError('Selected two-class scope changed')
 subclasses={}
 for r in rows:
  c=r['candidateReference']
  if not c['id'].startswith('scope:'+r['classSlug']+':'):raise ValueError('Wrong class observation namespace')
  if c['kind']=='subclass':
   k=(r['classSlug'],c['parent'])
   if k in subclasses:raise ValueError('Ambiguous subclass parent token')
   subclasses[k]=c['id']
 proposal=[]
 for r in rows:
  c=r['candidateReference'];kind=c['kind']
  if kind not in KIND_MAP:raise ValueError('Unknown observation kind cannot become a grant')
  parent=None
  if kind in {'subclass-feature','rules-guidance'}:
   parent=subclasses.get((r['classSlug'],c['parent']))
   if parent is None:raise ValueError('Missing/cross-class selected subclass parent')
  elif kind=='base-feature' and c['parent']!='class-features':raise ValueError('Unknown base-feature parent')
  proposal.append({'sourceObservationId':c['id'],'classGroupKey':r['classSlug'],'observedKind':kind,'titlePreserved':c['title'],
   'sourceClaimsPreserved':{'sourceIds':list(c['sourceIds']),'sourceBasis':c['sourceBasis'],'sourceUrl':c['sourceUrl']},'observedInitialLevelsPreserved':list(c['observedInitialLevels']),'observedParentTokenPreserved':c['parent'],'proposedParentObservationId':parent,
   'proposedRepresentationRole':KIND_MAP[kind],'profileCapabilityCandidate':kind in {'base-feature','subclass-feature'},'automaticallyGrantedByCatalogPresence':False,
   'canonicalId':None,'inclusionStatus':'proposal-awaiting-exact-source-version-rights-and-unit-review'})
 by_id={r['sourceObservationId']:r for r in proposal};aux=[]
 for r in matrix['artificerHeadingRows']:
  kind=r['kind'];parent=r['originalParentFeatureObservationId']
  if kind not in AUX_MAP:raise ValueError('Unknown auxiliary heading kind')
  if parent is not None and (parent not in by_id or by_id[parent]['classGroupKey']!='artificer'):raise ValueError('Auxiliary heading cannot inherit another class parent')
  aux.append({'headingOrdinal':r['headingReference']['ordinal'],'titlePreserved':r['headingReference']['title'],'originalKindPreserved':kind,
              'originalParentObservationIdPreserved':parent,'proposedReferenceRole':AUX_MAP[kind],'countedAsAdditionalCatalogCapability':False,'canonicalId':None})
 asi='scope:wizard:class-features:feature.ASI'
 if asi not in by_id:raise ValueError('Missing existing Wizard ASI observation')
 levels=[r['level'] for r in table['table']['rows'] if 'Ability Score Improvement' in r['featuresEn']]
 if levels!=[4,8,12,16,19]:raise ValueError('Changed already reviewed Wizard ASI occurrence schedule')
 counts=Counter(r['proposedRepresentationRole'] for r in proposal)
 return {'rows':proposal,'auxiliaryArtificerHeadingRows':aux,'sourceIdOrderPreserved':ids,
         'proposedRoleCounts':dict(sorted(counts.items())),
         'occurrenceExample':{'catalogObservationId':asi,'classLevelOccurrences':levels,'catalogEntryCopiesPerOccurrence':False,'choiceOrHistoryInstancesAreSeparateFromCatalogIdentity':True,'importedImprovementsAppliedAgain':False},
         'spellcastingCompositionExample':{'sourceObservationId':'scope:wizard:class-features:feature.spellcasting','bodyParagraphsAutomaticallyBecomeAbilities':False,'tableReferencesAutomaticallyBecomeCapabilities':False,'sourceComponentsRemainAddressable':True}}


def shared_guidance(raw):
 if sha(raw)!=CLASS_SHA:raise ValueError('Changed retained public Wizard HTML')
 spec=importlib.util.spec_from_file_location('granularity_paragraphs',ROOT/'scripts/audit-wizard-candidate-concordance-2014.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
 text=raw.decode('utf-8');start=list(re.finditer(r'<div\b[^>]*class="card__body new-article"[^>]*>',text))
 if len(start)!=1:raise ValueError('Ambiguous class body')
 footer=text.find('<div class="card__footer',start[0].end())
 if footer<0:raise ValueError('Missing class footer')
 article=text[start[0].end():footer];heads=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',article,re.S));ordinal=0;rows=[]
 for i,x in enumerate(heads):
  title=h.visible(x[2])
  if not title:continue
  ordinal+=1
  if ordinal not in [96,102]:continue
  body=article[x.end():heads[i+1].start()];paragraphs=h.Paragraphs().result(body)
  if title!='Дюнамантия для не дюнамантов' or len(paragraphs)!=2:raise ValueError('Changed selected supporting-guidance boundary')
  rows.append({'headingOrdinal':ordinal,'title':title,'bodySha256':sha(h.visible(body).encode()),'paragraphSha256':[sha(p.encode()) for p in paragraphs],'paragraphCount':2})
 if len(rows)!=2 or rows[0]['bodySha256']!=rows[1]['bodySha256']:raise ValueError('Shared-reference proposal requires complete equal secondary bodies')
 return {'secondarySourceUrl':'https://dnd.su/class/105-wizard/','secondarySha256':CLASS_SHA,'retainedHistoricalIdentityNotReplaced':True,'originalHttpReceiptUnavailable':True,'witnesses':rows,'equalSelectedSecondaryBodies':True,
         'proposedRelationship':'two-preserved-parent-specific-observations-may-share-a-reference-view','sourceObservationsMergedOrRemoved':False,'canonicalAliasOrPrimaryBookTextEqualityAccepted':False,'newAutomaticCapabilityCreated':False}


def build(class_raw,root=ROOT):
 matrix=json.loads((root/MATRIX).read_text(encoding='utf-8'));table=json.loads((root/WIZARD_TABLE).read_text(encoding='utf-8'));projection=model(matrix,table)
 code=(root/'server/catalog.mjs').read_text(encoding='utf-8');match=re.search(r'const kinds = (\[[^;]+\]);',code)
 if not match:raise ValueError('Current runtime category schema must be inspected')
 kinds=ast.literal_eval(match[1])
 if kinds!=['mechanic','spell','monster','item','artifact']:raise ValueError('Changed runtime kinds; reassess compatibility')
 return {'schemaVersion':1,'status':'game-design-unit-representation-proposal-not-canonical-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
  'selectedClassGroups':['wizard','artificer'],'projection':projection,'sharedGuidanceProposal':shared_guidance(class_raw),
  'runtimeCompatibility':{'observedExistingKinds':kinds,'proposedRepresentationRolesAreNotAcceptedRuntimeKinds':True,'newClassSpecificSchemaOrMigrationIntroduced':False,'importableCatalogBundle':False},
  'proposedRules':[{'key':'independent-feature-vs-component','proposal':'Named features with their own level/choice/source are candidates; paragraphs, containers, lore and table rows do not automatically become acquired capabilities.'}, {'key':'subclass-choice','proposal':'Subclass is a choice parent; catalog presence does not grant every subclass or child feature.'}, {'key':'repeatable-choice-events','proposal':'An ASI catalog observation can have several class-level occurrences; event/history instances do not duplicate catalog identity or reapply imported choices.'}, {'key':'shared-guidance','proposal':'Keep both original parent/source observations and permit a shared reference view only with bounded evidence; no canonical alias from a repeated title.'}],
  'gameDesignScenarios':[{'case':'wizard-spellcasting-reference','oneFeatureObservationPreserved':True,'twentyOneInventoryParagraphsOrLabelsBecomeTwentyOneCapabilities':False}, {'case':'wizard-asi-four-to-eight','sameCatalogObservation':True,'newPlayerChoiceOccurrence':True,'oldImprovementAutomaticallyReapplied':False}, {'case':'subclass-selection','allThirteenObservedWizardSubclassParentsAutomaticallyGranted':False,'playerChoiceRequired':True}, {'case':'artificer-auxiliary-table','twentyThreeHeadingsAddedAsTwentyThreeCapabilities':False,'parentAndComponentReferencesPreserved':True}, {'case':'manual-class-exception','ordinaryRuleWarningAvailable':True,'manualSaveAllowed':True,'mandatoryGmCheckbox':False}],
  'summary':{'preservedCandidateObservations':130,'classGroupsInSelectedScope':2,'proposedIndependentFeatureObservations':111,'proposedSubclassParentObservations':17,'proposedSupportingGuidanceObservations':2,'preservedAuxiliaryArtificerHeadings':23,'newCapabilitiesCreatedFromAuxiliaryHeadings':0,'canonicalUnitsAccepted':0},
  'm0Boundary':{'purpose':'proposal for the existing #77 unit/version/duplicate/denominator criteria','fullClassTextReviewOfEveryFeatureRequiredByThisProposalForM0':False,'m0OrFullCatalogAccepted':False,'globalCatalogDenominatorEstablished':False,'remainingDecisions':['independent review of proposed unit boundaries','exact publication/version and rights for records','full catalog composition beyond these two selected class groups','owner acceptance of M0']},
  'limits':['Counts are selected observations/proposed representation roles, not accepted units or the whole class catalog.','Existing source IDs/basis/order/parents are preserved, not proven by this proposal.','Observation-to-canonical cardinality is not fixed: version evidence may require splitting, while supporting references may be shared without deleting original observations.','A shared secondary-guidance witness is not proof of primary EGW equality or publication rights.','This is an author game-design proposal, not independent acceptance of the author source audits.','No profile/API/import migration or automatic abilities; manual exceptions remain allowed.'],
  'inputSha256':{name:sha((root/name).read_bytes().replace(b'\r\n',b'\n')) for name in [MATRIX,WIZARD_TABLE]},'upstreamCodeSha256':{name:sha((root/name).read_bytes().replace(b'\r\n',b'\n')) for name in ['server/catalog.mjs','scripts/audit-wizard-candidate-concordance-2014.py']},'generator':{'path':'scripts/review-class-unit-granularity-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))}}

if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--class-html',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args();d=build(a.class_html.read_bytes());a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'));print(json.dumps(d['summary']))
