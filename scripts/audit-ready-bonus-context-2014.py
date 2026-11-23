"""Selected Ready spell excerpt and repeated bonus clause with full combat timing context."""
import argparse
import hashlib
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import re
INPUT_PINS={'catalog/general-introductions-schools-2014.json': '8618b63a316e83bdc40eebc5124f1826244bad5a32e341f74c6998ddf4a01dc1', 'catalog/general-casting-clauses-2014.json': 'aa6815ec47e2cb963c1c30e5fc50082bb20a6fc47861bc6c6f502dfcd59c97cf', 'catalog/general-concentration-targets-2014.json': '0913dd9d2f06d30f69bd60d32451d89117170f1a6a354d82029bf64d87c5330b', 'catalog/spellcasting-reference-scopes-2014.json': '0e20ecfc18534dcc94752854e8ff018d8ad109eeabe9290036d04a6c57d925d3'}


def sha(raw):return hashlib.sha256(raw).hexdigest()


def intro_module():
    p=Path(__file__).with_name('audit-general-introductions-schools-2014.py');s=importlib.util.spec_from_file_location('intro',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def ready_primary(pages):
    if 93 not in pages or 94 not in pages:raise ValueError('Missing Ready continuation page94')
    text=pages[93]+' '+pages[94]
    if text.count('Ready Sometimes')!=1:raise ValueError('Ambiguous Ready heading marker')
    begin=text.index('Ready Sometimes')+len('Ready');stop=text.find('Search',begin)
    if stop<0:raise ValueError('Missing Ready/Search boundary')
    whole=text[begin:stop].strip()
    if whole.count('When you ready a spell')!=1:raise ValueError('Changed complete Ready spell boundary')
    spell=whole[whole.index('When you ready a spell'):].strip()
    for anchor in ['your reaction before the start of your next turn','perceivable circumstance','right after the trigger finishes or ignore the trigger']:
        if anchor not in whole:raise ValueError('Lost whole Ready trigger/deadline context')
    for anchor in ['you cast it as normal','release with your reaction','casting time of 1 action','requires concentration','dissipates without taking effect','your web spell ends']:
        if anchor not in spell:raise ValueError('Lost complete Ready spell continuation')
    return {'wholeContextSha256':sha(whole.encode()),'wholeContextWordCount':len(whole.split()),'spellExcerptSha256':sha(spell.encode()),'spellExcerptWordCount':len(spell.split()),'pdfPages':[93,94],'stopExcluded':'Search','wholeContextCaptured':True,'secondaryIsWholeReadyAction':False}


def reactions_primary(text):
    if text.count('Reactions Certain special abilities')!=1:raise ValueError('Changed reaction heading')
    begin=text.index('Reactions Certain special abilities')+len('Reactions');stop=text.find('Movement and Position',begin)
    if stop<0:raise ValueError('Missing Reactions/Movement boundary')
    unit=text[begin:stop].strip()
    if 'until the start of your next turn' not in unit or not unit.endswith('right after the reaction.'):raise ValueError('Lost exact reaction reset/end boundary')
    return {'source':'srd51','pdfPage':91,'startHeading':'Reactions','stopExcluded':'Movement and Position','selectedTextSha256':sha(unit.encode()),'completeSelectedScope':True}


def ready_errata(text):
    start='Ready (p. 193).'
    if text.count(start)!=1:raise ValueError('Changed selected Ready errata')
    unit=text[text.index(start):text.index('Melee Attacks',text.index(start))].strip()
    if 'your reaction before the start of your next turn' not in unit:raise ValueError('Lost Ready corrected deadline')
    return {'source':'phb2014-errata-v3.0-2021','pdfPage':4,'rawSelectedTextSha256':sha(unit.encode()),'scope':'only selected corrected Ready second sentence; other combat/errata excluded','srdAlreadyContainsCorrection':True,'secondaryExcerptDoesNotContainThisFullActionSentence':True}


def audit(article_raw,srd_raw,errata_raw,root=Path('.'),*,rendered_primary_pages_inspected=False):
    if not rendered_primary_pages_inspected:raise ValueError('Inspect SRD91/93/94 and errata4')
    data={}
    for path,digest in INPUT_PINS.items():
        raw=(root/path).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=digest:raise ValueError('Changed manual Ready context requires reassessment')
        data[path]=json.loads(raw)
    i=intro_module();m=i.module()
    if sha(article_raw)!=m.ARTICLE_SHA:raise ValueError('Changed selected secondary article')
    pages=m.primary_pages(srd_raw,m.SRD_SHA,[91,93,94]);primary=ready_primary(pages);reaction=reactions_primary(pages[91]);errata=ready_errata(m.primary_pages(errata_raw,m.ERRATA_SHA,[4])[4])
    desc=i.DescriptionBoundary(article_raw.decode('utf-8')).result();hs=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',desc,re.S));base=data['catalog/spellcasting-reference-scopes-2014.json'];secondary=[]
    for n,count in [(17,2),(18,1)]:
        h=hs[n-1];ps=m.helper().Paragraphs().result(desc[h.end():hs[n].start()]);old=base['inventory']['blocks'][n]
        if len(ps)!=count or sha(' '.join(ps).encode())!=old['bodyTextSha256']:raise ValueError('Changed/lost selected excerpt paragraphs')
        secondary.append({'headingOrdinal':n,'title':old['title'],'bodyTextSha256':old['bodyTextSha256'],'paragraphSha256':[sha(p.encode()) for p in ps]})
    casting=data['catalog/general-casting-clauses-2014.json'];by_key={r['key']:r for r in casting['records']}
    if not by_key['bonus-action']['ordinaryFacts']['sameTurnOtherSpellsLimitedToCantripWithOneActionCastingTime'] or not by_key['spell-slots']['ordinaryFacts']['ordinaryCastExpendsOneSlotOfSpellLevelOrHigher']:raise ValueError('Lost already checked slot/bonus context')
    old14=base['inventory']['blocks'][14]
    if old14['bodyTextSha256']==secondary[1]['bodyTextSha256']:raise ValueError('Different observations must not silently share body identity')
    remaining=[n for n in data['catalog/general-introductions-schools-2014.json']['remainingHeadingOrdinalsWithoutSelectedProseReview'] if n not in [17,18]]
    return {'schemaVersion':1,'status':'selected-ready-spell-excerpt-and-bonus-condensation-with-explicit-context-not-full-action-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'secondaryObservationsCompared':2,'secondaryParagraphs':3,'wholeCombatReadyContextCaptured':1,'newBonusAbilitiesCreated':0,'remainingHeadingsWithoutSelectedProseReview':len(remaining),'canonicalUnitsAccepted':0},
        'sources':{'secondary':base['source'],'srd':{'sha256':m.SRD_SHA,'pdfPages':[91,93,94]},'errata':{'url':'https://media.wizards.com/2021/dnd/downloads/PH-Errata.pdf','sha256':m.ERRATA_SHA,'version':'3.0(2021),2014PHB','pdfPage':4},'extractor':'pypdfium2','extractorVersion':importlib.metadata.version('pypdfium2'),'renderedPrimaryPagesInspected':True},
        'secondaryObservations':secondary,'primaryReady':primary,'primaryReactions':reaction,'primaryReadyErrata':errata,
        'readyRelationship':{'kind':'complete-secondary-spell-excerpt-with-partial-action-context','fullReadyActionAccepted':False,'genericTriggerIgnoreAndDeadlineRemainRequiredContext':True,
            'literalDifference':{'secondaryFirstParagraphOmitsExplicitReleaseWithReactionClause':True,'reactionStillAppearsInExample':True,'sourceSilentlyRewritten':False},
            'combinedWithCheckedSlotRule':{'input':'catalog/general-casting-clauses-2014.json','key':'spell-slots','primarySelectedTextSha256':by_key['spell-slots']['primary']['selectedTextSha256']},'ordinaryReadyIsClassSpellPreparation':False},
        'bonusRelationship':{'kind':'condensed-same-turn-clause-not-full-bonus-action-rule','originalHeadingOrdinal':14,'originalHeadingBodySha256':old14['bodyTextSha256'],'repeatedHeadingOrdinal':18,'repeatedHeadingBodySha256':secondary[1]['bodyTextSha256'],
            'checkedPrimaryWitnessReused':by_key['bonus-action']['primary'],'separateObservationIdsPreserved':True,'secondRuleOrCapabilityCreated':False,'fullSourceClauseReextracted':False},
        'ordinarySelectedFacts':{'readyOnOwnTurn':True,'readyTriggerMustBePerceivable':True,'canIgnoreTrigger':True,'releaseAfterTriggerFinishesRequiresReaction':True,'readyGrantsExtraReaction':False,'deadline':'before start of next own turn','reactionBudgetResetsAt':'start of next own turn','roundBoundaryAloneResetsReaction':False,
            'readiedSpellCastingTimeMustBeOneAction':True,'ordinarySlottedSpellCastAndSlotSpentWhenReadied':True,'releaseConsumesSecondSlot':False,'holdingSpellRequiresConcentrationEvenIfNormalDurationDoesNot':True,'newReadiedSpellEndsOldConcentration':True,'concentrationFailureAfterReadyingRefundsSlot':False,'noTriggerAutomaticallyRefundsSlot':False,'itemChargeTimingInferred':False,'readyChangesKnownOrPreparedSpellLists':False,'normalSpellAccessComponentsAndCastingRequirementsStillApply':True,
            'bonusRestrictionSameTurnBeforeAndAfter':True,'bonusCantripAlsoTriggersSameTurnRestriction':True,'nonSpellBonusActivityTriggersSpellRestriction':False,'bonusClauseCreatesWholeRoundSpellBan':False,'manualDeviationAllowedWithWarning':True},
        'syntheticCases':[{'case':'ready-normal-magic-missile-while-concentrating-web','webConcentrationEndsWhenReadied':True,'spellSlotSpentAtReady':True,'concentrationRequiredWhileHeld':True,'secondSlotAtReactionRelease':False},{'case':'ready-trigger-ignored-or-not-occurring','automaticSlotRefund':False,'itemRefundInferred':False},{'case':'ready-bonus-action-or-reaction-spell-under-normal-ready-spell-procedure','ordinaryOneActionEligibility':False,'manualDeviationAllowedWithWarning':True},{'case':'readied-slot-versus-long-cast-concentration-failure','slotProceduresSame':False},{'case':'action-spell-before-bonus-spell-in-same-turn','ordinaryBonusClauseWarning':True,'manualDeviationAllowedWithWarning':True}],
        'remainingHeadingOrdinalsWithoutSelectedProseReview':remaining,'unverifiedDiagramHeadingOrdinals':data['catalog/general-introductions-schools-2014.json']['unverifiedDiagramHeadingOrdinals'],
        'nextWorkItem':{'role':'content','phase':'weave-narrative-and-current-scope-coverage','action':'Compare complete final Weave48 narrative with retained Basic2018 primary, using parsed article end; refresh source-scope coverage separating reviewed prose, excerpt context and unverified diagrams/variants.'},
        'limits':['Two secondary observations/three paragraphs are reviewed, not a second bonus rule or whole Action Ready acceptance.',
            'Ready93 requires94 continuation; reaction deadline/reset is not derived from an unqualified round counter.',
            'Ordinary slot timing follows cast-as-normal plus checked slot rule; no generic item charge/refund policy inferred.',
            'No raw source prose/PDF, source array rewrite, runtime block, profile edit, canonical unit or owner-stage closure.'],
        'inputSha256':INPUT_PINS,'generator':{'path':'scripts/audit-ready-bonus-context-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},'upstreamParsers':[{'path':'scripts/'+name+'.py','sha256':sha(Path(__file__).with_name(name+'.py').read_bytes().replace(b'\r\n',b'\n'))} for name in ['audit-general-introductions-schools-2014','audit-general-casting-clauses-2014','audit-wizard-candidate-concordance-2014']]}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('article',type=Path);p.add_argument('srd',type=Path);p.add_argument('errata',type=Path);p.add_argument('--rendered-primary-pages-checked',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=audit(a.article.read_bytes(),a.srd.read_bytes(),a.errata.read_bytes(),rendered_primary_pages_inspected=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
