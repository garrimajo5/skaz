import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const digest=data=>createHash('sha256').update(data.replace(/\r\n/g,'\n')).digest('hex');
test('new evidence pins survive CRLF checkouts but detect real content changes',()=>{
 for(const name of ['srd51-armor-parameters-2014','srd51-weapon-parameters-2014','srd51-gear-tool-weights-2014','gaming-set-weight-evidence-2014','cross-source-name-evidence-2014','skt-selected-errata-comparison-2014']){
  const d=JSON.parse(readFileSync(new URL('../catalog/'+name+'.json',import.meta.url),'utf8'));
  assert.equal(d.inputHashEncoding,'UTF-8; CRLF normalized to LF; all other bytes preserved');
  for(const [path,expected]of Object.entries(d.inputSha256)){
   const lf=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
   assert.equal(digest(lf),expected);assert.equal(digest(lf.replace(/\n/g,'\r\n')),expected);
   assert.notEqual(digest(lf+' '),expected);
  }
 }
});
