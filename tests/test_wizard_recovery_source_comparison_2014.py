import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('recovery_comparison',ROOT/'scripts/audit-wizard-recovery-source-comparison-2014.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

def html():
    return '<h3 id="ArcaneRecovery">Wrong navigation</h3><div class="p-article-content"><h2 id="Wizard">Wizard</h2><h2 id="ClassFeatures12">Class Features</h2><h3 id="ArcaneRecovery">Arcane Recovery</h3><p>First fixture paragraph.</p><p>Second fixture paragraph.</p><h3 id="ArcaneTradition">Arcane Tradition</h3><p>Not part of the selected unit.</p></div>'

class WizardRecoverySourceTest(unittest.TestCase):
    def test_whole_two_paragraph_unit_excludes_headings_navigation_and_next_feature(self):
        self.assertEqual(M.WizardRuleParser().result(html()),'First fixture paragraph.\nSecond fixture paragraph.')

    def test_recovery_without_wizard_context_is_not_the_selected_unit(self):
        with self.assertRaises(ValueError):M.WizardRuleParser().result(html().replace('id="Wizard"','id="Cleric"'))

    def test_missing_stop_or_duplicate_start_cannot_truncate_or_extend_unit(self):
        for text in [html().replace('id="ArcaneTradition"','id="Other"'),html().replace('<p>First fixture','<h3 id="ArcaneRecovery">Again</h3><p>First fixture')]:
            with self.assertRaises(ValueError):M.WizardRuleParser().result(text)

    def test_extra_paragraph_cannot_hide_inside_complete_unit(self):
        with self.assertRaises(ValueError):M.WizardRuleParser().result(html().replace('<h3 id="ArcaneTradition">','<p>Additional rule.</p><h3 id="ArcaneTradition">'))

    def test_other_class_after_wizard_cannot_inherit_wizard_context(self):
        text=html().replace('<h2 id="ClassFeatures12">','<h2 id="Cleric">Cleric</h2><h2 id="ClassFeatures12">')
        with self.assertRaises(ValueError):M.WizardRuleParser().result(text)

    def test_section_transition_inside_unit_is_not_a_complete_wizard_rule(self):
        text=html().replace('<p>Second fixture','<h2 id="Cleric">Cleric</h2><p>Second fixture')
        with self.assertRaises(ValueError):M.WizardRuleParser().result(text)

    def test_pdf_requires_unique_exact_heading_lines(self):
        text='Before\nArcane Recovery\nBody mentioning Arcane Tradition inline.\nArcane Tradition\nAfter'
        self.assertEqual(M.pdf_unit(text),'Body mentioning Arcane Tradition inline.')
        for changed in [text+'\nArcane Recovery',text.replace('\nArcane Tradition\n','\nDifferent heading\n')]:
            with self.assertRaises(ValueError):M.pdf_unit(changed)

    def test_ordinal_hyphen_glyphs_normalize_without_changing_numbers(self):
        a,repairs=M.normalize_unit('a 4th -\u00ad\u2010\u2011level choice')
        b,clean=M.normalize_unit('a 4th-level choice')
        self.assertEqual(a,b);self.assertEqual(repairs['ordinalHyphenRepairs'],1);self.assertEqual(clean['ordinalHyphenRepairs'],0)
        self.assertNotEqual(a,M.normalize_unit('a 5th-level choice')[0])

    def test_finish_wrap_is_source_specific_and_requires_real_line_break(self):
        text='when you fin -\nish a short rest'
        fixed,repairs=M.normalize_unit(text,basic_pdf_layout=True)
        self.assertEqual(fixed,'when you finish a short rest');self.assertEqual(repairs['verifiedBasicFinishWrapRepairs'],1)
        self.assertNotEqual(M.normalize_unit(text)[0],fixed)
        self.assertNotEqual(M.normalize_unit(text.replace('\n',' '),basic_pdf_layout=True)[0],fixed)
        self.assertIn('fi - nish',M.normalize_unit('fi - nish',basic_pdf_layout=True)[0])

    def test_material_rule_changes_never_normalize_to_equal(self):
        for a,b in [('Once per day','Once per rest'),('rounded up','rounded down'),('6th level or higher','5th level or higher'),('half your wizard level','half your character level')]:
            self.assertNotEqual(M.normalize_unit(a,True)[0],M.normalize_unit(b,True)[0])

    def test_source_conditions_are_not_inferred_from_feature_name(self):
        # Selected short anchors from pinned CC-BY SRD5.1 p53; not full feature prose.
        anchors=['Once per day when you finish a short rest','choose expended spell slots','combined level',
                 'half your wizard level (rounded up)','none of the slots can be 6th level or higher',
                 'a 2nd-level spell slot or two 1st-level spell slots']
        text=' | '.join(anchors);facts=M.facts(text)
        self.assertEqual(facts['ordinaryBudget'],'ceil(wizardClassLevel/2)');self.assertTrue(facts['manualDeviationAllowedWithWarning'])
        for anchor in anchors:
            with self.assertRaises(ValueError):M.facts(text.replace(anchor,''))

    def test_comparison_does_not_enable_runtime_or_rewrite_existing_manual_feature(self):
        d=json.loads((ROOT/'catalog/wizard-recovery-source-comparison-2014.json').read_text(encoding='utf-8'))
        self.assertFalse(d['acceptedForRuntime']);self.assertFalse(d['runtimeChanged']);self.assertFalse(d['existingManualFeature']['rewritten'])
        self.assertEqual(d['existingManualFeature']['status'],'manual');self.assertIsNone(d['approvedDenominator'])
        self.assertTrue(d['normalizedSelectedUnitTextEqual'])
        self.assertEqual(len({w['normalizedUnitSha256'] for w in d['witnesses'].values()}),1)
        self.assertEqual(d['witnesses']['basic']['layoutNormalizations']['verifiedBasicFinishWrapRepairs'],1)
        self.assertEqual(d['ordinaryFacts']['specificDayBoundaryOrPactPoolRouting'],'not-established-by-this-unit')

    def test_generator_and_json_only_inputs_remain_current(self):
        d=json.loads((ROOT/'catalog/wizard-recovery-source-comparison-2014.json').read_text(encoding='utf-8'))
        self.assertTrue(all(p.endswith('.json') for p in d['inputSha256']))
        self.assertEqual(d['generator']['sha256'],M.sha((ROOT/d['generator']['path']).read_bytes().replace(b'\r\n',b'\n')))

if __name__=='__main__':unittest.main()
