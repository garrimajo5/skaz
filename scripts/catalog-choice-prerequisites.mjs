import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
import {choiceContainersWithBody} from './catalog-choice-spell-references.mjs';
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const sha=s=>createHash('sha256').update(s).digest('hex');
export function prerequisiteProposal(text,{classKey,pacts,spells}){
 if(text===null)return {allOf:[],explicitMinimumClassLevel:null};
 if(!text.startsWith('Требование:'))throw Error('Unknown requirement label');
 const tokens=text.slice('Требование:'.length).trim().split(/,\s*/),allOf=[];let explicitMinimumClassLevel=null;
 const spell=en=>{const found=spells.filter(s=>s.en.toLowerCase()===en);if(found.length!==1)throw Error('Unknown prerequisite spell');return found[0].pageId;};
 for(const token of tokens){
  const level=token.match(/^(\d+)(?:-й)? уровень (колдуна|изобретателя)$/u);
  if(level){if(explicitMinimumClassLevel!==null||Number(level[1])<1||Number(level[1])>20||level[2]!==({warlock:'колдуна',artificer:'изобретателя'})[classKey])throw Error('Wrong or duplicate class-level requirement');explicitMinimumClassLevel=Number(level[1]);allOf.push({kind:'class-level',classKey,minimum:explicitMinimumClassLevel});continue;}
  const pact=token.match(/^умение «(Договор [^»]+)»$/u);
  if(pact){if(classKey!=='warlock')throw Error('Pact prerequisite in wrong class');const found=pacts.filter(p=>p.title===pact[1]);if(found.length!==1)throw Error('Unresolved pact prerequisite');allOf.push({kind:'selected-pact',choiceObservationId:found[0].id,pactKey:found[0].sourceAnchors[0].replace('pact.','')});continue;}
  if(token==='заговор мистический заряд [eldritch blast]'){allOf.push({kind:'known-cantrip',spellPageId:spell('eldritch blast')});continue;}
  if(token==='заклинание сглаз [hex] или способность колдуна к проклятию'){allOf.push({anyOf:[{kind:'known-spell',spellPageId:spell('hex')},{kind:'class-feature-capability',classKey:'warlock',capability:'curse',resolution:'specific-feature-not-yet-mapped'}]});continue;}
  throw Error('Unreviewed prerequisite clause: '+token);
 }
 if(new Set(allOf.map(p=>JSON.stringify(p))).size!==allOf.length)throw Error('Duplicate prerequisite predicate');
 return {allOf,explicitMinimumClassLevel};
}
export function itemTargetProposal(text){
 if(!text?.startsWith('Предмет:'))throw Error('Missing infusion item clause');
 const attunement=/\(требуе(?:т|тся) настройк[аи]\)/u.test(text)?'required-by-item-clause':'not-stated-in-item-clause';
 const phrase=text.slice(8).replace(/\(требуе(?:т|тся) настройк[аи]\)/gu,'').trim();
 const known=new Map([
 ['любое простое или воинское оружие со свойством « метательное »',{categories:['simple-weapon','martial-weapon'],requiredProperty:'thrown'}],
 ['простое или воинское оружие со свойством « боеприпас »',{categories:['simple-weapon','martial-weapon'],requiredProperty:'ammunition'}],
 ['простое или воинское оружие',{categories:['simple-weapon','martial-weapon']}],
 ['доспех',{categories:['armor']}],['доспехи или щит',{categories:['armor','shield']}],['щит',{categories:['shield']}],
 ['кольцо',{categories:['ring']}],['пара сапог',{categories:['boots'],requiresPair:true}],['шлем',{categories:['helmet']}],
 ['жезл, посох или палочка',{categories:['rod','staff','wand']}],['доспех или ряса',{categories:['armor','robes']}],
 ['драгоценный камень или кристалл стоимостью не менее 100 зм',{categories:['gem','crystal'],minimumValueGp:100}]
 ]);
 const target=known.get(phrase);if(!target)throw Error('Unreviewed infusion item clause: '+phrase);
 return {...target,attunement,consumption:'not-inferred-from-item-clause'};
}
export function choicePrerequisites(html,{section,endSection,classKey,choices,pacts,spells}){
 html=html.replace(/<!--[\s\S]*?-->/g,'');const start=html.indexOf('class="card__body new-article"'),end=html.indexOf('<div class="card__footer"',start);if(start<0||end<=start)throw Error('Missing prerequisite article');html=html.slice(start,end);
 const anchors=[...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)],from=anchors.filter(a=>a[2]===section),to=anchors.filter(a=>a[2]===endSection);if(from.length!==1||to.length!==1||to[0].index<=from[0].index)throw Error('Ambiguous prerequisite section');
 const records=[],seen=new Set();
 for(const c of choiceContainersWithBody(html.slice(from[0].index,to[0].index))){
  const title=clean(c.body.match(/<h[34]\b[^>]*>([\s\S]*?)<\/h[34]>/)?.[1]||''),matches=choices.filter(r=>r.section===section&&r.title===title);if(matches.length!==1||seen.has(matches[0].id))throw Error('Unmapped or duplicate choice');const choice=matches[0];seen.add(choice.id);
  const paragraphs=[...c.body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map(m=>clean(m[1])),requirements=paragraphs.filter(p=>p.startsWith('Требование:')),items=paragraphs.filter(p=>p.startsWith('Предмет:'));if(requirements.length>1||items.length>1)throw Error('Ambiguous prerequisite paragraphs');
  const prerequisites=prerequisiteProposal(requirements[0]??null,{classKey,pacts,spells}),pact=prerequisites.allOf.find(p=>p.kind==='selected-pact');
  if((c.attributes['data-pact']??null)!==(pact?.pactKey??null))throw Error('Pact text/filter conflict');
  const expectedFilter=prerequisites.explicitMinimumClassLevel??(pact?3:0);if(choice.filterLevel!==expectedFilter||Number(c.attributes['data-level'])!==expectedFilter)throw Error('Level text/filter conflict');
  let itemTarget=null;if(classKey==='artificer'){if(!items.length&&title!=='КОПИЯ МАГИЧЕСКОГО ПРЕДМЕТА')throw Error('Missing infusion target');itemTarget=items.length?itemTargetProposal(items[0]):{selectionManifest:'catalog/dndsu-replicate-item-options.json',tableIsExhaustive:false};}else if(items.length)throw Error('Unexpected invocation item clause');
  records.push({choiceObservationId:choice.id,title,classUrl:choice.classUrl,sourceId:choice.sourceId,prerequisites,itemTarget,filterLevel:choice.filterLevel,filterInterpretation:pact&&prerequisites.explicitMinimumClassLevel===null?'pact-access-level-not-explicit-invocation-level':'matches-explicit-level-or-no-extra-level',requirementParagraphSha256:requirements.length?sha(requirements[0]):null,itemParagraphSha256:items.length?sha(items[0]):null,evidenceTextSha256:sha(clean(c.body)),eligibility:'not-computed',approval:'awaiting-independent-game-design-review',automation:'not-applied',fullRules:'unverified',pending:['base-class-access-and-choice-capacity','specific-curse-capability-mapping','complete-use-conditions-and-exceptions']});
 }
 if(records.length!==choices.filter(c=>c.section===section).length)throw Error('Incomplete prerequisite coverage');return records;
}
export function buildChoicePrerequisites(directory){const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url))),choices=read('dndsu-class-choice-metadata.json').groups.flatMap(g=>g.records),pacts=choices.filter(c=>c.section==='feature.pact-boon'),spells=read('dndsu-spell-index-metadata.json').records,records=[];
 for(const [id,section,endSection,classKey] of [[104,'invocations','patrons','warlock'],[137,'infusions','specialists','artificer']])records.push(...choicePrerequisites(readFileSync(directory+'/class-'+id+'.html','utf8'),{section,endSection,classKey,choices,pacts,spells}));
 return {schemaVersion:1,status:'choice-prerequisite-proposals-not-eligibility-engine',summary:{choices:records.length,explicitClassLevels:records.filter(r=>r.prerequisites.explicitMinimumClassLevel!==null).length,pactPrerequisites:records.filter(r=>r.prerequisites.allOf.some(p=>p.kind==='selected-pact')).length,alternativePrerequisites:records.filter(r=>r.prerequisites.allOf.some(p=>p.anyOf)).length,itemClauses:records.filter(r=>r.itemParagraphSha256).length},records};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: class-directory output.json');const r=buildChoicePrerequisites(directory);writeFileSync(output,JSON.stringify(r,null,2)+'\n');console.log(r.summary);}
