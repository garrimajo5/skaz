import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('errata',ROOT/'scripts/audit-artificer-errata-scopes-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
CONTENTS='Fixture branch: If an infusion ends; the fixture contains other things, like a bag of holding. Its contents harmlessly appear in and around its space.'
SHOT='In the second paragraph the first sentence: If the weapon lacks ammunition, it creates one piece of magic ammunition when the wielder makes a ranged attack with it.'
def report():return json.loads((ROOT/'catalog/artificer-errata-scopes-2014.json').read_text(encoding='utf-8'))

class ArtificerErrataScopesTest(unittest.TestCase):
    def test_next_repeated_heading_is_only_a_boundary_not_another_clause(self):
        value,w=M.selected('Start (p. 1). Included clause. Next (p. 2). Other clause. Next (p. 2).','Start (p. 1).','Next (p. 2).')
        self.assertEqual(value,'Included clause.');self.assertEqual(w['boundaryStop'],'first-next-heading')
    def test_missing_or_duplicate_start_or_missing_stop_is_rejected(self):
        for text in ['Start. A Start. B Stop.','Start. A','Other. A Stop.']:
            with self.assertRaises(ValueError):M.selected(text,'Start.','Stop.')
    def test_only_visually_checked_wraps_are_repaired(self):
        text,w=M.selected('Start. with arti- san’s tools; automat- ically; un- selected. Stop.','Start.','Stop.')
        self.assertIn('artisan’s',text);self.assertIn('automatically',text);self.assertIn('un- selected',text);self.assertEqual(w['layoutRepairs'],{'verifiedArtisanWrap':1,'verifiedAutomaticallyWrap':1})
        with self.assertRaises(ValueError):M.selected('Start. arti- san’s arti- san’s Stop.','Start.','Stop.')
    def test_contents_are_preserved_on_infusion_end_not_other_destruction(self):
        f=M.ordinary_facts('infused-container-contents',CONTENTS);self.assertEqual(f['trigger'],'infusion-ends-on-item-containing-other-things');self.assertIn('harmlessly',f['ordinaryOutcome']);self.assertTrue(f['bagOfHoldingIsExampleNotOnlyContainer']);self.assertFalse(f['itemDestroyedOrOtherExtradimensionalEventsCovered'])
    def test_changed_contents_trigger_safety_or_example_condition_is_rejected(self):
        for a,b in [('If an infusion ends','If an item is destroyed'),('harmlessly appear','are destroyed'),('like a bag of holding','only a bag of holding')]:
            with self.assertRaises(ValueError):M.ordinary_facts('infused-container-contents',CONTENTS.replace(a,b))
    def test_repeating_shot_needs_missing_ammunition_and_actual_attack(self):
        f=M.ordinary_facts('repeating-shot-ammunition',SHOT);self.assertEqual(f['producedMagicAmmunitionPerTrigger'],1);self.assertFalse(f['unconditionalStockpileGranted'])
        for a,b in [('If the weapon lacks ammunition','Whenever equipped'),('when the wielder makes a ranged attack with it','at any time')]:
            with self.assertRaises(ValueError):M.ordinary_facts('repeating-shot-ammunition',SHOT.replace(a,b))
    def test_material_clarification_does_not_remove_cost_or_change_other_class(self):
        f=M.ordinary_facts('tools-material-clarification','Text added to second sentence: ‘M’ component when you cast it.');self.assertTrue(f['patchClarifiesMaterialComponentWhenCastingThroughThisFeature'])
        self.assertFalse(f['otherClassSpellsChanged']);self.assertFalse(f['costlyOrConsumedMaterialExceptionInferred']);self.assertFalse(f['completeToolsRequiredVerified'])
    def test_ritual_list_marker_does_not_prepare_spell_or_grant_wizard_book_entry(self):
        f=M.ordinary_facts('purify-ritual-tag','After purify food and drink, “(ritual)” has been added.');self.assertTrue(f['artificerListRitualMarkerAdded']);self.assertFalse(f['spellAutomaticallyPreparedOrWizardBookGranted']);self.assertFalse(f['completeArtificerRitualRuleVerified'])
    def test_adjacent_clause_cannot_supply_a_missing_selected_condition(self):
        selected,_=M.selected('Start. Incomplete condition. Stop. '+CONTENTS,'Start.','Stop.')
        with self.assertRaises(ValueError):M.ordinary_facts('infused-container-contents',selected)
    def test_book119_patch_never_implicitly_accepts_candidate117(self):
        d=report();e=[r for r in d['records'] if r['historicalBookSourceId']=='119'];self.assertEqual(len(e),4)
        self.assertTrue(all(r['candidateOriginalSourceClaims']==['117'] and not r['appliesToCandidatePublicationVerified'] for r in e))
        self.assertTrue(all(not r['appliesToCandidatePublicationVerified'] for r in d['records']))
    def test_six_scopes_preserve_versions_no_whole_class_or_runtime(self):
        d=report();self.assertEqual(len(d['records']),6);self.assertEqual(d['sources']['eberron-errata.pdf']['errataVersion'],'2.0');self.assertEqual(d['sources']['tasha-errata.pdf']['errataVersion'],'1.0')
        self.assertEqual(d['summary']['wholeBaseFeaturesAccepted'],0);self.assertFalse(d['runtimeChanged']);self.assertFalse(d['acceptedForRuntime']);self.assertIsNone(d['approvedDenominator'])
    def test_synthetic_events_do_not_convert_item_delete_or_equip_into_triggers(self):
        cases={r['event']:r['expected'] for r in report()['syntheticCases']}
        self.assertIn('outside-this-added-paragraph',cases['item-destroyed']);self.assertIn('no-trigger',cases['infusion-still-active']);self.assertIn('no-unconditional',cases['repeating-shot-equipped-only'])
        self.assertTrue(all(r['manualDeviationAllowedWithWarning'] for r in report()['records']))
    def test_all_report_input_and_generator_pins_match(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for p in [d['generator'],d['upstreamParser']]:self.assertEqual(M.sha((ROOT/p['path']).read_bytes().replace(b'\r\n',b'\n')),p['sha256'])

if __name__=='__main__':unittest.main()
