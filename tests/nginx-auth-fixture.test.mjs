import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const nginx=process.env.SKAZ_NGINX||'nginx';let available=process.platform!=='win32';
if(available)try{execFileSync(nginx,['-v'],{stdio:'ignore'});}catch{available=false;}
for(const file of ['nginx-auth-check.conf.example','nginx.conf.example'])test(file+' cold static burst is queued without relaxing API rate or authentication',{skip:!available},async t=>{
 const root=mkdtempSync(join(tmpdir(),'skaz-static-queue-')),seen=[];
 const backend=http.createServer((req,res)=>{seen.push(req.headers.authorization);res.end('synthetic');});
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>backend.close(r)));
 const probe=http.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 writeFileSync(join(root,'passwords'),'synthetic:{SHA}'+createHash('sha1').update('test-only').digest('base64')+'\n');
 const template=readFileSync(new URL('../deploy/'+file,import.meta.url),'utf8');
 const staticBlock=template.slice(template.indexOf('    location ~'),template.lastIndexOf('    location / {'));
 assert.match(staticBlock,/burst=80;/);assert.doesNotMatch(staticBlock,/nodelay/);
 const ordinary=template.slice(template.lastIndexOf('    location / {'),template.lastIndexOf('}'));
 const routes=(staticBlock+ordinary).replaceAll('127.0.0.1:4177','127.0.0.1:'+backend.address().port).replaceAll('127.0.0.1:4173','127.0.0.1:'+backend.address().port);
 const config=`pid ${root}/nginx.pid; error_log ${root}/error.log; events {} http { access_log off; client_body_temp_path ${root}/body; proxy_temp_path ${root}/proxy; limit_req_zone $binary_remote_addr zone=skaz_requests:10m rate=10r/s; server { listen 127.0.0.1:${port}; auth_basic "fixture"; auth_basic_user_file ${root}/passwords; ${routes} } }`;
 writeFileSync(join(root,'nginx.conf'),config);execFileSync(nginx,['-t','-p',root,'-c',join(root,'nginx.conf')],{stdio:'pipe'});
 const child=spawn(nginx,['-p',root,'-c',join(root,'nginx.conf'),'-g','daemon off; master_process off;'],{stdio:'ignore'});
 t.after(async()=>{if(child.exitCode===null){const p=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await p;}});
 function request(path,auth=true){return new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port,path,headers:auth?{Authorization:'Basic '+Buffer.from('synthetic:test-only').toString('base64')}:{},agent:false},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.setTimeout(12000,()=>req.destroy(Error('bounded proxy timeout')));});}
 let ready=false;for(let i=0;i<50;i++){try{await request('/api/ready');ready=true;break;}catch{await delay(20);}}assert.ok(ready);
 assert.equal(await request('/app.js',false),401);
 const start=Date.now(),statuses=await Promise.all(Array.from({length:45},(_,i)=>request('/module-'+i+'.js')));
 assert.ok(statuses.every(s=>s===200));assert.ok(Date.now()-start>=3000,'burst is queued rather than delivered without rate limit');
 assert.ok(seen.every(value=>value===undefined),'outer credentials never reach backend');
 const api=await Promise.all(Array.from({length:45},()=>request('/api/workspace')));assert.ok(api.includes(503),'API still rejects excess burst');
});
