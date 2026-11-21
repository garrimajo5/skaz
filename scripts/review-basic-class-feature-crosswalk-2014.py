"""Crosswalk existing local class table references to feature IDs and distinct Basic Rules carriers."""
import argparse
from collections import Counter,defaultdict
import hashlib
import json
from pathlib import Path
INPUTS=['catalog/basic-rules-publication-boundary-2014.json','catalog/srd51-class-progression.json','catalog/srd51-class-features.json','catalog/wizard-recovery-source-comparison-2014.json']
CLASSES=['barbarian','bard','cleric','druid','fighter','monk','paladin','ranger','rogue','sorcerer','warlock','wizard']


def sha(raw):return hashlib.sha256(raw).hexdigest()

def crosswalk(basic,progression,features,rule):
    if progression['ruleset']!='5e-2014' or features['ruleset']!='5e-2014':raise ValueError('Changed rules edition')
    source=basic['sources']['srd51.pdf']
    if any(d['source']['sha256']!=source['sha256'] or d['source']['url']!=source['requestedUrl'] or d['source']['usage']!='cc-by-4.0' for d in [progression,features]):raise ValueError('Local source is not the checked SRD carrier')
    if basic['relations']['srdLicenseExtendsToOtherDocuments'] or not basic['basicPdf']['personalUseNoticePresent'] or basic['accepted'] or basic['complete']:raise ValueError('Carrier scope/licence or acceptance changed')
    classes=progression['classes'];local=features['features']
    if [c['slug'] for c in classes]!=CLASSES or any(c['id']!='srd51:2014:class:'+c['slug'] for c in classes):raise ValueError('Changed class identity/order or unsupported extra class')
    if len({f['id'] for f in local})!=len(local) or any(f['classId'] not in CLASSES or f['status'] not in ['manual','choice','unsupported'] or not f['keys'] or any(not isinstance(k,str) or not k for k in f['keys']) for f in local):raise ValueError('Duplicate/unknown feature identity or status')
    pdf=basic['basicPdf']['classTocEntries'];digital=basic['digitalToc']['classTocNames'];headings=basic['existingSrdWitness']['classHeadingEntries']
    expected_names=[c['name']['en'] for c in classes]
    if digital!=expected_names or [h['name'] for h in headings]!=expected_names or [p['name'] for p in pdf]!=['Cleric','Fighter','Rogue','Wizard']:raise ValueError('Changed carrier class inventory; new evidence required')
    if rule['unitId']!='wizard-arcane-recovery' or not rule['normalizedSelectedUnitTextEqual'] or rule['acceptedForRuntime'] or rule['runtimeChanged'] or rule['accepted'] or rule['complete'] or rule['approvedDenominator'] is not None or rule['existingManualFeature']['fullClassAccepted'] or set(rule['witnesses'])!={'digital','basic','srd'}:raise ValueError('Selected unit changed scope or enabled runtime')
    manual=next(f for f in local if f['id']=='wizard-arcane-recovery')
    if manual['classId']!='wizard' or manual['status']!='manual' or sha(manual['text'].encode())!=rule['existingManualFeature']['textSha256']:raise ValueError('Existing manual rule changed; source comparison requires new review')
    rows=[];totals=Counter()
    for c,h in zip(classes,headings):
        slug=c['slug'];own=[f for f in local if f['classId']==slug];index=defaultdict(list)
        for f in own:
            for key in dict.fromkeys(f['keys']):index[key].append(f['id'])
        if [r['level'] for r in c['levels']]!=list(range(1,21)):raise ValueError('Class table must retain ordered levels1-20')
        references=[];used=set()
        for row in c['levels']:
            for ordinal,label in enumerate(row['featuresEn'],1):
                candidates=index.get(label,[]);state='local-key-resolves-uniquely' if len(candidates)==1 else 'ambiguous-local-key' if candidates else 'unresolved-local-key'
                references.append({'level':row['level'],'tableFeatureOrdinal':ordinal,'label':label,'candidateFeatureIds':candidates,'state':state,'fullTextEquivalenceEstablished':False})
                used.update(candidates);totals[state]+=1
        pdf_entry=next((p for p in pdf if p['name']==c['name']['en']),None)
        rows.append({'classId':c['id'],'slug':slug,'englishName':c['name']['en'],
            'carrierReferences':{'basicPdfTocEntry':pdf_entry,'digitalTocMention':True,'srdHeadingPage':h['headingPage'],
                'existingSrdTableExtractionPage':h['existingTableExtractionPage'],'scope':'TOC/headings and existing extraction-page metadata only'},
            'existingFeatureReferences':[{k:f[k] for k in ['id','keys','status','sourcePage']} for f in own],
            'existingFeatureStatusCounts':dict(Counter(f['status'] for f in own)),
            'tableFeatureReferences':references,'unreferencedLocalFeatureIds':[f['id'] for f in own if f['id'] not in used],
            'fullClassTextCompared':False,'canonicalClassAccepted':False,'automaticCapabilitiesAccepted':False})
    return {'schemaVersion':1,'status':'local-table-feature-reference-crosswalk-not-full-class-or-carrier-text-acceptance',
            'accepted':False,'complete':False,'approvedDenominator':None,
            'summary':{'carrierReferencedSrdClasses':len(rows),'basicPdfClassTocMentions':len(pdf),'digitalClassTocMentions':len(digital),
                'existingLocalFeatureRecords':len(local),'existingLocalFeatureStatusCounts':dict(Counter(f['status'] for f in local)),
                'tableFeatureOccurrences':sum(totals.values()),'referenceResolution':dict(totals),'canonicalUnitsAccepted':0},
            'classRows':rows,'artificerBoundary':{'presentInTheseSrdCarriers':False,'excludedFromProjectOrProvenMissing':False,
                'nextEvidenceSource':'separate official2014 Artificer publication and existing D05 class evidence'},
            'selectedRuleBoundary':{'unitId':rule['unitId'],'selectedEnglishUnitEqualAcrossThreeCarriers':True,
                'existingManualFeatureId':manual['id'],'existingManualFeatureStatus':'manual','existingManualTextUnchanged':True,
                'fullWizardOrAllFeatureTextAccepted':False,'runtimeEnabled':False},
            'rightsBoundary':{'localSrdUsage':features['source']['usage'],'sameCheckedSrdCarrier':True,'licenseTransferredToOtherBasicRulesCarriers':False,
                'otherSourceTextTranslationPermission':'not-established'},
            'limits':['All matches are exact local English key references scoped to a class, not source-text identity or new canonical aliases.',
                'Existing local records and their statuses are an application data inventory, not the full official class catalogue denominator.',
                'Repeated table entries, choices and unsupported notices are retained; no capability becomes automatic.',
                'BasicPDF4/digital12/SRD12 references remain separate; Artificer requires separate source evidence, not project exclusion.',
                'No current user profile, runtime, owner stage or publication rights changed.']}


def build(root=Path('.')):
    texts={p:(root/p).read_text(encoding='utf-8').replace('\r\n','\n') for p in INPUTS};data=[json.loads(t) for t in texts.values()]
    result=crosswalk(*data);result['inputSha256']={p:sha(t.encode()) for p,t in texts.items()}
    result['generator']={'path':'scripts/review-basic-class-feature-crosswalk-2014.py','sha256':sha(Path(__file__).read_bytes().replace(b'\r\n',b'\n'))};return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=Path('.'));p.add_argument('--output');a=p.parse_args();d=build(a.root)
    if a.output:Path(a.output).write_bytes((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode('utf-8'))
    print(json.dumps(d['summary']))
