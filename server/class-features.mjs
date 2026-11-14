import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../catalog/srd51-class-features.json',import.meta.url),'utf8'));
const subclassData=JSON.parse(readFileSync(new URL('../catalog/srd51-subclass-reference.json',import.meta.url),'utf8'));
function withSubclassReference(feature){
 const copy=structuredClone(feature),subclass=subclassData.subclasses.find(s=>s.parentId===feature.id&&s.classId===feature.classId);
 if(subclass)copy.referenceOptions=[...(copy.referenceOptions||[]),{
  key:subclass.id,name:subclass.name+' — справка SRD 2014',sourcePage:subclass.sourcePage,source:structuredClone(subclassData.source),
  text:'Один из подклассов SRD. Справка включает будущие уровни и не подтверждает выбранный подкласс. Выбор и эффекты в мастере пока не поддержаны.',
  referenceOptions:[...subclass.features.map(f=>({...f,name:f.name+' — '+f.level+' уровень',text:f.text+'\n\nПрименение и расход ресурсов учитываются вручную.'})),
   ...(subclass.spellTables||[]).map((table,index)=>({key:subclass.id+'-spells-'+index,name:table.name,sourcePage:table.sourcePage,
    text:(table.mode==='expanded-list'?'Эти заклинания доступны к выбору при изучении. Они не становятся известными или подготовленными автоматически.':'После получения по правилам подкласса эти заклинания всегда подготовлены и не входят в обычный предел подготовки. Мастер их пока не назначает.')+'\n\n'+table.rows.map(row=>(table.levelKind==='spell'?'Круг ':'Уровень класса ')+row.level+': '+row.spellIds.map(id=>subclassData.spellNames[id].ru+' / '+subclassData.spellNames[id].en).join('; ')+'.').join('\n\n')
   }))]

 }];
 return copy;
}
// Descriptions never replace the stable English keys used by advancement receipts.
export function classFeatureDetails(classId,keys){
 return keys.map(key=>{
  const feature=data.features.find(f=>f.classId===classId&&f.keys.includes(key));
  return feature?{key,...withSubclassReference(feature),source:structuredClone(data.source)}:{key,name:key,status:'unsupported',text:'Описание этого умения пока не подключено. Проверь правила отдельно.'};
 });
}
