"""Selected common area/save/attack/effect prose; diagrams and errata gaps remain explicit."""
import argparse
import hashlib
from html.parser import HTMLParser
import importlib.util
import importlib.metadata
import json
from pathlib import Path
import re
INPUT_PINS={'catalog/general-concentration-targets-2014.json': '0913dd9d2f06d30f69bd60d32451d89117170f1a6a354d82029bf64d87c5330b', 'catalog/general-casting-clauses-2014.json': 'aa6815ec47e2cb963c1c30e5fc50082bb20a6fc47861bc6c6f502dfcd59c97cf', 'catalog/spellcasting-reference-scopes-2014.json': '0e20ecfc18534dcc94752854e8ff018d8ad109eeabe9290036d04a6c57d925d3'}
SPECS=[('areas',34,6,1,0,[102,103],'Areas of Effect','Cone'),('cone',35,1,2,2,[103],'Cone','Cube'),('cube',36,1,2,2,[103],'Cube','Cylinder'),('line',37,1,1,1,[103],'Line','Sphere'),('sphere',38,1,0,0,[103],'Sphere','Saving Throws'),('cylinder',39,2,1,1,[103],'Cylinder','Line'),('saving-throws',43,2,0,0,[103],'Saving Throws','Attack Rolls'),('attack-rolls',44,3,0,0,[103],'Attack Rolls','The Schools of Magic'),('combining-effects',45,2,0,0,[104],'Combining Magical Effects',None)]
FACTS={
 'areas':{'spellDescriptionSpecifiesArea':True,'fiveCommonShapes':True,'originMayBePointCreatureOrObject':True,'unblockedStraightLinesFromOriginRequiredByOrdinaryRule':True,'blockingRequiresTotalCover':True,'spellSpecificExceptionsRemainSeparate':True},
 'cone':{'widthAtDistanceEqualsDistanceFromOrigin':True,'maximumLengthFromSpell':True,'originIncludedByDefault':False,'casterMayChooseToIncludeOrigin':True},
 'cube':{'originCanBeAnywhereOnOneFace':True,'sizeIsSideLength':True,'originIncludedByDefault':False,'casterMayChooseToIncludeOrigin':True},
 'line':{'lengthAndWidthDefineArea':True,'everyLineHasFixedFiveFootWidth':False,'originIncludedByDefault':False,'casterMayChooseToIncludeOrigin':True},
 'sphere':{'sizeUsesRadiusNotDiameter':True,'originIsCenter':True,'originIncluded':True},
 'cylinder':{'originIsCircleCenter':True,'primaryGroundOrSpellHeightPlacementReference':True,'expandsToCircleThenUpOrDownThroughHeight':True,'originIncluded':True},
 'saving-throws':{'spellSpecifiesAbilityAndSuccessFailureEffects':True,'saveCanAvoidSomeOrAllAsSpellSays':True,'saveDC':'8 + spellcastingAbilityModifier + proficiencyBonus + specialModifiers','successfulSaveAlwaysHalvesDamage':False},
 'attack-rolls':{'spellAttackModifier':'spellcastingAbilityModifier + proficiencyBonus','rangedSpellAttackDisadvantageNeedsHostileWithinFiveFeetThatSeesCasterAndIsNotIncapacitated':True,'allSpellAttacksAreRanged':False,'nearbyHostileMustBeTheAttackTarget':False,'specificItemOrFeatureOverridesRemainSeparate':True},
 'combining-effects':{'differentSpellsAddWhileDurationsOverlap':True,'specificNonStackingRulesRemainSeparate':True,'combiningEffectsSumsEveryResourceAutomatically':False,'sameSpellEffectsStack':False,'mostPotentEffectWhileOverlapApplies':True,'equallyPotentOverlappingMostRecentPerSeparateErrata':True,'equalTieRuleEstablishedBySrdTextAlone':False,'lessPotentCastingAutomaticallyDispelledOrDeleted':False,'blessExampleGrantsTwoBonusDice':False},
}


def sha(raw):return hashlib.sha256(raw).hexdigest()


def compact(text):return ' '.join(text.split())


def casting_module():
    p=Path(__file__).with_name('audit-general-casting-clauses-2014.py');s=importlib.util.spec_from_file_location('casting_scope',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


class ParagraphMedia(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.active=False;self.parts=[];self.media=[];self.blocks=[]
    def handle_starttag(self,tag,attrs):
        if tag not in {'p','a','span','strong','em','b','i','br','img','div'}:raise ValueError('Unknown prose/media element')
        if tag=='p':
            if self.active:raise ValueError('Nested paragraph')
            self.active=True;self.parts=[];self.media=[]
        elif tag=='img':
            if not self.active:raise ValueError('Image outside paragraph')
            a=dict(attrs);self.media.append({'src':a.get('src'),'dataSrc':a.get('data-src'),'altSha256':sha(a.get('alt','').encode()),'fetchedOrAcceptedAsArt':False})
        elif self.active:self.parts.append(' ')
    def handle_endtag(self,tag):
        if tag=='p':
            if not self.active:raise ValueError('Unmatched paragraph')
            text=compact(''.join(self.parts))
            if self.media:
                if text:raise ValueError('Mixed image/prose needs separate assessment')
                kind='diagram'
            elif re.match(r'^Схема 2\.[1-6]:',text):kind='caption'
            elif text.startswith('Схема'):raise ValueError('Changed caption identity')
            elif text:kind='prose'
            else:raise ValueError('Empty paragraph')
            self.blocks.append({'kind':kind,'text':text,'images':self.media});self.active=False
        elif tag not in {'a','span','strong','em','b','i','br','img','div'}:raise ValueError('Unknown paragraph close')
        if self.active:self.parts.append(' ')
    def handle_data(self,data):
        if self.active:self.parts.append(data)
        elif data.strip():raise ValueError('Visible data outside paragraph')
    def result(self,raw):
        self.feed(raw);self.close()
        if self.active:raise ValueError('Unclosed paragraph')
        if compact(' '.join(b['text'] for b in self.blocks))!=casting_module().helper().visible(raw):raise ValueError('Lost prose/caption text')
        return self.blocks


def combining_errata(text):
    start='Combining Magical Effects (p. 205).'
    if text.count(start)!=1:raise ValueError('Ambiguous effect errata')
    unit=text[text.index(start):text.index('Spells',text.index(start)+len(start))].strip()
    if 'most recent effect applies' not in unit or 'equally potent and their durations overlap' not in unit:raise ValueError('Lost equal-potency/overlap errata clause')
    return {'source':'phb2014-errata-v3.0-2021','pdfPage':4,'start':start,'stopExcluded':'Spells','rawSelectedTextSha256':sha(unit.encode()),'pdfWordWrapMarkersRetained':True,'scope':'only selected added equal-potency overlapping-effect sentence; not all errata/spells'}


def audit(article_raw,srd_raw,errata_raw,root=Path('.'),*,rendered_pages_inspected=False):
    if not rendered_pages_inspected:raise ValueError('Inspect SRD102/103/104 and errata4 before assessment')
    data={}
    for path,digest in INPUT_PINS.items():
        raw=(root/path).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=digest:raise ValueError('Changed manual assessment context')
        data[path]=json.loads(raw)
    m=casting_module()
    if sha(article_raw)!=m.ARTICLE_SHA:raise ValueError('Changed selected article SHA')
    pages=m.primary_pages(srd_raw,m.SRD_SHA,[102,103,104]);patch=combining_errata(m.primary_pages(errata_raw,m.ERRATA_SHA,[4])[4]);base=data['catalog/spellcasting-reference-scopes-2014.json']
    html=article_raw.decode('utf-8');html=html[html.index('<div class="desc card__article-body"'):];hs=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',html,re.S));records=[];all_images=[]
    for key,n,pcount,icount,ccount,nums,start,stop in SPECS:
        h=hs[n-1];raw=html[h.end():hs[n].start()];blocks=ParagraphMedia().result(raw);prose=[b for b in blocks if b['kind']=='prose'];captions=[b for b in blocks if b['kind']=='caption'];images=[x for b in blocks for x in b['images']];body=compact(' '.join(b['text'] for b in blocks));old=base['inventory']['blocks'][n]
        if len(prose)!=pcount or len(images)!=icount or len(captions)!=ccount or sha(body.encode())!=old['bodyTextSha256']:raise ValueError('Lost prose/caption/diagram scope')
        all_images.extend(images)
        if stop:unit=m.selected_span(pages,nums,start,stop)
        else:
            text=pages[104]
            if text.count(start)!=1 or not text.endswith('two bonus dice.'):raise ValueError('Changed complete effect scope/page end')
            unit=text[text.index(start)+len(start):].strip()
        r={'key':key,'headingOrdinal':n,'title':old['title'],'bodyTextSha256':sha(body.encode()),'ordinaryProseParagraphSha256':[sha(b['text'].encode()) for b in prose],'captionTextSha256':[sha(b['text'].encode()) for b in captions],'diagramReferences':images,
            'completeSelectedOrdinaryProseCompared':True,'wholeSecondaryHeadingAcceptedAsRules':False,'diagramAndCaptionRulesVerified':False,'primary':{'source':'srd51','pdfPages':nums,'startHeading':start,'stopExcluded':stop or 'PDF104 end','selectedTextSha256':sha(unit.encode()),'wordCount':len(unit.split())},
            'assessment':'selected-ordinary-prose-conditions-correspond','ordinaryFacts':{**FACTS[key],'manualDeviationAllowedWithWarning':True},'fullTranslationAccepted':False,'acceptedForRuntime':False}
        if key=='cylinder':r.update(assessment='retained-placement-wording-difference',literalDifference={'secondary':'upper-or-lower-base','primary':'circle on ground or at spell-effect height','exactPlacementEquivalenceAccepted':False,'sourceSilentlyRewritten':False})
        if key=='saving-throws':r['literalDifference']={'kind':'partial-versus-some-or-all-avoidance-wording','sourceSilentlyRewritten':False}
        if key=='combining-effects':r.update(assessment='secondary-and-srd-core-correspond-but-2014-errata-addition-missing',additionalPrimaryEvidence=patch,secondaryAndSrdOmitEqualPotencyMostRecentClause=True)
        records.append(r)
    if all_images!=base['inventory']['images']:raise ValueError('Diagram references differ from retained whole-article inventory')
    prior=data['catalog/general-concentration-targets-2014.json']['remainingHeadingOrdinals'];remaining=[n for n in prior if n not in [r['headingOrdinal'] for r in records]]
    return {'schemaVersion':1,'status':'nine-selected-common-prose-scopes-with-diagram-and-errata-holds-not-full-mixed-page','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'selectedOrdinaryProseScopes':9,'selectedOrdinaryProseParagraphs':19,'diagramReferencesPreservedNotAccepted':7,'captionsPreservedNotAccepted':6,'remainingHeadingsWithoutSelectedProseReview':len(remaining),'additionalHeadingsWithUnverifiedDiagrams':5,'canonicalUnitsAccepted':0},
        'sources':{'secondary':base['source'],'srd':{'sha256':m.SRD_SHA,'pdfPages':[102,103,104]},'errata':{'url':'https://media.wizards.com/2021/dnd/downloads/PH-Errata.pdf','sha256':m.ERRATA_SHA,'version':'3.0(2021),2014PHB','pdfPage':4},'extractor':'pypdfium2','extractorVersion':importlib.metadata.version('pypdfium2'),'renderedPagesInspected':True},
        'records':records,'remainingHeadingOrdinalsWithoutSelectedProseReview':remaining,'headingOrdinalsWithUnverifiedDiagramInsertions':[34,35,36,37,39],
        'syntheticCases':[{'case':'cone-cube-line-origin','originExcludedByDefault':True,'casterMayInclude':True},{'case':'sphere-cylinder-origin','originIncluded':True},{'case':'line-width','fixedFiveFeetInferred':False},{'case':'successful-save','halfDamageAutomaticallyInferred':False},{'case':'ranged-spell-at-distant-target-with-nearby-hostile','hostileWithinFiveFeet':True,'hostileSeesCaster':True,'hostileIncapacitated':False,'ordinaryDisadvantage':True,'hostileMustBeTarget':False},{'case':'equalPotentSameSpellOverlap','mostRecentAppliesPerSeparateErrata':True,'bothCastingsDeletedOrDoubleBonus':False}],
        'preservedHolds':{'xgeGridHeadings':[40,41,42],'tcePersonalizationHeadings':[46,47],'diagramSourceOrGeometryAccepted':False,'originalSourceArraysRewritten':False,'runtimeEffectsOrConditionsDeleted':False},
        'nextWorkItem':{'role':'content','phase':'general-core-introductions-and-schools','action':'Compare What Is a Spell, Spell Level, Casting a Spell introduction and complete Schools of Magic against retained SRD100-104; keep diagrams, variants, Ready and XGE/TCE separate, then Wizard spell list.'},
        'limits':['Nine complete ordinary-prose scopes are compared, not all diagram/caption content of five headings.18headings still lack selected prose review.',
            'Same-spell equal-potency most-recent rule has separate PHB errata evidence; secondary/SRD omission is not silently repaired.',
            'Cylinder placement and save-avoidance wording differences remain explicit; no grid or full translation equivalence asserted.',
            'No raw source prose/PDF, canonical units, rights, runtime change, profile edit or owner-stage closure exported.'],
        'inputSha256':INPUT_PINS,'generator':{'path':'scripts/audit-general-areas-effects-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},'upstreamParsers':[{'path':'scripts/'+name+'.py','sha256':sha(Path(__file__).with_name(name+'.py').read_bytes().replace(b'\r\n',b'\n'))} for name in ['audit-general-casting-clauses-2014','audit-wizard-candidate-concordance-2014']]}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('article',type=Path);p.add_argument('srd',type=Path);p.add_argument('errata',type=Path);p.add_argument('--rendered-primary-pages-checked',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=audit(a.article.read_bytes(),a.srd.read_bytes(),a.errata.read_bytes(),rendered_pages_inspected=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
