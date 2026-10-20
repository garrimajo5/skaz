import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bundledCatalog } from '../server/bundled-catalog.mjs';

export function npcCoverage(inventory, cards) {
  if (inventory.schemaVersion!==1 || inventory.ruleset!=='5e-2014' || inventory.expectedCount!==21 || inventory.entries.length!==21) throw new Error('Invalid SRD 5.1 NPC inventory');
  const ids=new Set(),names=new Set();
  const rows=inventory.entries.map(row=>{
    if (!row.nameEn || row.id!=='srd51:2014:monster:'+row.nameEn.toLowerCase().replaceAll(' ','-') || ids.has(row.id) || names.has(row.nameEn) || !Number.isInteger(row.page) || row.page<395 || row.page>403) throw new Error('Invalid or duplicate NPC heading');
    ids.add(row.id);names.add(row.nameEn);
    const matches=cards.filter(card=>card.id===row.id);
    if(matches.length>1)throw new Error('Duplicate bundled NPC');
    const card=matches[0];
    if(card && (card.kind!=='monster'||card.ruleset!=='5e-2014'||card.name.en!==row.nameEn||!card.source.url.endsWith('#page='+row.page)))throw new Error('NPC source does not match inventory');
    return {...row,prepared:Boolean(card)};
  });
  return {scope:inventory.scope,total:rows.length,prepared:rows.filter(r=>r.prepared).length,missing:rows.filter(r=>!r.prepared),entries:rows};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const inventory=JSON.parse(readFileSync(new URL('../catalog/srd51-npc-inventory.json',import.meta.url),'utf8'));
  console.log(JSON.stringify(npcCoverage(inventory,bundledCatalog().bundle.entries),null,2));
}
