import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {choiceContainers,headingChoices,maneuverChoices,paragraphChoices,linkPactPrerequisites,totemChoices} from '../scripts/catalog-class-choice-metadata.mjs';
const sources=[{title:"Player's Handbook",sourceId:102},{title:"Tasha's Cauldron of Everything",sourceId:117}];
const options={section:'choices',endSection:'end',classUrl:'https://dnd.su/class/104-warlock/',expectedTitles:['Choice']};
const html=(attrs='data-source="PH" data-level="5" data-pact="blade"',title='Choice')=>`<h2 id="choices">Choices</h2><div data-sort="element" ${attrs}><h3>${title}</h3></div><h2 id="end">End</h2>`;
test('choice metadata preserves prerequisites without claiming eligibility or rules',()=>{const [r]=choiceContainers(html(),options,sources);assert.equal(r.filterLevel,5);assert.equal(r.prerequisiteMetadata['data-pact'],'blade');assert.equal(r.sourceId,102);assert.equal(r.canonicalCatalogId,null);assert.equal(r.fullRules,'unverified');assert.equal(r.eligibility,'not-computed-from-filter');assert.equal(r.id,choiceContainers(html(),options,sources)[0].id);});
test('default source and zero filter level do not become automatic eligibility',()=>{const [r]=choiceContainers(html('data-level="0"'),{...options,defaultSource:'TCE'},sources);assert.equal(r.sourceId,117);assert.equal(r.filterLevel,0);assert.equal(r.sourceBasis,'class-page-source');assert.equal(r.eligibility,'not-computed-from-filter');});
test('unknown sources, malformed levels, missing boundaries and unexpected titles fail closed',()=>{for(const bad of [html('data-source="UNKNOWN" data-level="5"'),html('data-source="PH" data-level="21"'),html('data-source="PH" data-level="-1"'),html('data-source="PH"'),html().replace('id="end"','id="else"'),html(undefined,'Other')])assert.throws(()=>choiceContainers(bad,options,sources));});
test('missing or duplicate choices cannot silently shrink the enumeration',()=>{assert.throws(()=>choiceContainers(html(),{...options,expectedTitles:['Choice','Missing']},sources));assert.throws(()=>choiceContainers(html().replace('</div>','</div><div data-sort="element" data-source="PH" data-level="5"><h3>Choice</h3></div>'),options,sources));});
test('saved choices remain separate observations with unique IDs and source evidence',()=>{const d=JSON.parse(readFileSync(new URL('../catalog/dndsu-class-choice-metadata.json',import.meta.url)));assert.deepEqual(d.groups.map(g=>g.records.length),[54,16,17,11,7,7,10,4,23,8,6,5,5,5,3,3,2,3]);const records=d.groups.flatMap(g=>g.records);assert.equal(new Set(records.map(r=>r.id)).size,189);for(const r of records){assert.ok(r.sourceId);assert.equal(r.canonicalCatalogId,null);assert.equal(r.fullRules,'unverified');}});

test('nested choices inherit only explicit TCE markers and stop at the next feature',()=>{
 const page={url:'https://dnd.su/class/91-fighter/',headings:[{level:3,anchors:['style']},{level:4,title:'Core',optionalSourceTags:[]},{level:4,title:'Optional',optionalSourceTags:['TCE']},{level:3,title:'Next',anchors:[]},{level:4,title:'Unrelated'}]};
 const rs=headingChoices(page,'style',sources);assert.deepEqual(rs.map(r=>r.sourceId),[102,117]);assert.ok(rs.every(r=>r.filterLevel===null));assert.throws(()=>headingChoices(page,'missing',sources));
 page.headings[2].optionalSourceTags=['UA'];assert.throws(()=>headingChoices(page,'style',sources));
});

test('elemental labels verify names and stated levels across both emphasis forms',()=>{
 const o={...options,defaultSource:'PH',titleAttribute:true};
 const document=(level=6,title='Choice')=>`<h2 id="choices">Choices</h2><div data-sort="element" data-rname="Choice" data-level="${level}"><p><em><strong>${title} (требуется 6 уровень).</strong></em>Rules omitted.</p></div><h2 id="end">End</h2>`;
 assert.equal(choiceContainers(document(),o,sources)[0].filterLevel,6);
 assert.throws(()=>choiceContainers(document(11),o,sources),/Contradictory/);
 assert.throws(()=>choiceContainers(document(6,'Wrong'),o,sources),/Mismatched/);
});

test('maneuver section distinguishes PHB and TCE and excludes body emphasis',()=>{
 const html='<h2 id="maneuvers">List</h2><p><strong>Core.</strong> Text <strong>not a choice</strong>.</p><h3>Варианты приёмов</h3><p><em><span title="option.TCE">optional</span></em></p><p><strong>Extra .</strong> Text.</p><h2 id="martial-archetypes">Next</h2><p><strong>Outside.</strong></p>';
 const rs=maneuverChoices(html,'https://dnd.su/class/91-fighter/',sources);assert.deepEqual(rs.map(r=>[r.title,r.sourceId]),[['Core',102],['Extra',117]]);
 assert.throws(()=>maneuverChoices(html.replace('option.TCE','option.UA'),'url',sources));
 assert.throws(()=>maneuverChoices(html.replace('id="martial-archetypes"','id="other"'),'url',sources));
});

test('reviewed paragraph labels preserve level qualifiers and ignore unrelated bold formulas',()=>{
 const html='<h2><span id="parent">Subclass</span></h2><h3>Choices</h3><p><strong>Save DC = 8</strong></p><p><strong>Rune (7-й уровень или выше).</strong> Body.</p><h3>Next</h3><p><strong>Outside.</strong></p>';
 const options={classUrl:'url',parentAnchor:'parent',headingTitle:'Choices',sourceTitle:"Player\'s Handbook",expectedTitles:['Rune']};
 const [r]=paragraphChoices(html,options,sources);assert.equal(r.prerequisiteMetadata.observedLabel,'Rune (7-й уровень или выше).');assert.equal(r.filterLevel,null);assert.equal(r.fullRules,'unverified');
 assert.throws(()=>paragraphChoices(html,{...options,expectedTitles:['Outside']},sources));
 assert.throws(()=>paragraphChoices(html.replace('id="parent"','id="wrong"'),options,sources));
});

test('pact prerequisite references require a unique boon in the same class and retain partial status',()=>{
 const boon={id:'boon',classUrl:'warlock',section:'feature.pact-boon',sourceAnchors:['pact.chain'],prerequisiteMetadata:{}};
 const invocation={id:'invocation',classUrl:'warlock',section:'invocations',prerequisiteMetadata:{'data-pact':'chain'}};
 const groups=linkPactPrerequisites([{records:[boon,invocation]}]);assert.equal(groups[0].records[1].prerequisiteReferences[0].observationId,'boon');assert.equal(groups[0].records[1].prerequisiteReferences[0].completeness,'partial-prerequisite-evidence');
 assert.throws(()=>linkPactPrerequisites([{records:[{...boon,classUrl:'other'},structuredClone(invocation)]}]));
 assert.throws(()=>linkPactPrerequisites([{records:[boon,{...boon,id:'duplicate'},structuredClone(invocation)]}]));
});
test('four pact boons preserve TCE talisman and link fifteen invocation filters',()=>{
 const d=JSON.parse(readFileSync(new URL('../catalog/dndsu-class-choice-metadata.json',import.meta.url)));const records=d.groups.flatMap(g=>g.records),boons=records.filter(r=>r.section==='feature.pact-boon');assert.equal(boons.length,4);assert.equal(boons.find(r=>r.sourceAnchors.includes('pact.talisman')).sourceId,'117');assert.equal(records.filter(r=>r.prerequisiteReferences).length,15);
});

test('totem options require SCAG evidence for elk/tiger and verify their feature level',()=>{
 const sourceList=[...sources,{title:"Sword Coast Adventurer's Guide",sourceId:'scag'}];const body='<h2><span id="primal.totem-warrior">Totem</span></h2><h3>ТОТЕМНЫЙ ДУХ</h3><p><em>3-й уровень</em></p>'+['Волк','Медведь','Орёл','Лось','Тигр'].map(title=>'<p><em style=""><strong>'+title+'</strong></em>'+(['Лось','Тигр'].includes(title)?' (Источник: «Sword Coast Adventurer’s Guide»).':' .')+'</p>').join('')+'<h3>Next</h3>';
 const config={classUrl:'class',headingTitle:'ТОТЕМНЫЙ ДУХ',choiceKey:'spirit',level:3};const rows=totemChoices(body,config,sourceList);assert.equal(rows.length,5);assert.deepEqual(rows.slice(3).map(r=>r.sourceId),['scag','scag']);assert.throws(()=>totemChoices(body.replaceAll('Sword Coast Adventurer’s Guide','Unknown'),config,sourceList));assert.throws(()=>totemChoices(body,{...config,level:6},sourceList));
});
test('repeated totem animals have different identities by feature and hunter options retain levels',()=>{
 const d=JSON.parse(readFileSync(new URL('../catalog/dndsu-class-choice-metadata.json',import.meta.url))).groups.flatMap(g=>g.records);const wolves=d.filter(r=>r.section==='primal.totem-warrior'&&r.title==='Волк');assert.equal(new Set(wolves.map(r=>r.id)).size,3);assert.deepEqual(wolves.map(r=>r.observedInitialLevel),[3,6,14]);const hunter=d.filter(r=>r.section==='archetype.hunter');assert.equal(hunter.length,11);assert.deepEqual([...new Set(hunter.map(r=>r.observedInitialLevel))],[3,7,11,15]);assert.ok(hunter.every(r=>r.sourceId==='102'&&r.fullRules==='unverified'));
});
