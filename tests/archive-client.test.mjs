import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../client/archive.js',import.meta.url),'utf8');
function harness(){
 let key='one',html='',visible=true;const handlers={},requests=[],region={innerHTML:''};
 const context=vm.createContext({document:{addEventListener:(n,f)=>handlers[n]=f,getElementById:id=>id==='dialog'?{open:visible}:id==='archive-results'?region:html.includes('archive-loading')?{}:null},modal:value=>html=value,SkazStorage:{snapshotKey:()=>key,sessionReviewData:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))}});
 vm.runInContext(source,context);
 return{requests,region,html:()=>html,open:()=>vm.runInContext("SkazArchive.open('session-one',()=>{})",context),setKey:v=>key=v,close:()=>visible=false,
 change:(id,value)=>handlers.change({target:{id,value}}),search:value=>handlers.input({target:{id:'archive-search',value}}),click:id=>handlers.click({target:{closest:()=>({id})}})};
}
const item=(status='accepted')=>({id:'p-'+status,status,source:{speaker:'<img>',text:'<script>дым</script>',offsetMs:60000},suggestion:{kind:'personal-note',title:'Original',text:'Original text'},appliedEntry:status==='accepted'?{title:'Corrected',text:'Вернуть компас'}:null});
const data={session:{archived:true,name:'<img>',playedOn:null,data:{journal:[{title:'Journal',text:'Text',time:'00:01'}]}},characterName:'Hero',proposals:[item(),item('pending'),item('dismissed')]};
test('archive searches source and correction, shows pending truthfully, escapes text and has no apply actions',async()=>{
 const h=harness(),p=h.open();h.requests[0].resolve(data);await p;h.change('archive-section','events');
 assert.match(h.html(),/Не разобрано до завершения/);assert.match(h.html(),/Личная заметка/);assert.match(h.html(),/&lt;script&gt;/);assert.doesNotMatch(h.html(),/<script>|data-review-proposal|Подтвердить запись/);
 h.search('компас');assert.match(h.region.innerHTML,/Corrected/);assert.doesNotMatch(h.region.innerHTML,/Не разобрано/);
 h.search('дым');assert.match(h.region.innerHTML,/1–3 из 3/);h.change('archive-status','pending');assert.match(h.region.innerHTML,/Не разобрано до завершения/);assert.doesNotMatch(h.region.innerHTML,/Corrected/);
});
test('late archive response cannot reopen a closed dialog or replace another context',async()=>{
 const h=harness(),first=h.open();h.setKey('two');h.requests[0].resolve(data);await first;assert.doesNotMatch(h.html(),/ТОЛЬКО ЧТЕНИЕ/);
 const second=h.open();h.close();h.requests[1].resolve(data);await second;assert.doesNotMatch(h.html(),/ТОЛЬКО ЧТЕНИЕ/);
});
test('archive pages and errors remain read-only',async()=>{
 const h=harness(),p=h.open();h.requests[0].resolve({...data,proposals:Array.from({length:12},()=>item())});await p;h.change('archive-section','events');h.click('archive-next');assert.match(h.region.innerHTML,/11–12 из 12/);
 h.setKey('changed');h.click('archive-prev');assert.match(h.region.innerHTML,/Игра изменилась/);
 const failed=h.open();h.requests[1].reject(new Error('<failed>'));await failed;assert.match(h.html(),/&lt;failed&gt;/);
});
