import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../client/campaign-people.js',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('  const peopleResultsMarkup='),source.indexOf('  function draw(){'));

test('campaign search keeps mounted results through a background read and clears them on denial',()=>{
 const replacements=[];
 const region={
  busy:'',
  setAttribute(name,value){if(name==='aria-busy')this.busy=value;},
  set innerHTML(markup){replacements.push(markup);}
 };
 const state={people:[{name:'Картограф Рен'}]};
 const sandbox=vm.createContext({
  el:id=>id==='campaign-people-results'?region:null,
  result:state,
  loading:false,
  view:{query:''},
  matchingPeople:people=>people.map(person=>person.name).join(','),
  note:text=>'<p>'+text+'</p>'
 });

 vm.runInContext(renderer+'\ndrawResults(true);',sandbox);
 assert.equal(replacements.length,1);
 assert.match(replacements[0],/Картограф Рен/);

 sandbox.loading=true;
 vm.runInContext('drawResults(true);',sandbox);
 assert.equal(region.busy,'true');
 assert.equal(replacements.length,1);

 sandbox.result=structuredClone(state);
 sandbox.loading=false;
 vm.runInContext('drawResults(true);',sandbox);
 assert.equal(region.busy,'false');
 assert.equal(replacements.length,1);

 sandbox.result={people:[{name:'Дозорный Май'}]};
 vm.runInContext('drawResults(true);',sandbox);
 assert.equal(replacements.length,2);
 assert.match(replacements[1],/Дозорный Май/);

 sandbox.result=null;
 vm.runInContext('drawResults(true);',sandbox);
 assert.deepEqual(replacements.slice(2),['']);
});
