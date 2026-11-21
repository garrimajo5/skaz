import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
s=importlib.util.spec_from_file_location('concordance',ROOT/'scripts/audit-wizard-candidate-concordance-2014.py');M=importlib.util.module_from_spec(s);s.loader.exec_module(M)


def stored():
    return json.loads((ROOT/'catalog/wizard-candidate-clause-concordance-2014.json').read_text(encoding='utf-8'))


def fixture():
    parts=['<div class="card__body new-article">']; entries=[]
    for n in range(1,29):
        level=3 if n==22 else 4
        parts.append(f'<h{level}>section {n}</h{level}>')
        if n in range(20,28):
            body='<div>'+''.join(f'<p>body {n} <strong>part {i}</strong> &amp; value</p>' for i in range(M.COUNTS[n-20]))+'</div>'
            entries.append({'heading':{'ordinal':n,'title':f'section {n}','level':level,'bodySha256':M.sha(M.visible(body).encode())},'parentFeatureObservationId':M.CANDIDATE})
        else:body='<p>outside selected scope</p>'
        parts.append(body)
    parts.append('<div class="card__footer">');raw=''.join(parts).encode()
    return raw,{'freshCapture':{'sha256':M.sha(raw),'url':'https://example.invalid/public-class'},'snapshotPageSha256':'a'*64,'classifications':entries}


class WizardCandidateConcordanceTest(unittest.TestCase):
    def test_body_parser_preserves_inline_words_entities_and_every_paragraph(self):
        self.assertEqual(M.Paragraphs().result('<div><p>one<strong>two</strong>&amp;three<br/>four</p><p>five</p></div>'),['one two &three four','five'])

    def test_unknown_semantic_content_and_outside_text_cannot_disappear(self):
        for raw in ['<table><tr><td>lost</td></tr></table>','outside<p>one</p>','<p>one</p>tail','<script>x</script>','<ul><li>item</li></ul>']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):M.Paragraphs().result(raw)

    def test_nested_empty_and_unclosed_paragraphs_fail(self):
        for raw in ['<p>one<p>two</p>','<p>one','<p> </p>','</p>']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):M.Paragraphs().result(raw)

    def test_selected_body_counts_hashes_and_optional_boundary(self):
        raw,manifest=fixture();d=M.extract_secondary(raw,manifest)
        self.assertEqual([r['ordinal'] for r in d['sections']],list(range(20,28)));self.assertEqual(sum(len(r['paragraphSha256']) for r in d['sections']),19)
        self.assertFalse(d['sameAsHistoricalCandidateSnapshot']);self.assertNotEqual(d['sha256'],d['historicalCandidateSnapshotSha256'])
        self.assertNotIn('httpStatus',d);self.assertNotIn('capturedAt',d)

    def test_changed_retained_bytes_fail_before_body_matching(self):
        raw,m=fixture()
        with self.assertRaisesRegex(ValueError,'snapshot'):M.extract_secondary(raw+b' ',m)

    def test_changed_body_does_not_inherit_old_body_digest(self):
        raw,m=fixture();raw=raw.replace(b'body 20 ',b'changed 20 ');m['freshCapture']['sha256']=M.sha(raw)
        with self.assertRaisesRegex(ValueError,'Body'):M.extract_secondary(raw,m)

    def test_wrong_parent_heading_or_missing_footer_fails(self):
        for mutation in ['parent','title','footer']:
            raw,m=fixture()
            if mutation=='parent':m['classifications'][0]['parentFeatureObservationId']='scope:artificer:class-features:feature.spellcasting'
            elif mutation=='title':m['classifications'][0]['heading']['title']='other'
            else:raw=raw.replace(b'card__footer',b'no_footer');m['freshCapture']['sha256']=M.sha(raw)
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):M.extract_secondary(raw,m)

    def test_primary_visual_inspection_and_exact_pdf_are_required(self):
        with self.assertRaisesRegex(ValueError,'inspected'):M.extract_scroll(b'fake')
        with self.assertRaisesRegex(ValueError,'Wrong SRD'):M.extract_scroll(b'fake',rendered_page_inspected=True)

    def test_report_reassembles_without_reprinting_source_prose(self):
        d=stored();data,pins=M.load_inputs(ROOT);self.assertEqual(M.assemble(d['secondaryWitness'],d['newSelectedPrimaryScroll'],data,pins),d)
        for path,digest in d['inputSha256'].items():self.assertEqual(M.sha((ROOT/path).read_bytes().replace(b'\r\n',b'\n')),digest)

    def test_mixed_dmg_insert_preserves_original_phb_claim(self):
        d=stored();proposal=d['sourceSegmentationProposal']
        self.assertEqual(d['candidateReference']['sourceIds'],['102']);self.assertEqual(proposal['proposedHistoricalBookSourceId'],'101');self.assertEqual(proposal['scrollInsertParagraphIndexes'],[4]);self.assertEqual(proposal['coreSidebarParagraphIndexes'],[0,1,2,3,5,6,7]);self.assertFalse(proposal['exactDmgPrintVersionVerified']);self.assertFalse(proposal['parentSourceArrayRewritten'])

    def test_qualifier_omissions_remain_findings_not_silent_translation_fixes(self):
        d=stored();rows=[r for r in d['clauses'] if r['assessment']=='explicit-qualifier-omission'];self.assertEqual([r['key'] for r in rows],['learning-table-qualifier','learning-free-qualifier']);self.assertTrue(all(r['secondaryHeadingOrdinal']==27 for r in rows));self.assertTrue(all(not r['wholeTranslationAccepted'] for r in rows))

    def test_copy_check_is_not_casting_check_or_generic_inventory_delete(self):
        f=stored()['scrollCopyOrdinaryFacts'];self.assertEqual((f['checkAbility'],f['checkSkill'],f['checkDC']),('intelligence','arcana','10 + spellLevel'));self.assertTrue(f['scrollDestroyedOnCopyCheckSuccess'] and f['scrollDestroyedOnCopyCheckFailure']);self.assertFalse(f['castingCheckSubstitutedForCopyCheck'] or f['genericInventoryDeletionImplemented'])

    def test_multiclass_fixture_preserves_warning_manual_path(self):
        c=stored()['syntheticDecisionCases'][0];self.assertEqual((c['combinedHighestSlot'],c['ordinaryWizardHighestSpellLevel']),(4,3));self.assertFalse(c['canOrdinarilyLearnWizardLevel4FromPool']);self.assertTrue(c['manualDeviationAllowedWithWarning']);self.assertFalse(stored()['syntheticDecisionCases'][-1]['inferredFromSrdPaladinRangerRounding'])

    def test_changed_primary_scope_snapshot_and_secondary_boundaries_fail(self):
        for mutation in ['scroll','history','digest','count','order']:
            d=stored();data,pins=M.load_inputs(ROOT)
            if mutation=='scroll':d['newSelectedPrimaryScroll']['selectedTextSha256']='0'*64
            elif mutation=='history':d['secondaryWitness']['historicalCandidateSnapshotSha256']=d['secondaryWitness']['sha256']
            elif mutation=='digest':d['secondaryWitness']['sections'][0]['bodySha256']='0'*64
            elif mutation=='count':d['secondaryWitness']['sections'][0]['paragraphSha256'].append('0'*64)
            else:d['secondaryWitness']['sections'].reverse()
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):M.assemble(d['secondaryWitness'],d['newSelectedPrimaryScroll'],data,pins)

    def test_primary_facts_or_runtime_promotion_require_reassessment(self):
        for mutation in ['cantrip','copy','ritual','class','claim']:
            d=stored();data,pins=M.load_inputs(ROOT)
            if mutation=='cantrip':data['inventory']['selectedNewComparisons'][0]['ordinaryFacts']['ordinaryWizardClassEntryCantripCount']=5
            elif mutation=='copy':data['sidebar']['ordinaryFacts']['ownBookCopyHoursPerSpellLevel']=2
            elif mutation=='ritual':data['ritual']['acceptedForRuntime']=True
            elif mutation=='class':next(u for u in data['selected']['units'] if u['key']=='wizard-learning-on-level')['facts']['ordinarySpellLevelUsesWizardTable']=False
            else:next(r for c in data['candidates']['classes'] for r in c['records'] if r['id']==M.CANDIDATE)['sourceIds']=['101']
            with self.subTest(mutation=mutation),self.assertRaises(ValueError):M.assemble(d['secondaryWitness'],d['newSelectedPrimaryScroll'],data,pins)

    def test_synchronized_manifest_body_changes_cannot_inherit_manual_assessment(self):
        d=stored();data,pins=M.load_inputs(ROOT);new='b'*64
        d['secondaryWitness']['sections'][0]['bodySha256']=new
        next(r for r in data['boundaries']['classifications'] if r['heading']['ordinal']==20)['heading']['bodySha256']=new
        with self.assertRaisesRegex(ValueError,'reassessment'):M.assemble(d['secondaryWitness'],d['newSelectedPrimaryScroll'],data,pins)

    def test_changed_paragraph_digest_or_primary_clause_cannot_inherit_manual_assessment(self):
        for changed in ['paragraph','primary']:
            d=stored();data,pins=M.load_inputs(ROOT)
            if changed=='paragraph':d['secondaryWitness']['sections'][0]['paragraphSha256'][0]='b'*64
            else:next(u for u in data['selected']['units'] if u['key']=='wizard-learning-on-level')['anchors'].append('changed qualifier')
            with self.subTest(changed=changed),self.assertRaisesRegex(ValueError,'reassessment'):M.assemble(d['secondaryWitness'],d['newSelectedPrimaryScroll'],data,pins)

    def test_bounded_only_and_next_task_does_not_repeat_concordance(self):
        d=stored();self.assertFalse(d['accepted'] or d['complete'] or d['acceptedForRuntime'] or d['runtimeChanged']);self.assertIsNone(d['approvedDenominator']);self.assertEqual(d['summary']['canonicalUnitsAccepted'],0);self.assertEqual(d['nextWorkItem']['phase'],'wizard-table-reference-concordance');self.assertEqual(len(d['clauses']),19)


if __name__=='__main__':unittest.main()
