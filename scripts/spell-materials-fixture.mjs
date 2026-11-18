// Read-only design fixture. No database, authentication or mutations; loopback only.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal} from './spell-materials-contract.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root));
export function createSpellMaterialsFixture(){
 const catalog=validateCatalog(bundledCatalog().bundle),proposal=JSON.parse(read('catalog/spell-materials.proposal.json')),art=JSON.parse(read('catalog/art-manifest.json'));
 validateMaterialProposal(proposal,catalog);
 const ids=[...proposal.entries.map(e=>e.id),'srd51:2014:spell:animal-friendship'];
 const examples=ids.map(id=>{const e=catalog.find(e=>e.id===id),row=proposal.entries.find(r=>r.id===id),image=art.entries.find(a=>a.id===id);return {id,name:e.name,level:e.spell.level,art:image?.files.thumbnail.path,...(row?{materials:row.materials,pages:row.sourcePages}:{})};});
 const files=new Map([['/',['docs/design/prototypes/spell-materials-34.html','text/html']],['/material-prototype.mjs',['docs/design/prototypes/spell-materials-prototype.mjs','text/javascript']],['/material-view.mjs',['docs/design/prototypes/spell-materials-view.mjs','text/javascript']],...['style.css','catalog.css','fonts.css'].map(p=>['/'+p,['client/'+p,'text/css']]),...['inter-400-800-cyrillic','inter-400-800-latin','pt-serif-400-cyrillic','pt-serif-400-latin','pt-serif-700-cyrillic','pt-serif-700-latin'].map(p=>['/fonts/'+p+'.woff2',['client/fonts/'+p+'.woff2','font/woff2']]),...examples.filter(e=>e.art).map(e=>['/'+e.art,[e.art,'image/png']])]);
 return createServer((req,res)=>{
  if(req.method!=='GET'){req.resume();res.writeHead(405).end();return;}
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/examples.json'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(examples));return;}
  const file=files.get(path);if(!file){res.writeHead(404).end();return;}
  try{const body=read(file[0]);res.writeHead(200,{'Content-Type':file[1]+'; charset=utf-8','Cache-Control':'no-store'}).end(body);}catch{res.writeHead(404).end();}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)createSpellMaterialsFixture().listen(4337,'127.0.0.1',()=>console.log('Material design fixture: http://127.0.0.1:4337'));
