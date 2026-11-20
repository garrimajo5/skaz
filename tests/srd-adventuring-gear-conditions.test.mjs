import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const data=JSON.parse(raw('catalog/srd51-adventuring-gear-conditions-2014.json'));
const identityPath='catalog/equipment-identity-reconciliation.json';
const identities=JSON.parse(raw(identityPath));
const rule=name=>data.records.find(r=>r.heading===name).mechanics;

test('42 gear descriptions preserve52 unique existing item links and pinned evidence',()=>{
 assert.equal(data.records.length,42);assert.equal(new Set(data.records.map(r=>r.proposalId)).size,42);
 assert.equal(new Set(data.records.map(r=>r.heading)).size,42);
 const links=data.records.flatMap(r=>r.candidateItemIds);
 assert.equal(links.length,52);assert.equal(new Set(links).size,52);
 for(const id of links)assert.equal(identities.records.filter(r=>r.proposedCanonicalId===id).length,1,id);
 assert.deepEqual(data.inputSha256,{[identityPath]:createHash('sha256').update(raw(identityPath)).digest('hex')});
 assert.equal(data.source.sha256,'2504d2a0abb0a4d491a939be4f17910a2dde0312570ab8d208080225ccf0a1f0');
 assert.equal(data.source.license,'CC-BY-4.0');assert.ok(data.source.attribution.includes('Wizards of the Coast LLC'));
 assert.ok(data.records.every(r=>[66,67,68].includes(r.sourcePage)&&r.summaryRu&&r.accepted===false&&r.runtimeImported===false));
 const potion=identities.records.find(r=>r.proposedCanonicalId==='srd51:2014:item:potion-of-healing');
 assert.equal(potion.reusesRuntime,true);
});

test('hazard timing and recovery differ, without invented conditions or automatic health mutations',()=>{
 assert.equal(rule('Alchemist’s Fire').damage.timing,'start-of-target-turn');
 assert.equal(rule('Alchemist’s Fire').endEffect.rollType,'ability-check');
 assert.equal(rule('Hunting Trap').appliedCondition,null);assert.equal(rule('Poison, Basic').appliedCondition,null);
 assert.equal(rule('Hunting Trap').escape.failedCheckDamage.target,'trapped-creature');
 assert.equal(rule('Hunting Trap').movementLimit.kind,'chain-length');
 assert.equal(rule('Caltrops').onDamage.endsWhen,'regain-at-least-1-hit-point');
 assert.equal(rule('Caltrops').onFailure.stopMoving,'this-turn');
 assert.equal(rule('Ball Bearings').avoidSave,'move-at-half-speed');
 assert.equal(rule('Caltrops').avoidSave,'move-at-half-speed');
 const oil=rule('Oil');assert.equal(oil.actionScope,'splash-or-throw-only');assert.equal(oil.ground.action,null);
 assert.equal(oil.coatedTarget.trigger,'takes-fire-damage-before-oil-dries');
 assert.equal(oil.ground.maximumApplicationsPerCreaturePerTurn,1);
 assert.equal(rule('Healer’s Kit').healingHitPoints,0);assert.equal(rule('Healer’s Kit').result,'stabilize');
 assert.equal(rule('Antitoxin').useAction,null);assert.equal(rule('Antitoxin').automaticPoisonRemoval,false);
 assert.deepEqual(rule('Antitoxin').excludedCreatureTypes,['undead','construct']);
});

test('lights retain shape and extra dim distance rather than conflating total reach and radius',()=>{
 assert.equal(rule('Lantern, Bullseye').light.shape,'cone');
 for(const name of ['Candle','Lamp','Lantern, Hooded','Torch'])assert.equal(rule(name).light.shape,'radius');
 assert.deepEqual(rule('Lamp').light,{shape:'radius',brightFeet:15,additionalDimFeet:30});
 assert.deepEqual(rule('Lantern, Hooded').lowerHood,{action:'action',brightFeet:0,dimRadiusFeet:5});
 assert.equal(rule('Tinderbox').lighting[0].duration.unit,'action');
 assert.equal(rule('Tinderbox').lighting[1].duration.unit,'minute');
});

test('class focus restrictions and costly components remain reference rules with manual override',()=>{
 assert.deepEqual(rule('Arcane Focus').spellcastingFocus.classes,['sorcerer','warlock','wizard']);
 assert.deepEqual(rule('Druidic Focus').spellcastingFocus.classes,['druid']);
 assert.deepEqual(rule('Holy Symbol').spellcastingFocus.classes,['cleric','paladin']);
 assert.deepEqual(rule('Holy Symbol').spellcastingFocus.presentationAlternatives,['held-in-hand','worn-visibly','borne-on-shield']);
 assert.equal(rule('Component Pouch').automaticCostlyComponentGrant,false);
 assert.equal(rule('Component Pouch').otherSpellcastingConditions,'not-verified-by-this-excerpt');
 assert.equal(rule('Lock').pick.normalRequirement,'thieves-tools-proficiency');
 assert.equal(rule('Manacles').pick.normalRequirement,'thieves-tools-proficiency');
 assert.equal(data.applicationBoundary.ruleDeviation,'warn-and-allow-manual-override');
 for(const key of ['automaticInventoryGrant','automaticResourceSpend','automaticDamage','automaticConditionApplication'])assert.equal(data.applicationBoundary[key],false);
 assert.equal(data.complete,false);assert.equal(data.accepted,false);assert.equal(data.approvedDenominator,null);
});

test('capacity examples and lifting aids do not silently grant unrelated bonuses',()=>{
 assert.equal(rule('Case, Map or Scroll').alternativesAreAdditive,false);
 assert.equal(rule('Pouch').examplesAreAdditive,false);
 assert.equal(rule('Block and Tackle').automaticCarryCapacityMultiplier,false);
 assert.equal(rule('Spyglass').automaticVisionRangeMultiplier,false);
 assert.equal(rule('Scale, Merchant’s').automaticValuation,false);
 assert.equal(rule('Fishing Tackle').automaticCatch,false);
 assert.equal(rule('Book').automaticSpellGrant,false);
 assert.equal(rule('Spellbook').automaticSpellGrant,false);
 assert.equal(rule('Climber’s Kit').automaticFallDamageImmunity,false);
});
