"""Complete selected duration/concentration/target text scopes, preserving list items and a translation caveat."""
import argparse
import hashlib
from html.parser import HTMLParser
import importlib.metadata
import importlib.util
import json
from pathlib import Path
import re

INPUT_PINS={'catalog/general-casting-clauses-2014.json': 'aa6815ec47e2cb963c1c30e5fc50082bb20a6fc47861bc6c6f502dfcd59c97cf', 'catalog/spellcasting-reference-scopes-2014.json': '0e20ecfc18534dcc94752854e8ff018d8ad109eeabe9290036d04a6c57d925d3', 'catalog/basic-rules-publication-boundary-2014.json': '581a431600b794854b840c4d1ab7f5ed210c5ddb3286cf3058905ff506cdf5b6'}
BASIC_SHA='7a0c5d8bf52d15092f156d78418aa3d43307e271f810d2f06bf2f0258e9288a3'
SPECS=[('duration',24,1,0,'Duration','Duration A spell’s duration','Instantaneous'),('instantaneous',25,1,0,'Instantaneous','Instantaneous Many spells','Concentration'),('concentration',26,5,3,'Concentration','Concentration Some spells','Targets'),('targets',28,3,0,'Targets','Targets A typical spell','A Clear Path to the Target'),('clear-path',29,2,0,'A Clear Path to the Target','A Clear Path to the Target To target','Targeting Yourself'),('self-target',30,1,0,'Targeting Yourself','Targeting Yourself If a spell','Areas of Effect')]
FACTS={
 'duration':{'roundsMinutesHoursYearsPossible':True,'untilDispelledOrDestroyedDependsOnSpell':True,'allDurationsFixedToConcentration':False},
 'instantaneous':{'instantaneousSpellMagicExistsOnlyForAnInstant':True,'instantaneousEffectNotDispelledByDurationRule':True,'counterspellBeforeCompletionRuledOutByThisSection':False,'allResultingChangesRevertedInstantly':False},
 'concentration':{'losingConcentrationEndsConcentrationSpell':True,'canEndAnytimeWithoutAction':True,'normalMovementOrAttackingAutomaticallyBreaks':False,'anotherConcentrationSpellEndsPrevious':True,'ordinaryTwoConcentrationSpellsAllowed':False,'damageCheckAbility':'constitution','damageCheckType':'saving-throw','ordinaryDamageDC':'max(10,floor(damage/2))','differentDamageSourcesRequireSeparateSaves':True,'incapacitationOrDeathEndsConcentration':True,'dmMayCallEnvironmentSaveDC':10,'everyEnvironmentEventAutomaticallyCallsSave':False},
 'targets':{'spellDescriptionDeterminesTargetKinds':True,'perceptibleEffectClauseRefersToSpellInPrimary':True,'targetAlwaysKnowsItWasTargeted':False,'spellDescriptionCanOverrideAwareness':True},
 'clear-path':{'targetCannotBeBehindTotalCoverByOrdinaryRule':True,'unseenAreaOriginWithInterveningObstructionAppearsNearSide':True,'invisibilityAutomaticallyEqualsTotalCover':False,'spellSpecificExceptionsRemainSeparate':True},
 'self-target':{'creatureOfChoiceCanBeSelfUnlessHostileOrOtherCreatureRequired':True,'casterCanChooseSelfIfWithinOwnArea':True,'rangeSelfAlwaysMeansOnlyCasterCanBeAffected':False},
}


def sha(raw):return hashlib.sha256(raw).hexdigest()


def compact(text):return ' '.join(text.split())


def casting_module():
    p=Path(__file__).with_name('audit-general-casting-clauses-2014.py');s=importlib.util.spec_from_file_location('selected_casting',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m


class TextBlocks(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.stack=[];self.parts=[];self.blocks=[];self.paragraphs=0;self.list_items=0

    def handle_starttag(self,tag,attrs):
        if tag not in {'p','li','ul','ol','div','span','a','b','i','strong','em','br'}:raise ValueError('Unknown selected text/list element')
        if tag in {'p','li'}:
            if self.stack and (self.stack!=['li'] or tag!='p'):raise ValueError('Nested text block')
            if not self.stack:self.parts=[]
            self.stack.append(tag)
            if tag=='p':self.paragraphs+=1
            else:self.list_items+=1
        if self.stack:self.parts.append(' ')

    def handle_endtag(self,tag):
        if tag in {'p','li'}:
            if not self.stack or self.stack[-1]!=tag:raise ValueError('Unmatched text block')
            kind=self.stack[0];self.stack.pop()
            if not self.stack:
                text=compact(''.join(self.parts))
                if not text:raise ValueError('Empty text block')
                self.blocks.append({'kind':kind,'text':text})
        elif tag not in {'ul','ol','div','span','a','b','i','strong','em','br'}:raise ValueError('Unknown selected close')
        if self.stack:self.parts.append(' ')

    def handle_data(self,text):
        if self.stack:self.parts.append(text)
        elif text.strip():raise ValueError('Visible content outside paragraph/list item')

    def result(self,raw):
        self.feed(raw);self.close()
        if self.stack:raise ValueError('Unclosed text block')
        m=casting_module().helper()
        if compact(' '.join(b['text'] for b in self.blocks))!=m.visible(raw):raise ValueError('Lost text/list content')
        return self.blocks


def named_primary(text,heading,marker,stop):
    if text.count(marker)!=1:raise ValueError('Ambiguous named primary marker')
    begin=text.index(marker)+len(heading)
    end=text.find(stop,begin)
    if end<0:raise ValueError('Missing complete selected stop')
    return text[begin:end].strip()


def audit(article_raw,srd_raw,basic_raw,root=Path('.'),*,rendered_pages_inspected=False):
    if not rendered_pages_inspected:raise ValueError('Inspect SRD102 and Basic5 before assessment')
    data={}
    for path,digest in INPUT_PINS.items():
        raw=(root/path).read_bytes().replace(b'\r\n',b'\n')
        if sha(raw)!=digest:raise ValueError('Changed manually assessed input; reassess before inheritance')
        data[path]=json.loads(raw)
    m=casting_module()
    if sha(article_raw)!=m.ARTICLE_SHA:raise ValueError('Changed selected secondary article')
    primary=m.primary_pages(srd_raw,m.SRD_SHA,[102])[102];basic=m.primary_pages(basic_raw,BASIC_SHA,[5])[5]
    rounding=m.selected_span({5:basic},[5],'Round Down','Adventures')
    if 'Whenever you divide a number in the game, round down' not in rounding:raise ValueError('Missing general rounding source')
    rounding_witness={'source':'basic2018','pdfPage':5,'start':'Round Down','stopExcluded':'Adventures','selectedTextSha256':sha(rounding.encode()),'scope':'whole selected general rounding paragraph only; not SRD concentration wording'}
    base=data['catalog/spellcasting-reference-scopes-2014.json'];html=article_raw.decode('utf-8');html=html[html.index('<div class="desc card__article-body"'):];hs=list(re.finditer(r'<h([234])\b[^>]*>(.*?)</h\1>',html,re.S));records=[]
    for key,n,pcount,lcount,heading,marker,stop in SPECS:
        h=hs[n-1];raw=html[h.end():hs[n].start()];parser=TextBlocks();blocks=parser.result(raw);old=base['inventory']['blocks'][n];body=compact(' '.join(b['text'] for b in blocks))
        if parser.paragraphs!=pcount or parser.list_items!=lcount or sha(body.encode())!=old['bodyTextSha256'] or m.helper().visible(h[2])!=old['title']:raise ValueError('Lost/changed complete secondary paragraph or list scope')
        unit=named_primary(primary,heading,marker,stop)
        r={'key':key,'headingOrdinal':n,'title':old['title'],'secondary':{'bodyTextSha256':sha(body.encode()),'paragraphCount':pcount,'listItemCount':lcount,'textBlocks':[{'kind':b['kind'],'textSha256':sha(b['text'].encode())} for b in blocks]},
           'primary':{'source':'srd51','pdfPage':102,'heading':heading,'startMarker':marker,'stopExcluded':stop,'selectedTextSha256':sha(unit.encode()),'wordCount':len(unit.split()),'completeSelectedTextScope':True},
           'assessment':'selected-ordinary-conditions-correspond','assessmentMethod':'manual semantic comparison pinned to full source/body/list witnesses; not automatic translation equivalence','ordinaryFacts':{**FACTS[key],'manualDeviationAllowedWithWarning':True},'fullTranslationAccepted':False,'acceptedForRuntime':False}
        if key=='concentration':r['additionalPrimaryEvidence']=rounding_witness
        if key=='targets':r.update(assessment='selected-conditions-with-retained-referent-mismatch',literalDifference={'kind':'perceptible-effect-referent-shift','secondaryRefersTo':'target','primaryRefersTo':'spell','sourceSilentlyRewritten':False})
        records.append(r)
    earlier=[3,4,*[r['headingOrdinal'] for r in data['catalog/general-casting-clauses-2014.json']['records']]];reviewed=[*earlier,*[r['headingOrdinal'] for r in records]]
    return {'schemaVersion':1,'status':'six-selected-duration-concentration-target-scopes-not-full-chapter-or-runtime','accepted':False,'complete':False,'approvedDenominator':None,'acceptedForRuntime':False,'runtimeChanged':False,
        'summary':{'newSelectedSubsections':6,'newSecondaryParagraphs':13,'newSecondaryListItems':3,'targetReferentMismatchesRetained':1,'remainingUnreviewedHeadingBodies':48-len(reviewed),'canonicalUnitsAccepted':0},
        'sources':{'secondary':base['source'],'srd':{'sha256':m.SRD_SHA,'pdfPage':102},'basic':{'sha256':BASIC_SHA,'url':'https://media.wizards.com/2018/dnd/downloads/DnD_BasicRules_2018.pdf','pdfPage':5,'srdLicenseInherited':False},'extractor':'pypdfium2','extractorVersion':importlib.metadata.version('pypdfium2'),'renderedPagesInspected':True},
        'records':records,'remainingHeadingOrdinals':[n for n in range(1,49) if n not in reviewed],
        'syntheticCases':[{'case':'separateDamageSources','damage':[8,27],'expectedSeparateConSavesDC':[10,13],'mergedSingleCheck':False},{'case':'oddDamageRounding','damage':21,'expectedConSaveDC':10,'roundingSource':'Basic2018PDF5,not concentration subsection alone'},{'case':'incapacitatedEvenWithPositiveHP','ordinaryConcentrationEnds':True},{'case':'movementOrAttackOnly','automaticConcentrationBreak':False},{'case':'concentrationEndedVoluntarily','actionRequired':False},{'case':'instantaneousEffect','dispelAllowedByDurationRule':False,'counterspellTimingDecidedByThisRule':False},{'case':'unseenTarget','invisibleAutomaticallyMeansTotalCover':False},{'case':'selfRangeArea','onlyCasterCanEverBeAffected':False}],
        'preservedHolds':{'xgeObservingIdentifyingInvalidTargetsHeadings':[31,32,33],'xgeOrTceRulesAccepted':False,'sourceArraysRewritten':False,'runtimeResourceOrConditionChanges':False},
        'nextWorkItem':{'role':'content','phase':'general-areas-saves-attacks-combination','action':'Compare full common area/shape, saving-throw, attack-roll and combining-effect scopes against complete corresponding SRD boundaries; preserve XGE grid methods and TCE personalization separately.'},
        'limits':['Six selected scopes retain all13paragraphs and3list items;27other heading bodies are not accepted.',
            'General rounding has separate Basic5 provenance; Basic license/whole book acceptance is not inherited from SRD.',
            'Secondary target/spell perceptibility referent mismatch is retained, not silently repaired or used for automatic NPC-awareness.',
            'No full source prose/PDF, canonical units, rights, runtime hard block, profile edit, inventory event or owner milestone accepted.'],
        'inputSha256':INPUT_PINS,'generator':{'path':'scripts/audit-general-concentration-targets-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))},'upstreamParsers':[{'path':'scripts/'+name+'.py','sha256':sha(Path(__file__).with_name(name+'.py').read_bytes().replace(b'\r\n',b'\n'))} for name in ['audit-general-casting-clauses-2014','audit-wizard-candidate-concordance-2014']]}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('article',type=Path);p.add_argument('srd',type=Path);p.add_argument('basic',type=Path);p.add_argument('--rendered-primary-pages-checked',action='store_true');p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    d=audit(a.article.read_bytes(),a.srd.read_bytes(),a.basic.read_bytes(),rendered_pages_inspected=a.rendered_primary_pages_checked);a.output.write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode());print(json.dumps(d['summary']))
