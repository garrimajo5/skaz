import {readFileSync} from 'node:fs';
import {classProgression} from './class-progression.mjs';
const data=JSON.parse(readFileSync(new URL('../catalog/srd51-subclass-reference.json',import.meta.url),'utf8'));
const tableKey=t=>t.sourceHeading.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
// Pure planning only. These functions never confirm a subclass or write a spellbook.
export function subclassReferenceOptions(classId,level){
 const c=classProgression(classId,level);
 return data.subclasses.filter(s=>s.classId===classId).map(s=>({id:s.id,classId,name:s.name,ruleset:data.ruleset,sourcePage:s.sourcePage,source:structuredClone(data.source),minimumLevel:c.subclassLevel,eligible:level>=c.subclassLevel,requiresExplicitConfirmation:true}));
}
export function previewSubclassSpells({classId,subclassId,level,tableId=null}){
 const c=classProgression(classId,level),subclass=data.subclasses.find(s=>s.id===subclassId&&s.classId===classId);
 if(!subclass)throw new Error('Подкласс не относится к подтверждённому классу SRD 2014');
 if(level<c.subclassLevel)throw new Error('Подкласс ещё недоступен на этом уровне класса');
 const tables=subclass.spellTables||[],multiple=tables.length>1;
 const firstLevel=multiple?Math.min(...tables.flatMap(t=>t.rows.map(r=>r.level))):null;
 const tableChoices=multiple?tables.map(t=>({id:tableKey(t),name:t.name,sourcePage:t.sourcePage,minimumLevel:firstLevel})):[];
 if(tableId!==null&&(!multiple||level<firstLevel||!tableChoices.some(t=>t.id===tableId)))throw new Error('Выбор таблицы заклинаний не относится к этому подклассу или уровню');
 if(multiple&&level>=firstLevel&&tableId===null)throw new Error('Явно выбери одну местность Круга земли; объединять списки нельзя');
 const selected=multiple?(tableId===null?[]:tables.filter(t=>tableKey(t)===tableId)):tables;
 const alwaysPrepared=[],expandedChoices=[];
 for(const table of selected){
  if(!['class','spell'].includes(table.levelKind)||!['always-prepared','expanded-list'].includes(table.mode))throw new Error('Неизвестная семантика таблицы подкласса');
  const threshold=table.levelKind==='class'?level:c.progression.pactSlotLevel;
  if(!Number.isSafeInteger(threshold))throw new Error('Для таблицы не определён доступный круг заклинаний');
  for(const row of table.rows.filter(r=>r.level<=threshold))for(const catalogId of row.spellIds){
   const target=table.mode==='always-prepared'?alwaysPrepared:expandedChoices;
   target.push({catalogId,name:structuredClone(data.spellNames[catalogId]),subclassId,tableId:tableKey(table),sourcePage:table.sourcePage,threshold:row.level,thresholdKind:table.levelKind});
  }
 }
 return {ruleset:data.ruleset,classId,subclassId,level,tableId,tableChoices,alwaysPrepared,expandedChoices,source:structuredClone(data.source),applied:false};
}
