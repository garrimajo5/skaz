import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {decode} from './catalog-additional-discovery.mjs';
const clean=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const sha=s=>createHash('sha256').update(s).digest('hex');
export function spellGrantProposal(html,tables){
 if(!tables.length)return [];
 html=html.replace(/<!--[\s\S]*?-->/g,'');
 const articleStart=html.indexOf('class="card__body new-article"'),articleEnd=html.indexOf('<div class="card__footer"',articleStart);
 if(articleStart<0||articleEnd<articleStart)throw Error('Missing spell policy article');html=html.slice(articleStart,articleEnd);
 const heads=[...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)];
 const classUrl=tables[0].classUrl,id=Number(classUrl.match(/\/class\/(\d+)/)?.[1]);
 if(tables.some(t=>t.classUrl!==classUrl))throw Error('Mixed class tables');
 if(new Set(tables.map(t=>t.id)).size!==tables.length)throw Error('Duplicate spell policy table');
 const parents=[...new Set(tables.map(t=>t.parent))];
 const find=anchor=>{const matches=heads.map((h,index)=>({h,index})).filter(({h})=>[...h[1].matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].some(a=>a[2]===anchor));if(matches.length>1)throw Error('Duplicate spell grant parent');return matches[0]?.index??-1;};
 const first= Math.min(...parents.map(p=>{const i=find(p);if(i<0)throw Error('Missing spell grant parent');return heads[i].index;}));
 const bodyStart=html.indexOf('class="card__body new-article"');if(bodyStart<0)throw Error('Missing class body');
 return parents.map(parent=>{
  const i=find(parent),segment=html.slice(heads[i].index,heads[i+1]?.index),local=clean(segment),base=clean(html.slice(bodyStart,first));
  const chosen=tables.filter(t=>t.parent===parent),policy={classUrl,parent,tableIds:chosen.map(t=>t.id),tableSourceIds:[...new Set(chosen.flatMap(t=>t.sourceIds))],ruleScope:'table-grants-only',approval:'awaiting-independent-game-design-review',automation:'not-applied',fullRules:'unverified',pending:['non-table-spell-grants','all-replacement-and-casting-exceptions','subclass-eligibility']};
  let evidence=local,checks=[];
  if(id===105){
   Object.assign(policy,{grantMode:'undetermined-matrix-availability',selection:'not-encoded',pending:['matrix-availability-and-GM-permission','non-table-spell-grants']});checks=[/Дюнамантия/iu,/Хронургия/iu,/Гравитургия/iu];
  }else if(id===104){
   Object.assign(policy,{grantMode:'expanded-class-selection-list',automaticallyKnown:false,selection:parent==='patron.genie'?'general-column-plus-chosen-genie-kind':'selection-through-normal-class-learning'});
   checks=[/изуч|узна/iu,/заклинан/iu,/спис/iu];
  }else if([89,94,137,90].includes(id)){
   Object.assign(policy,{grantMode:'always-prepared',countsAgainstPreparedLimit:false,selection:parent==='circle.land'?'choose-one-terrain-table':'table-rows-at-required-class-level'});
   if([89,94].includes(id)){evidence=base;policy.ruleSourceIds=['102'];policy.evidenceScope='base-class-spell-rule';}
   checks=[/подготовлен/iu,/не учитыва/iu];
   if(parent==='circle.land')checks.push(/Необходимо выбрать болото/iu);
   if(parent==='circle.spores'){
    checks.push(/2-м уровне вы изучаете заговор/iu);
    policy.rowExceptions=[{selector:'2',grantMode:'learned-cantrip',countsAgainstCantripLimit:'not-certified',reason:'explicit-cantrip-grant-before-prepared-spell-rule'}];
   }
  }else if(id===97){
   Object.assign(policy,{grantMode:'additional-known',countsAgainstKnownSpellLimit:false,selection:'table-rows-at-required-class-level'});checks=[/узна[её]те|изучаете/iu,/не учитыва/iu];
   if(parent==='archetype.swarmkeeper'){
    checks.push(/изучаете заговор/iu,/если не знали его/iu);
    policy.cantripException={grantMode:'learned-if-not-already-known',countsAgainstCantripLimit:'not-certified'};
   }
  }else if(id===101){
   Object.assign(policy,{grantMode:parent==='origin.divine-soul'?'one-choice-additional-known':'additional-known',countsAgainstKnownSpellLimit:false,selection:parent==='origin.divine-soul'?'choose-one-affinity-row':'all-table-columns-at-required-class-level'});
   checks=[/узна[её]те|изучаете/iu,/не учитыва/iu];
   if(parent==='origin.divine-soul')checks.push(/выберите склонность/iu);
   if(parent==='origin.lunar-sorcery'){
    checks.push(/фаза луны/iu,/заклинание 1-го уровня соответствующей фазы/iu,/один раз, не тратя ячейки/iu);
    policy.phaseSelection={affects:'specified-free-casting-and-other-feature-effects',doesNotFilterLearnedTableSpells:true,fullCastingRules:'not-encoded'};
   }
  }else throw Error('Unreviewed spell grant class');
  if(checks.some(pattern=>!pattern.test(evidence)))throw Error('Missing spell grant evidence: '+parent);
  return {...policy,evidenceScope:policy.evidenceScope||'subclass-section',evidenceTextSha256:sha(evidence)};
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,directory,output]=process.argv;if(!directory||!output)throw Error('Usage: class-html-directory output.json');
 const path=new URL('../catalog/dndsu-subclass-spell-tables.json',import.meta.url),bytes=readFileSync(path),tables=JSON.parse(bytes),records=[];
 for(const c of tables.classes){const html=readFileSync(directory+'/class-'+c.classUrl.match(/\/class\/(\d+)/)[1]+'.html','utf8');records.push(...spellGrantProposal(html,c.tables));}
 writeFileSync(output,JSON.stringify({schemaVersion:1,status:'content-policy-proposal-not-runtime-rules',tableManifestSha256:sha(bytes),records},null,2)+'\n');console.log({policies:records.length,tables:records.reduce((n,r)=>n+r.tableIds.length,0)});
}
