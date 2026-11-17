import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {classHeadings,annotateClassSources} from './catalog-class-headings.mjs';
import {classScope} from './catalog-class-scope-proposal.mjs';
import {bardSpec} from './catalog-bard-scope.mjs';
import {barbarianSpec} from './catalog-barbarian-scope.mjs';
import {reviewedSpecs} from './catalog-reviewed-class-proposals.mjs';
import {classChoiceMetadata} from './catalog-class-choice-metadata.mjs';
import {subclassSpellTables} from './catalog-subclass-spell-tables.mjs';
import {spellGrantProposal} from './catalog-spell-grant-proposals.mjs';
export function compareEvidence(actual,expected,message){
 const strip=value=>Array.isArray(value)?value.map(strip):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>key!=='rawSha256').map(([key,value])=>[key,strip(value)])):value;
 assert.deepEqual(strip(actual),strip(expected),message);
}
export function verifyClassEvidence(directory){
 const read=f=>JSON.parse(readFileSync(new URL('../catalog/'+f,import.meta.url)));
 const sources=read('dndsu-source-register.json').sources,nav=read('dndsu-class-headings.json'),knownSpells=new Map(read('dndsu-spell-index-metadata.json').records.map(r=>[r.pageId,r]));
 const tables=read('dndsu-subclass-spell-tables.json'),policies=read('dndsu-spell-grant-proposals.json').records,proposals=[read('dndsu-bard-scope-proposal.json'),read('dndsu-barbarian-scope-proposal.json'),...read('dndsu-reviewed-class-proposals.json').classes],pages=[];
 for(const spec of [bardSpec,barbarianSpec,...reviewedSpecs]){
  const bytes=readFileSync(directory+'/class-'+spec.url.match(/\/class\/(\d+)/)[1]+'.html'),html=bytes.toString('utf8'),oldPage=nav.pages.find(p=>p.url===spec.url);
  const page={url:spec.url,className:oldPage.className,rawSha256:createHash('sha256').update(bytes).digest('hex'),...classHeadings(html)};page.headings=annotateClassSources(page.headings,sources);compareEvidence(page,oldPage,'Class navigation changed: '+spec.key);pages.push(page);
  const proposal=classScope(page,sources,spec),old=proposals.find(p=>p.classUrl===spec.url);
  for(const key of ['records','summary','excluded','status','classUrl'])assert.deepEqual(proposal[key],old[key],spec.key+' proposal '+key);
  const parsed=subclassSpellTables(html,{classUrl:spec.url,proposal,knownSpells}),expected=tables.classes.find(c=>c.classUrl===spec.url);
  for(const key of ['candidateTables','tables','excluded'])assert.deepEqual(parsed[key],expected[key],spec.key+' tables '+key);
  assert.deepEqual(spellGrantProposal(html,parsed.tables),policies.filter(r=>r.classUrl===spec.url),spec.key+' policy evidence');
 }
 const choices=classChoiceMetadata(directory,{...nav,pages},sources);compareEvidence(choices,read('dndsu-class-choice-metadata.json'),'Class choice metadata changed');
 return {classes:pages.length,choices:choices.groups.reduce((n,g)=>n+g.records.length,0),spellTables:tables.summary.tables,policies:policies.length,comparison:'all-metadata-and-policy-evidence-except-raw-html-sha'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv[2])throw Error('Usage: freshly-fetched-class-directory');console.log(verifyClassEvidence(process.argv[2]));}
