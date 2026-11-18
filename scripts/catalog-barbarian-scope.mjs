import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {classScope} from './catalog-class-scope-proposal.mjs';
export const barbarianSpec={key:'barbarian',url:'https://dnd.su/class/87-barbarian/',baseSection:'klassovye_umeniya',subclasses:['primal.berserker','primal.totem-warrior','primal.battlerager','primal.storm-herald','primal.ancestral-guardian','primal.zealot','primal.wild-magic','primal.beast','primal.giant'],defaultSourceSubclasses:['primal.berserker','primal.totem-warrior'],optionalAnchors:['feature.primal-knowledge','feature.instinctive-pounce'],exclusions:[],overrides:[{parent:'primal.battlerager',title:'ОГРАНИЧЕНИЕ: ТОЛЬКО ДЛЯ ДВАРФОВ',kind:'subclass-prerequisite'},{parent:'primal.battlerager',title:'Шипованный доспех',kind:'equipment-reference'}]};
export const barbarianScope=(page,sources)=>classScope(page,sources,barbarianSpec);
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const navigation=JSON.parse(readFileSync(new URL('../catalog/dndsu-class-headings.json',import.meta.url))),sources=JSON.parse(readFileSync(new URL('../catalog/dndsu-source-register.json',import.meta.url))).sources;
 const output={schemaVersion:1,observedOn:navigation.observedOn,...barbarianScope(navigation.pages.find(p=>p.className==='Варвар'),sources)};
 writeFileSync(process.argv[2]||new URL('../catalog/dndsu-barbarian-scope-proposal.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(output.summary);
}
