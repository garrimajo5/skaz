"""Manual selected general casting concordance, with source-specific additions and omissions retained."""
import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import re

ARTICLE_SHA='ef774df6faa63acb1b3e7fd72f6a77e40524f6dec1023a0cf0c08f28faffa169'
SRD_SHA='2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0'
ERRATA_SHA='0c49e2c9c90c9dede38346874c8fda9ff39ce8a715d71aedc5bd1d1e4321014e'
INPUT_PINS={'catalog/spellcasting-reference-scopes-2014.json': '0e20ecfc18534dcc94752854e8ff018d8ad109eeabe9290036d04a6c57d925d3', 'catalog/rest-spellcasting-source-comparison-2014.json': '74078b423eb8670a9c7a2a00a00109c5621e42c1c141a28f41f688a310352ada', 'catalog/wizard-ritual-source-comparison-2014.json': 'b86c7cab1fff18dd8a13507d317cb3a9cb25b3066562fc3f197f766512ae553b', 'catalog/wizard-spellcasting-scope-2014.json': 'd55f3e9b999d31abfc9b98ab76a3331c9e3c5fd205390b1f18bb646ebd0baddb'}
SPECS=[
 ('spell-slots',5,6,[100],'Spell Slots','Casting a Spell at a Higher Level'),
 ('upcasting',6,2,[100],'Casting a Spell at a Higher Level','Casting in Armor'),
 ('cantrips',10,2,[101],'Cantrips','Rituals'),
 ('rituals',11,4,[101],'Rituals','Casting a Spell'),
 ('casting-time',13,1,[101],'Casting Time','Bonus Action'),
 ('bonus-action',14,1,[101],'Bonus Action','Reactions'),
 ('reactions',15,1,[101],'Reactions','Longer Casting Times'),
 ('longer-casting',16,1,[101],'Longer Casting Times','Range'),
 ('range',19,5,[101],'Range','Components'),
 ('components',20,2,[101],'Components','Verbal (V)'),
 ('verbal',21,2,[101],'Verbal (V)','Somatic (S)'),
 ('somatic',22,2,[101,102],'Somatic (S)','Material (M)'),
 ('material',23,3,[102],'Material (M)','Duration'),
]
FACTS={
 'spell-slots':{'ordinaryCastExpendsOneSlotOfSpellLevelOrHigher':True,'longRestRestoresExpendedSpellSlots':True,'warlockTableExceptionRetained':True,'slotlessSpecificFeaturesRemainSeparate':True,'allItemChargesOrUnknownCountersRestoredByThisRule':False},
 'upcasting':{'spellAssumesSlotLevelForThatCasting':True,'enhancedEffectsRequireSpellDescription':True,'everySpellAutomaticallyGainsDamageDice':False,'higherMulticlassSlotsExpandClassLearning':False},
 'cantrips':{'spellLevel':0,'ordinarySlotRequired':False,'preparationRequiredByGenericRule':False,'scalingWhenSpellSpecifiesHigherLevelsUsesCharacterLevel':True,'scalingClauseEstablishedBySrdCantripSubsectionAlone':False,'allCantripsScaleAutomatically':False},
 'rituals':{'ritualTagRequired':True,'grantingFeatureRequired':True,'additionalMinutes':10,'ordinarySlotExpended':False,'ordinaryUpcastAllowed':False,'preparedOrKnownUnlessClassFeatureException':True,'wizardBookExceptionTransferredToArtificer':False,'allCastersAutomaticallyGainRitualCasting':False},
 'casting-time':{'usualSingleActionHasOtherTimingExceptions':True,'allSpellsFixedToOneAction':False},
 'bonus-action':{'usesBonusActionOnOwnTurn':True,'bonusActionMustBeAvailable':True,'sameTurnOtherSpellsLimitedToCantripWithOneActionCastingTime':True,'restrictionIsWholeRound':False,'genericOneLeveledSpellPerTurnRuleEstablished':False},
 'reactions':{'spellDescriptionDefinesTrigger':True,'arbitraryReactionWithoutTriggerGranted':False,'ownAndOtherTurnsNotCollapsedIntoWholeRoundBan':True},
 'longer-casting':{'actionEachTurnRequired':True,'concentrationWhileCastingRequired':True,'includesRituals':True,'brokenConcentrationFailsSpell':True,'failedLongCastExpendsSlot':False,'retryMustStartOver':True,'allItemChargesOrOtherResourcesRefunded':False,'readyActionAlreadyCastSpellProcedureInferred':False},
 'range':{'targetMustBeWithinRangeWhenCast':True,'touchAndSelfDistinguished':True,'selfConeOrLineOriginIsCaster':True,'rangeDoesNotGenerallyConstrainEffectsAfterCasting':True,'spellDescriptionCanLimitContinuingEffectRange':True,'gridCellRequiredByPrimary':False},
 'components':{'requiredVerbalSomaticMaterialComponentsMustBeProvidedByOrdinaryRule':True,'runtimeHardBlockImplemented':False,'specificClassItemOverridesRemainSeparate':True},
 'verbal':{'audibleMysticSoundRequired':True,'gaggedOrSilencedPreventsOrdinaryVerbalSpell':True,'allSpellsRequireVerbalComponent':False},
 'somatic':{'ordinarySomaticSpellNeedsFreeUseOfAtLeastOneHand':True,'holdingFocusAutomaticallyWaivesSomaticOnlyHandRequirement':False},
 'material':{'pouchOrClassAppropriateFocusMaySubstituteOrdinaryUnpricedUnconsumedMaterial':True,'specificPricedComponentStillRequired':True,'consumedComponentMustBeProvidedEachCasting':True,'handMustAccessMaterialOrHoldFocus':True,'sameHandMayPerformSomaticAndMaterial':True,'focusErasesCostOrConsumption':False,'secondaryExplicitHoldFocusHandWordingOmitted':True},
}


def sha(raw):return hashlib.sha256(raw).hexdigest()


def compact(text):return ' '.join(text.split())


def helper():
    p=Path(__file__).with_name('audit-wizard-candidate-concordance-2014.py');s=importlib.util.spec_from_file_location('clause_paragraphs',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


def load_inputs(root):
    data={}
    for path,digest in INPUT_PINS.items():
        raw=(root/path).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=digest:raise ValueError('Changed manually assessed context requires explicit reassessment')
        data[path]=json.loads(raw)
    return data


def selected_span(pages,numbers,start,stop):
    if any(n not in pages for n in numbers):raise ValueError('Missing primary continuation page')
    text=' '.join(pages[n] for n in numbers)
    starts=list(re.finditer(r'(?<!\w)'+re.escape(start)+r'(?!\w)',text))
    if len(starts)!=1:raise ValueError('Missing/ambiguous complete selected start boundary')
    begin=starts[0].end();stops=list(re.finditer(r'(?<!\w)'+re.escape(stop)+r'(?!\w)',text[begin:]))
    if not stops:raise ValueError('Missing complete selected stop boundary')
    return text[begin:begin+stops[0].start()].strip()



def primary_pages(raw,expected,numbers):
    if sha(raw)!=expected:raise ValueError('Wrong primary source PDF')
    import pypdfium2 as p
    pdf=p.PdfDocument(raw);result={}
    for n in numbers:
        page=pdf[n-1];tp=page.get_textpage();text=compact(tp.get_text_range())
        if expected==SRD_SHA:
            header='System Reference Document 5.1 '+str(n)+' '
            if not text.startswith(header):raise ValueError('Changed inspected SRD header')
            text=text[len(header):]
        result[n]=text;tp.close();page.close()
    pdf.close();return result


def errata_cantrip(text):
    start='Spells Known and Prepared (p. 164).';stop='Feats'
    if text.count(start)!=1:raise ValueError('Changed selected errata heading')
    unit=text[text.index(start):text.index(stop,text.index(start))].strip()
    if unit.count('particu\ufffelar')!=1:raise ValueError('Changed inspected errata word wrap; no generic letter repair')
    normalized=unit.replace('particu\ufffelar','particular')
    if 'based on your character level, not your level in a particular class' not in normalized:raise ValueError('Missing cantrip scaling condition')
    return {'source':'phb2014-errata-v3.0-2021','pdfPage':3,'rawSelectedTextSha256':sha(unit.encode()),'normalizedSelectedTextSha256':sha(normalized.encode()),'visuallyCheckedBoundedRepair':{'from':'particu\ufffelar','to':'particular','count':1},'scope':'only Spells Known and Prepared p164 new paragraph; other errata/classes/feats excluded'}


def secondary_units(raw,inventory):
    if sha(raw)!=ARTICLE_SHA:raise ValueError('Changed manually assessed secondary article')
    html=raw.decode('utf-8');html=html[html.index('<div class="desc card__article-body"'):];headings=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',html,re.S));h=helper();rows=[]
    for key,ordinal,count,numbers,start,stop in SPECS:
        heading=headings[ordinal-1];ps=h.Paragraphs().result(html[heading.end():headings[ordinal].start()]);old=inventory['blocks'][ordinal]
        body=compact(' '.join(ps))
        if len(ps)!=count or old['title']!=h.visible(heading[2]) or sha(body.encode())!=old['bodyTextSha256']:raise ValueError('Lost/changed secondary scope or paragraph continuation')
        rows.append({'key':key,'headingOrdinal':ordinal,'title':old['title'],'bodyTextSha256':sha(body.encode()),'paragraphSha256':[sha(p.encode()) for p in ps]})
    return rows


def audit(article_raw,srd_raw,errata_raw,root=Path('.'),*,rendered_pages_inspected=False):
    if not rendered_pages_inspected:raise ValueError('Inspect rendered SRD100/101/102 and errata3 before manual assessment')
    data=load_inputs(root);base=data['catalog/spellcasting-reference-scopes-2014.json']
    if base['source']['sha256']!=ARTICLE_SHA:raise ValueError('Inventory receipt differs from selected source')
    second=secondary_units(article_raw,base['inventory']);pages=primary_pages(srd_raw,SRD_SHA,[100,101,102]);correction=errata_cantrip(primary_pages(errata_raw,ERRATA_SHA,[3])[3]);records=[]
    for row,spec in zip(second,SPECS):
        key,ordinal,count,numbers,start,stop=spec;unit=selected_span(pages,numbers,start,stop)
        record={**row,'unitId':'source-comparison:general-'+key,'completeSelectedSecondarySubsectionReviewed':True,
            'primary':{'source':'srd51','pdfPages':numbers,'startHeading':start,'stopHeadingExcluded':stop,'selectedTextSha256':sha(unit.encode()),'wordCount':len(unit.split()),'completeSelectedPrimarySubsection':True},
            'assessment':'selected-ordinary-conditions-correspond','assessmentMethod':'manual semantic comparison, source/body/paragraph witnesses pinned; not an automatic translation-equality detector',
            'ordinaryFacts':{**FACTS[key],'manualDeviationAllowedWithWarning':True},'fullTranslationAccepted':False,'acceptedForRuntime':False}
        if key=='cantrips':
            record.update(assessment='srd-core-plus-separately-sourced-errata-addition',secondaryCoreParagraphIndexes=[0],secondaryAdditionalParagraphIndexes=[1],additionalPrimaryEvidence=correction)
        if key=='material':
            record.update(assessment='selected-conditions-with-retained-qualifier-omission',literalDifference={'kind':'explicit-qualifier-omission','secondaryParagraphIndex':2,'omittedPrimaryCondition':'hand may hold spellcasting focus as alternative to accessing material components','sourceSilentlyRewritten':False})
        if key=='range':record['localizationCaveat']='secondary origin-cell wording versus primary point of origin does not impose a mandatory grid'
        records.append(record)
    reviewed=[3,4,*[r['headingOrdinal'] for r in records]]
    return {'schemaVersion':1,'status':'thirteen-selected-general-casting-subsections-not-full-chapter-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'newSelectedSubsections':13,'newSecondaryParagraphs':sum(len(r['paragraphSha256']) for r in records),'separatelySourcedCantripAddition':1,'materialQualifierOmissions':1,'remainingUnreviewedHeadingBodies':48-len(reviewed),'canonicalUnitsAccepted':0},
        'sources':{'secondary':base['source'],'srd':{'url':'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf','sha256':SRD_SHA,'pdfPages':[100,101,102],'pageHeadersRemoved':3},'errata':{'url':'https://media.wizards.com/2021/dnd/downloads/PH-Errata.pdf','sha256':ERRATA_SHA,'version':'3.0 (2021),2014PHB','pdfPage':3},'textExtractor':'pypdfium2','extractorVersion':importlib.metadata.version('pypdfium2'),'renderedPagesInspected':True},
        'records':records,'remainingHeadingOrdinals':[n for n in range(1,49) if n not in reviewed],
        'preservedBoundaryHolds':{'spellPointsVariantOrdinals':[7,8,9],'readyAndRepeatedBonusActionOrdinals':[17,18],'xgeTceLabeledHeadings':[31,32,33,40,46],'wizardRitualExceptionNotTransferredToOtherClasses':True,'artificerFullRulesInferred':False,'originalSourceArraysRewritten':False,'fullPagePhbClaimAccepted':False},
        'syntheticCases':[
            {'case':'spell-without-upcast-effect-uses-higher-slot','slotLevel':2,'originalSpellLevel':1,'castingSpellLevel':2,'extraDamageAutomaticallyGranted':False},
            {'case':'wizard5-cleric3-cantrip-that-scales','characterLevel':8,'wizardLevel':5,'scalingBasis':'character8','higherLevelSpellsLearnedFromSharedPool':False},
            {'case':'bonus-spell-then-leveled-reaction-own-turn','ordinaryAllowedByBonusRule':False,'manualDeviationAllowedWithWarning':True},
            {'case':'reaction-on-another-turn-after-earlier-own-turn-bonus-spell','barredByPriorTurnBonusRuleAlone':False,'reactionTriggerStillRequired':True},
            {'case':'two-supplied-action-budgets-without-bonus-spell','oneLeveledPerTurnCapInferredFromBonusRule':False,'otherActionGrantAndCastingRequirementsStillRequired':True},
            {'case':'long-cast-concentration-break','spellSucceeds':False,'spellSlotSpentByThisProcedure':False,'itemChargeRefundOrReadyProcedureInferred':False,'retryRestarts':True},
            {'case':'somatic-only-spell-and-held-focus','focusAloneWaivesFreeHandRequirement':False,'specificExceptionsAndManualPathRemainSeparate':True},
            {'case':'priced-or-consumed-material','focusErasesPriceOrConsumption':False,'manualDeviationAllowedWithWarning':True}],
        'nextWorkItem':{'role':'content','phase':'general-duration-concentration-targets','action':'Compare full duration/instantaneous/concentration and target scopes against complete SRD102 boundaries, preserving lists, damage-source checks and adjacent XGE additions as separate scopes.'},
        'limits':['13selected scopes and32secondary paragraphs are reviewed;33other heading bodies and prelude/table/image rules are not accepted by this comparison.',
            'Cantrip scaling addition has own PHB errata witness; it does not inherit identity from the SRD Cantrips subsection.',
            'Primary component focus/hand clause is retained as omitted in secondary, not silently inserted into source.',
            'No source prose/PDF, canonical units, class/source/translation/rights acceptance, runtime block, resource grant/refund or owner-stage closure exported.'],
        'inputSha256':INPUT_PINS,'generator':{'path':'scripts/audit-general-casting-clauses-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},'upstreamParser':{'path':'scripts/audit-wizard-candidate-concordance-2014.py','sha256':sha(Path(__file__).with_name('audit-wizard-candidate-concordance-2014.py').read_bytes().replace(b'\r\n',b'\n'))}}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('article',type=Path);p.add_argument('srd',type=Path);p.add_argument('errata',type=Path);p.add_argument('--rendered-primary-pages-checked',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=audit(a.article.read_bytes(),a.srd.read_bytes(),a.errata.read_bytes(),rendered_pages_inspected=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
