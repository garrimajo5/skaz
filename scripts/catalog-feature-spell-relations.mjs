import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
import {normalizeName} from './audit-dndsu-names.mjs';
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const sha=s=>createHash('sha256').update(s).digest('hex');
// Explicit content proposals. No default rule treats a spell hyperlink as a grant.
export const relationSpecs=[
 [88,'class-features','ИСПОЛЬЗОВАНИЕ ЗАКЛИНАНИЙ','Cure Wounds','example-not-grant',/Например/iu],
 [88,'college.glamour','МАНТИЯ ВЕЛИЧИЯ','Command','feature-casting-not-known-grant',/концентрац/iu],
 [88,'college.spirits','Направляющий шёпот','Guidance','learned-cantrip',/изучаете заговор/iu],
 [87,'primal.totem-warrior','ИСКАТЕЛЬ ДУХОВ','Beast Sense|Speak with Animals','ritual-only-access',/только в виде ритуалов/iu],
 [87,'primal.totem-warrior','ГУЛЯЮЩИЙ С ДУХАМИ','Commune with Nature','ritual-access-not-known-grant',/в качестве ритуала/iu],
 [87,'primal.ancestral-guardian','СОВЕТ ПРЕДКОВ','Augury|Clairvoyance','feature-casting-choice',/короткий или продолжительный отдых/iu],
 [87,'primal.zealot','ВОИН БОГОВ','Raise Dead','beneficiary-effect-not-grant',/заклинателю не требуются/iu],
 [87,'primal.giant','Сила великана','Druidcraft|Thaumaturgy','choose-one-cantrip',/один заговор по вашему выбору/iu],
 [105,'tradition.illusion','УЛУЧШЕННАЯ МАЛАЯ ИЛЛЮЗИЯ','Minor Illusion','learn-cantrip-with-known-replacement-choice',/любой другой заговор/iu],
 [105,'tradition.necromancy','НЕЖИВЫЕ РАБЫ','Animate Dead','spellbook-add-if-absent',/книгу заклинаний/iu],
 [105,'tradition.abjuration','УЛУЧШЕННОЕ ОГРАЖДЕНИЕ','Counterspell|Dispel Magic','modifies-existing-casting-not-grant',/добавляете.*бонус мастерства/iu],
 [105,'tradition.transmutation','ПЕРЕВЁРТЫШ','Polymorph','spellbook-add-if-absent-with-special-casting',/только себя/iu],
 [105,'tradition.transmutation','ГЕНИЙ ПРЕОБРАЗОВАНИЯ','Raise Dead','feature-casting-not-spellbook-grant',/без необходимости иметь/iu],
 [105,'tradition.war-magic','ВСПЛЕСК МОЩИ','Dispel Magic|Counterspell','existing-casting-trigger-not-grant',/получаете один всплеск/iu],
 [105,'tradition.scribes','Пробуждение разума','Dispel Magic','countermeasure-not-grant',/прерывается/iu],
 [104,'class-features','МАГИЯ ДОГОВОРА','Witch Bolt','example-not-grant',/Например/iu],
 [104,'class-features','ПРЕДМЕТ ДОГОВОРА','Find Familiar','learned-if-pact-chain-selected',/Договор цепи/iu],
 [104,'patron.great-old-one','СОЗДАТЬ РАБА','Remove Curse','countermeasure-not-grant',/до тех пор/iu],
 [104,'patron.undying','СРЕДИ МЁРТВЫХ','Spare the Dying','learned-cantrip',/изучаете заговор/iu],
 [104,'patron.undying','СРЕДИ МЁРТВЫХ','Fireball','example-not-grant',/например/iu],
 [104,'patron.undying','ОТРИНУВ СМЕРТЬ','Spare the Dying','existing-casting-trigger-not-grant',/стабилизируете/iu],
 [104,'patron.celestial','ДОПОЛНИТЕЛЬНЫЕ ЗАГОВОРЫ','Light|Sacred Flame','learned-cantrip',/не учитываются/iu],
 [104,'patron.fathomless','Опутывающие щупальца',"Evard's Black Tentacles",'learned-spell-with-special-casting',/не учитывается/iu],
 [90,'class-features','Использование заклинаний','Cure Wounds','example-not-grant',/Например/iu],
 [90,'class-features','Дикий облик','Call Lightning','existing-casting-interaction-not-grant',/концентраци/iu],
 [90,'class-features','Дикий спутник','Find Familiar','feature-casting-not-known-grant',/Дикий облик/iu],
 [90,'circle.land','ТРОПАМИ ЗЕМЛИ','Entangle','defence-example-not-grant',/спасброски/iu],
 [90,'circle.moon','ТЫСЯЧА ЛИЦ','Alter Self','unlimited-feature-casting-not-known-grant',/неограниченно/iu],
 [90,'circle.shepherd','ВЕРНЫЕ ПРИЗВАННЫЕ','Conjure Animals','triggered-effect-as-spell-not-known-grant',/получить эффекты/iu],
 [90,'circle.dreams','СТРАННИК ВО СНАХ','Dream|Scrying','feature-casting-choice',/короткий отдых/iu],
 [90,'circle.stars','Звёздная карта','Guidance','learned-cantrip-while-holding-map',/Держа эту карту/iu],
 [90,'circle.stars','Звёздная карта','Guiding Bolt','always-prepared-while-holding-map-with-special-casting',/всегда считается подготовленным/iu],
 [90,'circle.spores','Заклинания круга','Chill Touch','learned-cantrip',/изучаете заговор/iu],
 [89,'features','Использование заклинаний','Cure Wounds','example-not-grant',/Например/iu],
 [89,'domain.knowledge','БОЖЕСТВЕННЫЙ КАНАЛ: ЧТЕНИЕ МЫСЛЕЙ','Suggestion','feature-casting-not-known-grant',/окончить этот эффект/iu],
 [89,'domain.light','ДОПОЛНИТЕЛЬНЫЙ ЗАГОВОР','Light','learned-cantrip-if-absent',/если еще не имели/iu],
 [89,'domain.arcana','БОЖЕСТВЕННЫЙ КАНАЛ: ОГРАЖДЕНИЕ МАГИЕЙ','Banishment','effect-as-spell-not-known-grant',/как заклинание/iu],
 [89,'domain.grave','КРУГ СМЕРТИ','Spare the Dying','learned-cantrip-with-modified-casting',/изучаете заговор/iu],
 [137,'specialist.alchemist','ВОССТАНАВЛИВАЮЩИЕ РЕАГЕНТЫ','Lesser Restoration','feature-casting-without-preparation',/без подготовки/iu],
 [137,'specialist.alchemist','ХИМИЧЕСКОЕ МАСТЕРСТВО','Greater Restoration|Heal','feature-casting-without-preparation',/подготовки/iu],
 [137,'specialist.artillerist','МИСТИЧЕСКАЯ ПУШКА','Mending','repair-interaction-not-grant',/восстанавливает 2к6/iu],
 [137,'specialist.battlesmith','СТАЛЬНОЙ ЗАЩИТНИК','Mending','repair-interaction-not-grant',/восстанавливает 2к6/iu],
 [93,'class-features','Увёртливость','Fireball','defence-example-not-grant',/спасбросок/iu],
 [93,'class-features','Пустое тело','Astral Projection','feature-casting-not-known-grant',/8 очков ци/iu],
 [93,'tradition.open-hand','УМИРОТВОРЕНИЕ','Sanctuary','effect-as-spell-not-known-grant',/получаете эффект/iu],
 [93,'tradition.shadow','ТЕХНИКА ТЕНИ','Pass without Trace|Darkvision|Silence|Darkness','feature-casting-choice',/2 очка ци/iu],
 [93,'tradition.shadow','ТЕХНИКА ТЕНИ','Minor Illusion','learned-cantrip-if-absent',/если вы еще не знаете/iu],
 [93,'tradition.sun-soul','УДАР ПЫЛАЮЩЕЙ ДУГИ','Burning Hands','feature-casting-not-known-grant',/действия Атака/iu],
 [91,'archetype.eldritch-knigh','ИСПОЛЬЗОВАНИЕ ЗАКЛИНАНИЙ','Shield','example-not-grant',/Например/iu],
 [91,'archetype.arcane-archer','ЗНАНИЯ МИСТИЧЕСКОГО ЛУЧНИКА','Prestidigitation|Druidcraft','choose-one-cantrip',/учите заговор/iu],
 [91,'archetype.psi-warrior','Мастер телекинеза','Telekinesis','feature-casting-not-known-grant',/кость псионической энергии/iu],
 [93,'tradition.four-elements','АДЕПТ СТИХИЙ','Burning Hands','choice-casting-example-not-automatic-grant',/например/iu],
 [94,'klassovye_umeniya','БОЖЕСТВЕННОЕ ЧУВСТВО','Hallow','detection-example-not-grant',/например/iu],
 [94,'klassovye_umeniya','Использование заклинаний','Cure Wounds','example-not-grant',/Если вы подготовили/iu],
 [94,'oath.devotion','ЧИСТОТА ДУХА','Protection from Evil and Good','permanent-effect-not-known-grant',/всегда находитесь под эффектом/iu],
 [99,'class-features','УВЁРТЛИВОСТЬ','Ice Storm','defence-example-not-grant',/например/iu],
 [99,'archetype.arcane-trickster','ИСПОЛЬЗОВАНИЕ ЗАКЛИНАНИЙ','Mage Hand','learned-cantrip',/волшебная рука/iu],
 [99,'archetype.arcane-trickster','ИСПОЛЬЗОВАНИЕ ЗАКЛИНАНИЙ','Charm Person','example-not-grant',/Например/iu],
 [99,'archetype.arcane-trickster','УЛУЧШЕННАЯ ВОЛШЕБНАЯ РУКА','Mage Hand','modifies-existing-casting-not-grant',/Когда вы накладываете/iu],
 [97,'class-features','Использование заклинаний','Animal Friendship','example-not-grant',/Например/iu],
 [97,'class-features','ТРОПАМИ ЗЕМЛИ','Entangle','defence-example-not-grant',/например/iu],
 [97,'archetype.hunter','УЛУЧШЕННАЯ ЗАЩИТА ОХОТНИКА','Lightning Bolt','defence-example-not-grant',/например/iu],
 [97,'archetype.horizon-walker','ЭФИРНЫЙ ШАГ','Etherealness','feature-casting-not-known-grant',/заканчивается в конце текущего хода/iu],
 [97,'archetype.fey-wanderer','Подкрепление фей','Summon Fey','learned-spell-with-special-casting',/вам известно заклинание/iu],
 [97,'archetype.fey-wanderer','Туманный странник','Misty Step','feature-casting-with-modified-target',/одно согласное существо/iu],
 [97,'archetype.swarmkeeper','Магия хранителя роя','Mage Hand','learned-cantrip-if-absent',/если не знали/iu],
 [97,'archetype.drakewarden','Драконий дар','Thaumaturgy','learned-cantrip',/узна[её]те заговор/iu],
 [101,'class-features','Использование заклинаний','Burning Hands','example-not-grant',/Например/iu],
 [101,'class-features','Метамагия','Magic Missile|Scorching Ray|Ray of Frost|Chromatic Orb','metamagic-example-not-grant',/Например/iu],
 [101,'origin.shadow','ГЛАЗА ТЬМЫ','Darkness','learned-spell-at-level-three-with-special-casting',/3-го уровня/iu],
 [101,'origin.lunar-sorcery','Лунный Огонь','Sacred Flame','learned-cantrip-with-modified-target',/изучаете заговор/iu]
];
export function featureRelationProposals(directory,references,spellIndex,proposals,specs=relationSpecs){
 const records=[],covered=new Set(),texts=new Map();
 for(const [classId,parent,title,names,relationship,evidenceCheck] of specs){
  const c=references.classes.find(c=>Number(c.classUrl.match(/\/class\/(\d+)/)?.[1])===classId);if(!c)throw Error('Missing relation class');
  const ps=proposals.find(p=>p.classUrl===c.classUrl).records.filter(p=>p.parent===parent&&p.title===title);if(ps.length!==1)throw Error('Missing or ambiguous relation feature: '+title);const feature=ps[0];
  if(!texts.has(feature.id)){let html=readFileSync(directory+'/class-'+classId+'.html','utf8').replace(/<!--[\s\S]*?-->/g,'');html=html.slice(html.indexOf('class="card__body new-article"'),html.indexOf('<div class="card__footer"'));const heads=[...html.matchAll(/<h([234])\b[^>]*>([\s\S]*?)<\/h\1>/g)].filter(h=>clean(h[2]));const h=heads[feature.headingOrdinal-1];if(!h||clean(h[2])!==title)throw Error('Stale relation heading');const end=heads.find(n=>n.index>h.index&&Number(n[1])<=Number(h[1]));texts.set(feature.id,clean(html.slice(h.index+h[0].length,end?.index).replace(/<table\b[^>]*>[\s\S]*?<\/table>/g,'')));}
  const evidence=texts.get(feature.id);if(!evidenceCheck.test(evidence))throw Error('Missing relation evidence: '+title);
  for(const name of names.split('|')){const targets=spellIndex.records.filter(r=>normalizeName(r.en)===normalizeName(name));if(targets.length!==1)throw Error('Ambiguous spell name in reviewed spec: '+name);const spellId=targets[0].pageId,rs=c.records.filter(r=>r.featureId===feature.id&&r.reference.pageId===spellId);if(!rs.length)throw Error('Missing reviewed relation reference: '+name);for(const r of rs){if(covered.has(r.id))throw Error('Overlapping relation proposals');covered.add(r.id);}
   records.push({id:'feature-spell-relation:'+sha(feature.id+'\n'+spellId).slice(0,20),classUrl:c.classUrl,featureId:feature.id,featureTitle:title,parent,sourceIds:feature.sourceIds,spellPageId:spellId,referenceIds:rs.map(r=>r.id),relationship,evidenceTextSha256:sha(evidence),approval:'awaiting-independent-game-design-review',fullRules:'unverified',automation:'not-applied',pending:['complete-conditions-costs-and-exceptions','subclass-and-choice-eligibility','interaction-with-table-grants']});
  }
 }
 const all=references.classes.flatMap(c=>c.records),unclassified=all.filter(r=>r.reference.kind==='spell-page'&&!covered.has(r.id)).map(r=>({referenceId:r.id,featureId:r.featureId,reason:'not-yet-reviewed'}));
 return {schemaVersion:1,status:'feature-spell-relationship-proposals-not-runtime-rules',summary:{relations:records.length,classifiedReferences:covered.size,unclassifiedSpellReferences:unclassified.length,unresolvedSearchLinks:all.filter(r=>r.reference.kind==='spell-search-navigation').length,excludedListLinks:all.filter(r=>r.reference.kind==='spell-list-navigation').length},records,unclassified};
}
export function buildFeatureRelations(directory){const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));return featureRelationProposals(directory,read('dndsu-feature-spell-references.json'),read('dndsu-spell-index-metadata.json'),[read('dndsu-bard-scope-proposal.json'),read('dndsu-barbarian-scope-proposal.json'),...read('dndsu-reviewed-class-proposals.json').classes]);}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: class-html-directory output.json');const result=buildFeatureRelations(directory);writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(result.summary);}
