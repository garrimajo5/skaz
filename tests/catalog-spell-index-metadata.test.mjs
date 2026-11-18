import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spellIndexMetadata} from '../scripts/catalog-spell-index-metadata.mjs';
const card={title:'Щит',title_en:'Shield',link:'/spells/70-shield/',filter_source:['102'],filter_components:'1|1|0|',school:'Ограждение',level:'1',filter_concentration:['1'],filter_ritual:['1']};
const html=cards=>'window.LIST = '+JSON.stringify({category:'spells',cards})+';';
test('all public index rows receive fields without depending on local name matches',()=>{
 const rows=spellIndexMetadata(html([card,{...card,title:'Другое',title_en:'Other',link:'/spells/999999-other/',level:'Заговор'}]));assert.equal(rows.length,2);assert.equal(rows[1].fields.level,0);assert.equal(rows[1].fullRules,'unverified');assert.deepEqual(rows[0].sourceIds,['102']);
});
test('duplicate numeric IDs and malformed index fields fail closed',()=>{
 assert.throws(()=>spellIndexMetadata(html([card,{...card,link:'/spells/70-new-slug/'}])),/numeric/);
 assert.throws(()=>spellIndexMetadata(html([{...card,level:'unknown'}])));
});
test('fresh index snapshot retains 524 distinct spell identities and field provenance',()=>{
 const d=JSON.parse(readFileSync(new URL('../catalog/dndsu-spell-index-metadata.json',import.meta.url)));assert.equal(d.records.length,524);assert.equal(new Set(d.records.map(r=>r.pageId)).size,524);assert.match(d.rawSha256,/^[a-f0-9]{64}$/);assert.ok(d.records.every(r=>Number.isInteger(r.fields.level)&&r.fullRules==='unverified'));
});

test('fresh spell index agrees with the reference snapshot by numeric IDs, names and sources',()=>{
 const old=JSON.parse(readFileSync(new URL('../catalog/dndsu-rule-index-2026-11-15.json',import.meta.url))).sections.spells.rows;
 const fresh=JSON.parse(readFileSync(new URL('../catalog/dndsu-spell-index-metadata.json',import.meta.url))).records;
 const project=(id,ru,en,sources)=>({id,ru,en,sources:[...sources].sort()});
 const actual=fresh.map(r=>project(r.pageId,r.ru,r.en,r.sourceIds)).sort((a,b)=>a.id.localeCompare(b.id));
 const expected=old.map(r=>project('dndsu:spells:'+new URL(r.url).pathname.match(/^\/spells\/(\d+)-/)[1],r.ru,r.en,r.sources)).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(actual,expected);
});
