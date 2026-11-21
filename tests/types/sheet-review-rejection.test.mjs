import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=new URL('../../',import.meta.url);
test('scoped noEmit check rejects a corrected HP value incorrectly represented as null',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'skaz-sheet-type-rejection-'));
 try{
  const source=readFileSync(new URL('docs/design/prototypes/sheet-review-80.js',root),'utf8');
  const marker='let confirmation = null;';assert(source.includes(marker));
  const mutation="let confirmation = {values: [{fieldId: 'hpMax', value: null, selection: 'corrected', provenance: 'manual-correction'}]};";
  writeFileSync(path.join(dir,'sheet-review.js'),source.replace(marker,mutation));
  const config=JSON.parse(readFileSync(new URL('jsconfig.sheet-review.json',root),'utf8'));
  config.files=['sheet-review.js'];writeFileSync(path.join(dir,'jsconfig.json'),JSON.stringify(config));
  const compiler=fileURLToPath(new URL('node_modules/typescript/bin/tsc',root));
  const result=spawnSync(process.execPath,[compiler,'--noEmit','-p',path.join(dir,'jsconfig.json')],{encoding:'utf8',timeout:30000,windowsHide:true});
  assert.ifError(result.error);assert.equal(typeof result.status,'number');assert.notEqual(result.status,0,result.stdout+result.stderr);
  assert.match(result.stdout+result.stderr,/TS2322/);
  assert.match(result.stdout+result.stderr,/null|manual-correction/);
  assert.deepEqual(readdirSync(dir).sort(),['jsconfig.json','sheet-review.js'],'no generated JS');
 }finally{
  assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()));
  rmSync(dir,{recursive:true,force:true});
 }
});
