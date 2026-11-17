import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function reproductionCases(evidenceDirectory,classDirectory,date,companionDirectory=join(evidenceDirectory,'companion-evidence')){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Expected snapshot date YYYY-MM-DD [companion-evidence-directory]');
 return [
  ['catalog-additional-discovery.mjs',[evidenceDirectory,date],'dndsu-additional-discovery.json'],
  ['catalog-equipment-discovery.mjs',[evidenceDirectory,date],'dndsu-equipment-discovery.json'],
  ['catalog-bestiary-variants.mjs',[evidenceDirectory,date],'dndsu-bestiary-variants.json'],
  ['catalog-class-headings.mjs',[classDirectory,date],'dndsu-class-headings.json'],
  ['catalog-bard-scope.mjs',[],'dndsu-bard-scope-proposal.json'],
  ['catalog-barbarian-scope.mjs',[],'dndsu-barbarian-scope-proposal.json'],
  ['catalog-reviewed-class-proposals.mjs',[],'dndsu-reviewed-class-proposals.json'],
  ['catalog-class-choice-metadata.mjs',[classDirectory],'dndsu-class-choice-metadata.json'],
  ['catalog-spell-index-metadata.mjs',[join(evidenceDirectory,'source-spell-index.html'),date],'dndsu-spell-index-metadata.json'],
  ['catalog-subclass-spell-tables.mjs',[classDirectory],'dndsu-subclass-spell-tables.json'],
  ['catalog-spell-grant-proposals.mjs',[classDirectory],'dndsu-spell-grant-proposals.json'],
  ['catalog-feature-spell-references.mjs',[classDirectory],'dndsu-feature-spell-references.json'],
  ['catalog-feature-spell-relations.mjs',[classDirectory],'dndsu-feature-spell-relations.json'],
  ['catalog-replicate-item-options.mjs',[classDirectory],'dndsu-replicate-item-options.json'],
  ['catalog-companion-discovery.mjs',[classDirectory],'dndsu-companion-discovery.json'],
  ['catalog-companion-statblocks.mjs',[companionDirectory],'dndsu-companion-statblocks.json'],
  ['catalog-class-scope-boundaries.mjs',[],'dndsu-class-scope-boundaries.json'],
  ['catalog-choice-spell-references.mjs',[classDirectory],'dndsu-choice-spell-references.json'],
  ['catalog-replacement-exceptions.mjs',[classDirectory],'dndsu-replacement-exceptions.json'],
  ['catalog-spell-change-proposals.mjs',[classDirectory],'dndsu-spell-change-proposals.json'],
  ['catalog-scope-register.mjs',[],'scope-register-2014.json']
 ];
}
export function verifyScopeReproduction(evidenceDirectory,classDirectory,date,companionDirectory=join(evidenceDirectory,'companion-evidence')){
 const cases=reproductionCases(resolve(evidenceDirectory),resolve(classDirectory),date,resolve(companionDirectory));
 const temporary=mkdtempSync(join(tmpdir(),'skaz-scope-reproduction-'));
 const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
 const results=[];
 try {
  for(const [script,args,manifest] of cases){
   const output=join(temporary,manifest);
   execFileSync(process.execPath,[join(root,'scripts',script),...args,output],{cwd:root,timeout:30000,stdio:'pipe',maxBuffer:2*1024*1024});
   const expected=sha(join(root,'catalog',manifest)),actual=sha(output);
   if(actual!==expected)throw Error('Regeneration differs: '+manifest);
   results.push({manifest,sha256:actual});
  }
  return results;
 } finally {
  // Only the known output files inside our freshly allocated directory are removed.
  for(const name of readdirSync(temporary)){
   if(!cases.some(c=>c[2]===name))throw Error('Unexpected reproduction output; preserving directory');
   unlinkSync(join(temporary,name));
  }
  rmdirSync(temporary);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [,,evidenceDirectory,classDirectory,date,companionDirectory]=process.argv;
 if(!evidenceDirectory||!classDirectory||!date)throw Error('Usage: evidence-directory class-directory YYYY-MM-DD');
 const results=verifyScopeReproduction(evidenceDirectory,classDirectory,date,companionDirectory);
 console.log(results.length+'/'+results.length+' manifests reproduce byte-for-byte; repository files unchanged');
}
