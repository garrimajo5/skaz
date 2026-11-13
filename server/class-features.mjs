import {readFileSync} from 'node:fs';
const data=JSON.parse(readFileSync(new URL('../catalog/srd51-class-features.json',import.meta.url),'utf8'));
// Descriptions never replace the stable English keys used by advancement receipts.
export function classFeatureDetails(classId,keys){
 return keys.map(key=>{
  const feature=data.features.find(f=>f.classId===classId&&f.keys.includes(key));
  return feature?{key,...structuredClone(feature),source:structuredClone(data.source)}:{key,name:key,status:'unsupported',text:'Описание этого умения пока не подключено. Проверь правила отдельно.'};
 });
}
