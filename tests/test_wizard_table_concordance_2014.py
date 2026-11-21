import copy
import importlib.util
import json
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('table_audit',ROOT/'scripts/audit-wizard-table-concordance-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)


def stored():return json.loads((ROOT/'catalog/wizard-table-concordance-2014.json').read_text(encoding='utf-8'))


def srd_rows():return next(c for c in json.loads((ROOT/'catalog/srd51-class-progression.json').read_text(encoding='utf-8'))['classes'] if c['slug']=='wizard')['levels']


def fixture(secondary):
    names=(['Уровень ур','Бонус мастерства бм','Умения','Известные заговоры из','Ячейки заклинаний на уровень заклинаний ячейки'] if secondary else ['Level','Proficiency Bonus','Features','Cantrips Known','— Spell Slots per Spell Level —'])
    result=['<table><tbody><tr>'+''.join('<td '+('rowspan="2"' if i<4 else 'colspan="9"')+'>'+name+'</td>' for i,name in enumerate(names))+'</tr><tr>'+''.join('<td>'+str(n)+'</td>' for n in range(1,10))+'</tr>']
    inverse={v:k for k,v in M.MAPPINGS.items()}
    for r in srd_rows():
        n=r['level'];features=[]
        for name in r['featuresEn']:
            if secondary:
                href='#feature.arcane-tradition' if name.startswith('Arcane Tradition') else inverse.get('Signature Spells' if name=='Signature Spell' else name)
                label=('Магические традиции' if n==2 else 'Умение магической традиции') if href=='#feature.arcane-tradition' else M.RUSSIAN_NAMES[href]
            else:
                href='#fictional-'+name.replace(' ','-');label='Signature Spells' if name=='Signature Spell' else ('Arcane Tradition Feature' if name=='Arcane Tradition feature' else name)
            features.append('<a href="'+href+'">'+label+'</a>')
        feature=', '.join(features) if features else '—'
        if secondary and n==1:feature+='<span class="TCE-feature-on">, <a href="#feature.extra-spells">extra</a></span>'
        if secondary and n==3:feature='<span class="TCE-feature-off">-</span><span class="TCE-feature-on"><a href="#feature.cantrip-formulas">formula</a></span>'
        values=[str(n),'+'+str(r['proficiency']),feature,str(r['cantrips']),*[str(v) if v else '—' for v in r['spellSlots']]]
        result.append('<tr>'+''.join('<td>'+v+'</td>' for v in values)+'</tr>')
    return ''.join(result)+'</tbody></table>'


class WizardTableConcordanceTest(unittest.TestCase):
    def test_twenty_rows_numeric_and_base_names_match_with_four_retained_deltas(self):
        left=M.parse_table(fixture(True),True);right=M.parse_table(fixture(False),False)
        optional,deltas=M.compare_rows(left,right,srd_rows());self.assertEqual(len(left),20);self.assertEqual(len(optional),2);self.assertEqual([d['level'] for d in deltas],[6,10,14,20]);self.assertEqual(deltas[-1]['srdFeatureNames'],['Signature Spell']);self.assertEqual(deltas[-1]['digitalFeatureNames'],['Signature Spells'])

    def test_optional_cells_are_not_baseline_grants(self):
        rows=M.parse_table(fixture(True),True);self.assertEqual(rows[0]['featuresEn'],['Spellcasting','Arcane Recovery']);self.assertEqual(rows[2]['featuresEn'],[]);self.assertEqual(rows[2]['optionalFeatureObservations'][0]['sourceClaim'],'117')

    def test_changed_numeric_slot_is_diagnosed(self):
        a=M.parse_table(fixture(True),True);b=M.parse_table(fixture(False),False);a[4]['spellSlots'][3]=1
        with self.assertRaisesRegex(ValueError,'numeric'):M.compare_rows(a,b,srd_rows())

    def test_changed_known_label_difference_cannot_be_normalized_away(self):
        for level,name in [(6,'Arcane tradition feature'),(20,'Signature Spellings')]:
            a=M.parse_table(fixture(True),True);b=M.parse_table(fixture(False),False);b[level-1]['featuresEn']=[name]
            with self.subTest(level=level),self.assertRaises(ValueError):M.compare_rows(a,b,srd_rows())

    def test_changed_optional_reference_requires_reassessment(self):
        a=M.parse_table(fixture(True).replace('#feature.extra-spells','#feature.unknown'),True);b=M.parse_table(fixture(False),False)
        with self.assertRaisesRegex(ValueError,'optional'):M.compare_rows(a,b,srd_rows())

    def test_unknown_reference_or_relabelled_anchor_is_not_mapped_by_name_alone(self):
        for changed in [fixture(True).replace('#feature.spellcasting','#feature.unknown'),fixture(True).replace('Магическое восстановление','Урон')]:
            with self.assertRaises(ValueError):M.parse_table(changed,True)

    def test_changed_header_meaning_order_or_spans_fails(self):
        for raw in [fixture(False).replace('Cantrips Known','Spells Known'),fixture(False).replace('rowspan="2"','rowspan="3"',1),fixture(False).replace('<td>1</td><td>2</td>','<td>2</td><td>1</td>',1)]:
            with self.assertRaises(ValueError):M.parse_table(raw,False)

    def test_changed_level_order_or_missing_row_fails(self):
        for raw in [fixture(False).replace('<tr><td>1</td>','<tr><td>2</td>',1),fixture(False).replace('<tr><td>20</td>','<tr><td>21</td>',1),fixture(False).replace('<td>+2</td>','',1)]:
            with self.assertRaises(ValueError):M.parse_table(raw,False)

    def test_unknown_semantic_elements_and_outside_text_cannot_disappear(self):
        for raw in [fixture(False).replace('<td>+2</td>','<td><script>+2</script></td>',1),fixture(False).replace('<tr><td>1</td>','lost<tr><td>1</td>',1),fixture(False).replace('<td>+2</td>','outside<td>+2</td>',1)]:
            with self.assertRaises(ValueError):M.parse_table(raw,False)

    def test_unmapped_plain_feature_text_and_unknown_projection_fails(self):
        for raw in ['<a href="#x">name</a> extra condition','<span class="unknown">text</span>']:
            with self.assertRaises(ValueError):M.feature_cell(raw,True)

    def test_numeric_unknown_or_spanned_cell_fails(self):
        for raw in [fixture(False).replace('<td>+2</td>','<td>+9</td>',1),fixture(False).replace('<td>+2</td>','<td rowspan="2">+2</td>',1),fixture(False).replace('<td>3</td><td>2</td>','<td>3</td><td>unknown</td>',1)]:
            with self.assertRaises(ValueError):M.parse_table(raw,False)

    def test_multiple_tables_and_nested_tables_are_not_silently_selected(self):
        for raw in [fixture(False)+fixture(False),'<table>'+fixture(False)+'</table>']:
            with self.assertRaises(ValueError):M.one_table(raw)

    def test_changed_source_bytes_require_reassessment(self):
        with self.assertRaisesRegex(ValueError,'SHA'):M.checked(b'changed',M.SECONDARY_SHA)
        with self.assertRaisesRegex(ValueError,'SHA'):M.audit(b'changed',b'changed',b'changed')

    def test_intro_additions_and_historical_identity_are_preserved(self):
        d=stored();i=d['introduction'];self.assertEqual(len(i['secondaryParagraphSha256']),2);self.assertEqual(len(i['secondaryNavigationReferences']),2);self.assertEqual([r['chapter'] for r in i['primaryNavigationReferences']],[10,11]);self.assertFalse(i['twoNewReferenceTopicsClaimed']);self.assertFalse(i['literalTranslationEqualityClaimed'] or i['navigationTargetsVerifiedInFull']);self.assertNotEqual(d['sources']['secondary']['sha256'],d['sources']['secondary']['historicalCandidateSnapshotSha256']);self.assertEqual(i['candidateReferencePreserved']['sourceIds'],['102'])

    def test_existing_srd_rows_and_optional_candidates_are_preserved(self):
        d=stored();self.assertTrue(d['sources']['srd']['existingWizardRowsReproduced']);self.assertEqual(d['summary']['numericCellsComparedExcludingLevel'],220);self.assertEqual([r['candidateReference']['sourceIds'] for r in d['table']['optionalObservations']],[['117'],['117']]);self.assertFalse(d['table']['optionalGrantsApplied'])

    def test_all_input_and_code_pins_are_current(self):
        d=stored()
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)
        for spec in [d['generator'],*d['upstreamParsers']]:self.assertEqual(M.sha((ROOT/spec['path']).read_bytes().replace(b'\r\n',b'\n')),spec['sha256'])

    def test_next_reference_work_and_scope_holds_are_explicit(self):
        d=stored();self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator']);self.assertEqual(d['nextWorkItem']['phase'],'wizard-general-spellcasting-reference');self.assertEqual(d['referenceGraphProgress']['remaining'],['general spellcasting rules','Wizard spell list'])


if __name__=='__main__':unittest.main()
