// Disposable RAM-only advancement UI. Never opens a campaign database.
// Run: node scripts/class-advancement-fixture.mjs 4244
// ?class=fighter (ASI), wizard (two spells), cleric (new resource).
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {templateStats} from '../server/character-stats.mjs';
import {classProgression,previewClassLevel,spellChoiceOptions,classResourceMaximums} from '../server/class-progression.mjs';
import {buildAdvancementChange} from '../server/class-advancement.mjs';
const port=Number(process.argv[2]||4244);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Invalid fixture port');
const store=openStore(':memory:',{classAdvancement:true});store.catalog.installBundled({version:store.catalog.previewBundled().version});
const views=new Map(),lost=new Set();
const command=(view,fields)=>({mutationId:randomUUID(),expectedRevision:view.read().revision,...fields});
for(const [classId,level]of [['fighter',3],['wizard',2],['cleric',1]]){
 const view=store.forView('class-fixture-'+classId);view.createCharacter(command(view,{campaignId:view.read().context.campaignId,characterId:randomUUID(),template:'bard5-demo',profile:{name:'Вымышленный '+classId,tagline:'RAM-стенд'}}));const characterId=view.read().context.characterId;
 view.saveCharacterStats(command(view,{characterId,stats:structuredClone(templateStats)}));view.saveCharacterSheet(command(view,{characterId,sheet:{ruleset:'5e-2014',ancestry:'',className:classId,subclass:'',level,counters:[]}}));view.update(command(view,{label:'Вымышленные хиты',state:{...view.read().state,hp:12,maxHp:30}}));views.set(classId,view);
}
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>СКАЗ — повышение, RAM-стенд</title><link rel="stylesheet" href="/style.css"><style>
body[data-theme=atlas]{--muted:#52665b}main{max-width:850px;margin:auto;padding:24px 16px}h1{font-size:28px}.class-advancement{display:grid;gap:16px}fieldset{min-width:0;border:1px solid var(--line);border-radius:10px;padding:16px}label{display:flex;align-items:center;gap:12px;min-height:44px;margin:4px 0}input[type=number]{width:88px;margin-left:auto}input,select{color:var(--text);background:var(--raised);border:1px solid var(--line);border-radius:6px;padding:10px;min-height:44px}input[type=checkbox]{min-width:22px;min-height:22px;width:22px;height:22px;margin:10px 0}input[type=search]{min-width:0;width:100%}.advancement-resource{display:grid;gap:6px}.advancement-resource select{min-width:0;max-width:100%;width:100%}.advancement-spells{max-height:300px;overflow:auto;overscroll-behavior:contain}.advancement-actions{display:flex;flex-wrap:wrap;gap:12px;margin:20px 0}button:disabled{opacity:1;border-style:dashed;color:var(--muted);cursor:default}label[hidden],button[hidden]{display:none}nav{display:flex;gap:8px;flex-wrap:wrap}legend{max-width:100%;overflow-wrap:anywhere}#editor{overflow-wrap:anywhere}button{touch-action:manipulation}
</style><body data-theme="polar"><main><h1>Повышение уровня</h1><p>Отдельный вымышленный RAM-стенд. Первый успешный ответ будет намеренно потерян. Функция ещё не подключена к игре.</p><nav aria-label="Тема"><button data-theme="polar">Полярис</button><button data-theme="coal">Уголь</button><button data-theme="atlas">Атлас</button></nav><div id="editor"></div></main><script src="/class-advancement.js"></script><script src="/fixture.js"></script></body></html>`;
const client=`const kind=new URL(location.href).searchParams.get('class')||'fighter';
async function request(path,body){const response=await fetch('/fixture/'+path+'?class='+encodeURIComponent(kind),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-Skaz-Fixture':'advancement'}:{},...(body?{body:typeof body==='string'?body:JSON.stringify(body)}:{})});let value;try{value=await response.json();}catch{throw Error('Ответ потерян после сохранения.');}if(!response.ok){const error=Error(value.error||'Не удалось выполнить команду');error.notApplied=value.notApplied===true;throw error;}return value;}
for(const b of document.querySelectorAll('[data-theme]'))if(b.tagName==='BUTTON')b.onclick=()=>{document.body.dataset.theme=b.dataset.theme;for(const x of document.querySelectorAll('nav button'))x.setAttribute('aria-pressed',String(x===b));};
SkazClassAdvancement.mount(document.getElementById('editor'),{load:()=>request('state'),preview:q=>request('preview',q),send:(body,kind)=>request(kind==='bind'?'bind':'advance',body)}).then(editor=>addEventListener('pagehide',()=>editor.destroy(),{once:true}));`;
function state(view,classId){const s=view.read(),c=classProgression(classId,s.characterSheet.level),plan=previewClassLevel({classId,fromLevel:s.characterSheet.level,toLevel:s.characterSheet.level+1,constitution:s.characterStats.abilities.con});const options={};for(const choice of plan.choices){if(['cantrips','known-spells','spellbook-spells','magical-secrets','mystic-arcanum'].includes(choice.kind))options[choice.id]=spellChoiceOptions(classId,plan.toLevel,choice.kind,{knownIds:s.spellbook.map(x=>x.catalogId)}).map(o=>({...o,name:store.catalog.lookup(new URLSearchParams({id:o.spellId})).entry.name}));}return {revision:s.revision,characterId:s.context.characterId,classId,className:c.name.ru,fromLevel:s.characterSheet.level,abilities:s.characterStats.abilities,hp:s.state.hp,maxHp:s.state.maxHp,hitDie:c.hitDie,plan,options,resourceSetup:s.advancement?[]:classResourceMaximums(classId,s.characterSheet.level,s.characterStats.abilities).filter(r=>r.max!==null).map(r=>({...r,canCreate:!s.characterSheet.counters.some(c=>c.id===r.id||c.name.toLocaleLowerCase('ru')===r.name.toLocaleLowerCase('ru')),counters:s.characterSheet.counters.filter(c=>c.max===r.max)}))};}
const server=createServer(async(req,res)=>{
 const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 try{
  if(req.headers.host!==`127.0.0.1:${port}`||req.headers.origin&&req.headers.origin!==`http://127.0.0.1:${port}`)return json(403,{error:'Fixture origin required'});
  const url=new URL(req.url,`http://127.0.0.1:${port}`),classId=url.searchParams.get('class')||'fighter',view=views.get(classId);
  if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});return res.end(html);}
  if(req.method==='GET'&&['/style.css','/class-advancement.js','/fixture.js'].includes(url.pathname)){res.writeHead(200,{'Content-Type':url.pathname.endsWith('.css')?'text/css':'text/javascript;charset=utf-8','Cache-Control':'no-store'});return res.end(url.pathname==='/fixture.js'?client:await readFile(new URL('../client'+url.pathname,import.meta.url)));}
  if(!view)return json(404,{error:'Unknown synthetic hero'});
  if(req.method==='GET'&&url.pathname==='/fixture/state')return json(200,state(view,classId));
  if(req.method==='GET'&&url.pathname==='/fixture/result')return json(200,{level:view.read().characterSheet.level,events:view.read().advancement?.events.length||0,hp:view.read().state.hp,maxHp:view.read().state.maxHp});
  if(req.method!=='POST'||!['/fixture/preview','/fixture/advance','/fixture/bind'].includes(url.pathname))return json(404,{error:'Not found'});
  if(req.headers['x-skaz-fixture']!=='advancement')return json(403,{error:'Fixture header required'});
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768)return json(413,{error:'Too large'});chunks.push(chunk);}const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(url.pathname==='/fixture/preview')return json(200,buildAdvancementChange(view.read(),body).summary);
  const result=url.pathname==='/fixture/bind'?view.bindClassResources(body):view.advanceCharacter(body);if(!lost.has(classId)){lost.add(classId);res.writeHead(200,{'Content-Type':'application/json'});return res.end('{');}return json(200,result);
 }catch(error){return json(error.status||422,{error:error.message,notApplied:true});}
});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic class advancement on '+port));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>{store.close();process.exit();}));
