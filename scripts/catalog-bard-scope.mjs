import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {classScope} from './catalog-class-scope-proposal.mjs';
export const bardSpec={key:'bard',url:'https://dnd.su/class/88-bard/',baseSection:'class-features',subclasses:['college.valor','college.lore','college.swords','college.glamour','college.whispers','college.eloquence','college.creation','college.spirits'],defaultSourceSubclasses:['college.valor','college.lore'],optionalAnchors:['feature.extra-spells','feature.magical-inspiration','feature.bardic-versatility'],overrides:[],exclusions:[{parent:'college.spirits',title:'Истории духов',reason:'Storytelling guidance, not a separate class feature; Spirit Tales table remains part of Tales from Beyond'}]};
export const bardScope=(page,sources)=>classScope(page,sources,bardSpec);

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const navigation=JSON.parse(readFileSync(new URL('../catalog/dndsu-class-headings.json',import.meta.url))),sources=JSON.parse(readFileSync(new URL('../catalog/dndsu-source-register.json',import.meta.url))).sources;
 const output={schemaVersion:1,observedOn:navigation.observedOn,...bardScope(navigation.pages.find(p=>p.className==='Бард'),sources)};
 writeFileSync(process.argv[2]||new URL('../catalog/dndsu-bard-scope-proposal.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(output.summary);
}
