import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('ritual',ROOT/'scripts/audit-wizard-ritual-source-comparison-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)
# This short fixture is the licensed SRD5.1 subsection; complete source prose is not exported in the report.
UNIT='You can cast a wizard spell as a ritual if that spell has the ritual tag and you have the spell in your spellbook. You don’t need to have the spell prepared.'
def html():return '<div class="p-article-content"><h2 id="Wizard">Wizard</h2><h2 id="ClassFeatures12">Class Features</h2><h3 id="WizardSpellcasting">Spellcasting</h3><h4 id="RitualCasting4">Ritual Casting</h4><p>'+UNIT+'</p><h4 id="SpellcastingFocus7">Spellcasting Focus</h4><p>Unselected focus text.</p></div>'
def report():return json.loads((ROOT/'catalog/wizard-ritual-source-comparison-2014.json').read_text(encoding='utf-8'))

class WizardRitualSourceTest(unittest.TestCase):
    def test_complete_component_excludes_next_focus_paragraph(self):
        self.assertEqual(M.RitualParser().result(html()),UNIT)
        self.assertEqual(M.pdf_unit('Before\nRitual Casting\n'+UNIT+'\nSpellcasting Focus\nOther'),UNIT)
    def test_wrong_wizard_base_or_spellcasting_context_is_rejected(self):
        for a,b in [('id="Wizard"','id="Bard"'),('ClassFeatures12','ClassFeatures2'),('WizardSpellcasting','BardSpellcasting')]:
            with self.assertRaises(ValueError):M.RitualParser().result(html().replace(a,b))
    def test_duplicate_base_context_or_unit_is_ambiguous(self):
        for text in [html().replace('<h3 id="WizardSpellcasting">','<h2 id="ClassFeatures12">Class Features</h2><h3 id="WizardSpellcasting">'),html()+html()]:
            with self.assertRaises(ValueError):M.RitualParser().result(text)
    def test_missing_stop_or_unclosed_paragraph_is_rejected(self):
        for text in [html().replace('SpellcastingFocus7','OtherFeature'),html().replace('</p><h4 id="SpellcastingFocus7">','<h4 id="SpellcastingFocus7">')]:
            with self.assertRaises(ValueError):M.RitualParser().result(text)
    def test_unexpected_heading_or_extra_paragraph_cannot_be_hidden_in_unit(self):
        for text in [html().replace('<p>'+UNIT,'<h4 id="Other">Other</h4><p>'+UNIT),html().replace('</p><h4 id="SpellcastingFocus7">','</p><p>Additional condition.</p><h4 id="SpellcastingFocus7">')]:
            with self.assertRaises(ValueError):M.RitualParser().result(text)
    def test_list_condition_inside_unit_is_not_silently_dropped(self):
        text=html().replace('<h4 id="SpellcastingFocus7">','<ul><li>Additional source condition.</li></ul><h4 id="SpellcastingFocus7">')
        with self.assertRaises(ValueError):M.RitualParser().result(text)
    def test_second_paragraph_cannot_overwrite_unclosed_first_condition(self):
        text=html().replace('<p>'+UNIT,'<p>Additional unclosed condition.<p>'+UNIT)
        with self.assertRaises(ValueError):M.RitualParser().result(text)
    def test_plain_text_or_image_condition_outside_paragraph_is_rejected(self):
        for addition in ['Additional visible condition.','<img alt="Additional source condition">']:
            with self.assertRaises(ValueError):M.RitualParser().result(html().replace('<h4 id="SpellcastingFocus7">',addition+'<h4 id="SpellcastingFocus7">'))
    def test_inline_emphasis_preserves_complete_text(self):
        self.assertEqual(M.RitualParser().result(html().replace('wizard spell','<em>wizard spell</em>')),UNIT)
    def test_exact_pdf_heading_boundary_not_substring_is_required(self):
        for text in ['Ritual Casting example\n'+UNIT+'\nSpellcasting Focus','Ritual Casting\n'+UNIT+'\nRitual Casting\nSpellcasting Focus']:
            with self.assertRaises(ValueError):M.pdf_unit(text)
    def test_book_tag_and_wizard_class_conditions_are_not_dropped(self):
        for a,b in [('wizard spell','any spell'),('ritual tag','other tag'),('in your spellbook','on any class list'),('You don’t need to have the spell prepared.','You need preparation.')]:
            with self.assertRaises(ValueError):M.facts(UNIT.replace(a,b))
    def test_preparation_is_independent_and_other_class_rules_not_inferred(self):
        d=M.facts(UNIT);self.assertFalse(d['preparationRequiredByThisFeature']);self.assertFalse(d['artificerOrOtherClassRitualRuleInferred']);self.assertFalse(d['durationOrSlotExpenditureEstablishedByThisSubsection'])
    def test_synthetic_class_tag_book_cases_and_manual_warning_path(self):
        d=report()
        for r in d['syntheticCases']:
            self.assertEqual(r['ordinaryWizardRitualAccess'],r['spellIsWizardSpell'] and r['ritualTag'] and r['inWizardBook'])
            if not r['ordinaryWizardRitualAccess']:self.assertTrue(r['manualActionAllowed'])
        self.assertTrue(d['ordinaryFacts']['manualDeviationAllowedWithWarning'])
    def test_component_equality_does_not_rewrite_parent_feature_or_enable_runtime(self):
        d=report();self.assertEqual({v['normalizedWordCount'] for v in d['witnesses'].values()},{32})
        self.assertEqual(len({v['normalizedUnitSha256'] for v in d['witnesses'].values()}),1)
        self.assertFalse(d['runtimeChanged']);self.assertFalse(d['acceptedForRuntime']);self.assertFalse(d['existingManualParentFeature']['rewritten']);self.assertFalse(d['existingManualParentFeature']['newCatalogFeatureCreated']);self.assertIsNone(d['approvedDenominator'])
    def test_exact_input_and_generator_pins_match(self):
        d=report()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for p in [d['generator'],d['upstreamParser']]:self.assertEqual(M.sha((ROOT/p['path']).read_bytes().replace(b'\r\n',b'\n')),p['sha256'])

if __name__=='__main__':unittest.main()
