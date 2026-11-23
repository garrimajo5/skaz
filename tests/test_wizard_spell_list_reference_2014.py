import copy
import html
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('wizard_list',ROOT/'scripts/audit-wizard-spell-list-reference-2014.py')
M=importlib.util.module_from_spec(spec);spec.loader.exec_module(M)
REPORT=ROOT/'catalog/wizard-spell-list-reference-2014.json'

def data():return json.loads(REPORT.read_text(encoding='utf-8'))

def pages():
 out={n:f'System Reference Document 5.1 {n}\n' for n in [111,112,113,114]}
 out[111]+='Warlock-only previous entry\nWizard Spells\n'
 last=None
 for r in data()['primaryScope']['entries']:
  if r['spellLevel']!=last:
   last=r['spellLevel'];out[r['pdfPage']]+=('Cantrips (0 Level)' if last==0 else f'{last}'+{1:'st',2:'nd',3:'rd'}.get(last,'th')+' Level')+'\n'
  out[r['pdfPage']]+=r['name'].replace('Control Weather','Control Weathe\nr')+'\n'
 out[114]+='Spell Descriptions\nAcid Arrow\nnot-list prose'
 return out


def card(name='Augury',classes='бард<sup>TCE</sup>, волшебник',ident='40',plaques='<span class="source-plaque" title="PHB">PH14</span>',level='2 уровень, прорицание'):
 return f'<div class="card" data-id="spells:{ident}" data-cardlink="/spells/{ident}-example/"><div><h2 class="card-title"><a class="item-link" href="/spells/{ident}-example/">Название [{name}]</a>{plaques}</h2><ul><li>{level}</li><li><strong>Классы:</strong> {classes}</li></ul></div></div>'


def page(body,query='',disable=False,provider=21,href='/spells/?search=&class=21&page=14',current=1):
 options=json.dumps([{'title':'','list':[{'value':21,'title':'Волшебник'}]}],ensure_ascii=False)
 return (f'<input name="class" value="[&quot;{provider}&quot;]" data-list="{html.escape(options,quote=True)}"><input name="search" value="{query}"><input name="disableTasha" value="1" '+('checked' if disable else '')+'>'+body+f'<ul class="pagination"><li class="current"><a href="/spells/?search=&class=21&page={current}">current</a></li><li><a href="{href}">last</a></li></ul>').encode()


class WizardListReferenceTests(unittest.TestCase):
 def test_complete_selected_list_has_204_names_and_ten_levels(self):
  rows=M.primary_list(pages());self.assertEqual(len(rows),204);self.assertEqual(rows,data()['primaryScope']['entries']);self.assertNotIn('Warlock-only previous entry',[r['name'] for r in rows])
 def test_missing_continuation_or_stop_page_fails(self):
  for n in [112,113,114]:
   p=pages();del p[n]
   with self.assertRaises(ValueError):M.primary_list(p)
 def test_truncated_terminal_name_fails(self):
  p=pages();p[113]=p[113].replace('Wish\n','')
  with self.assertRaises(ValueError):M.primary_list(p)
 def test_changed_next_page_heading_fails(self):
  p=pages();p[114]=p[114].replace('Spell Descriptions','Another list')
  with self.assertRaises(ValueError):M.primary_list(p)
 def test_unverified_weather_split_is_not_generically_joined(self):
  p=pages();p[113]=p[113].replace('Control Weathe\nr','Control Weath\ner')
  with self.assertRaises(ValueError):M.primary_list(p)
 def test_reordered_or_duplicate_level_heading_fails(self):
  p=pages();p[112]=p[112].replace('2nd Level','1st Level')
  with self.assertRaises(ValueError):M.primary_list(p)
 def test_tce_superscript_belongs_only_to_preceding_class(self):
  rows,_=M.list_page(page(card()),1);self.assertEqual(rows[0]['wizardMarkers'],[]);self.assertEqual(rows[0]['classes'][0]['markers'],['TCE'])
  rows,_=M.list_page(page(card(classes='волшебник<sup><span>TCE</span></sup>, жрец')),1);self.assertEqual(rows[0]['wizardMarkers'],['TCE'])
 def test_multiple_legacy_books_and_adjacent_other_version_stay_separate(self):
  plaques='<span class="source-plaque" title="SCAG">SCAG</span><span class="source-plaque" title="TCE">TCE</span><a class="source-plaque" href="https://next.dnd.su/spells/99-new/" title="PH2024">PH24</a>'
  rows,_=M.list_page(page(card(plaques=plaques)),1);r=rows[0]
  self.assertEqual([s['text'] for s in r['legacySourcePlaques']],['SCAG','TCE']);self.assertEqual(r['adjacentOtherVersionLinks'][0]['text'],'PH24');self.assertIsNone(r['canonicalCatalogId']);self.assertFalse(r['wholeSpellRulesCompared'])
 def test_wrong_reflected_filter_or_optional_toggle_fails(self):
  for raw in [page(card(),provider=12),page(card(),disable=True)]:
   with self.assertRaises(ValueError):M.list_page(raw,1)
 def test_foreign_or_changed_pagination_fails(self):
  for href in ['https://evil.example/spells/?search=&class=21&page=14','/spells/?search=&class=12&page=14','/spells/?search=&class=21&page=13']:
   with self.assertRaises(ValueError):M.list_page(page(card(),href=href),1)
 def test_current_page_must_match_requested_page(self):
  with self.assertRaises(ValueError):M.list_page(page(card(),current=2),1)
 def test_observed_page_count_is_not_fabricated_as_25(self):
  rows,_=M.list_page(page(card()),1);self.assertEqual(len(rows),1)
 def test_truncated_card_fails_instead_of_dropping_it(self):
  with self.assertRaises(ValueError):M.list_page(page(card()[:-6]),1)
 def test_identity_namespace_and_level_are_required(self):
  for raw in [card().replace('data-id="spells:40"','data-id="items:40"'),card(level='unknown level')]:
   with self.assertRaises(ValueError):M.list_page(page(raw),1)
 def test_name_correspondence_is_explicit_not_full_text_equality(self):
  primary=[{'name':'Black Tentacles','spellLevel':4}];secondary=[{'nameEn':"Evard's black tentacles",'spellLevel':4,'sourceObservationId':'spells:77','wizardMarkers':[]}]
  result=M.compare(primary,secondary);self.assertEqual(len(result['matches']),1);self.assertFalse(result['matches'][0]['fullRulesEquivalent']);self.assertTrue(result['matches'][0]['comparisonKind'].startswith('selected-eponym'))
 def test_duplicate_english_name_or_wrong_circle_needs_review(self):
  primary=[{'name':'Blur','spellLevel':2}];r={'nameEn':'Blur','spellLevel':2,'sourceObservationId':'spells:295','wizardMarkers':[]}
  with self.assertRaises(ValueError):M.compare(primary,[r,{**r,'sourceObservationId':'spells:999'}])
  with self.assertRaises(ValueError):M.compare(primary,[{**r,'spellLevel':3}])
 def test_substring_search_hit_does_not_substitute_for_target(self):
  result=M.compare([{'name':'Find Familiar','spellLevel':1}],[{'nameEn':'Flock of Familiars','spellLevel':3,'sourceObservationId':'spells:3847','wizardMarkers':[]}]);self.assertEqual(len(result['primaryNamesNotObserved']),1)
 def test_pagination_omissions_are_corroborated_not_declared_missing(self):
  d=data();self.assertEqual(d['summary']['nameLevelCorrespondences'],198);self.assertEqual(d['summary']['primaryNamesNotObserved'],6)
  targets=d['targetedControlEvidence']['targetedPaginationAbsences'];self.assertEqual({r['exactMatchedObservation']['sourceObservationId'] for r in targets},{'spells:248','spells:295','spells:183','spells:136','spells:126','spells:95'});self.assertEqual(d['summary']['primaryNamesAccountedForWithTargetedControls'],204)
 def test_optional_control_is_class_membership_not_book_rejection(self):
  d=data();a=d['targetedControlEvidence']['auguryTceControl'];self.assertEqual(a['enabledObservation']['legacySourcePlaques'][0]['text'],'PH14');self.assertEqual(a['enabledObservation']['wizardMarkers'],['TCE']);self.assertEqual(a['disabledReturnedObservationIds'],[]);self.assertFalse(a['primaryTceFullRuleVerified'])
 def test_all_preserved_observations_and_captures_are_bounded(self):
  d=data();rs=d['secondaryScope']['entries'];self.assertEqual(len(rs),333);self.assertEqual(len({r['sourceObservationId'] for r in rs}),333);self.assertEqual(sum(d['secondaryScope']['observedPageCounts']),333)
  self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged'] or d['secondaryScope']['completeSecondaryClassListAccepted']);self.assertIsNone(d['approvedDenominator']);self.assertEqual(d['summary']['canonicalUnitsAccepted'],0)
  for r in d['sources']['secondaryListCaptures']:self.assertEqual(r['sha256'],M.SECONDARY_SHAS[r['listPage']]);self.assertEqual(r['status'],200);self.assertFalse(r['retried'])
 def test_generator_sha_matches_current_report(self):
  d=data();self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))

if __name__=='__main__':unittest.main()
