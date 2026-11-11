import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const nginx=process.env.SKAZ_NGINX||'nginx';
let available=process.platform!=='win32';
if(available)try{execFileSync(nginx,['-v'],{stdio:'ignore'});}catch{available=false;}
test('real Nginx exact upload limits preserve inherited auth and the ordinary 512 KiB limit',{skip:!available},async t=>{
 const root=mkdtempSync(join(tmpdir(),'skaz-proxy-art-')),seen=[];
 const backend=http.createServer((req,res)=>{let bytes=0;req.on('data',b=>bytes+=b.length);req.on('end',()=>{seen.push({url:req.url,bytes,authorization:req.headers.authorization});res.end(String(bytes));});});
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>backend.close(r)));
 const portServer=http.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 const credentials='synthetic:test-only-password';
 writeFileSync(join(root,'passwords'),'synthetic:{SHA}'+createHash('sha1').update('test-only-password').digest('base64')+'\n');
 const snippet=readFileSync(new URL('../deploy/nginx-personal-art.conf.example',import.meta.url),'utf8').replaceAll('127.0.0.1:4173','127.0.0.1:'+backend.address().port);
 const config=`pid ${root}/nginx.pid; error_log ${root}/error.log; events {} http { access_log off; client_body_temp_path ${root}/body; proxy_temp_path ${root}/proxy; limit_req_zone $binary_remote_addr zone=skaz_requests:10m rate=10r/s; server { listen 127.0.0.1:${port}; client_max_body_size 512k; auth_basic "synthetic"; auth_basic_user_file ${root}/passwords; ${snippet} location / { proxy_pass http://127.0.0.1:${backend.address().port}; } } }`;
 writeFileSync(join(root,'nginx.conf'),config);execFileSync(nginx,['-t','-p',root,'-c',join(root,'nginx.conf')],{stdio:'pipe'});
 const child=spawn(nginx,['-p',root,'-c',join(root,'nginx.conf'),'-g','daemon off; master_process off;'],{stdio:'ignore'});
 t.after(async()=>{if(child.exitCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;}});
 function request(path,length,{auth=true,send=true}={}){return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path,method:'POST',headers:{'Content-Length':length,...(auth?{Authorization:'Basic '+Buffer.from(credentials).toString('base64')}:{})}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('proxy request timed out')));if(send)req.end(Buffer.alloc(length,32));else req.flushHeaders();});}
 let ready=false;for(let i=0;i<50;i++){try{await request('/',0);ready=true;break;}catch{await delay(20);}}assert.ok(ready,'isolated proxy starts');seen.length=0;
 for(const [path,limit]of [['/api/personal-art/change',6*1024**2],['/api/personal-art/import',46*1024**2],['/api/import/game-with-art',64*1024**2+4096]]){
  assert.equal(await request(path,0,{auth:false}),401);assert.equal(await request(path,600*1024),200);assert.equal(seen.at(-1).bytes,600*1024);assert.equal(seen.at(-1).authorization,undefined);
  assert.equal(await request(path,limit),200);assert.equal(seen.at(-1).bytes,limit);
  const before=seen.length;assert.equal(await request(path,limit+1,{send:false}),413);assert.equal(seen.length,before);
 }
 assert.equal(await request('/api/workspace',512*1024),200);
 for(const path of ['/api/workspace','/api/personal-art/change/','/api/import/game-with-art/','/api/personal-art/cleanup'])assert.equal(await request(path,512*1024+1,{send:false}),413);
});