import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseDiscovery} from '../scripts/catalog-additional-discovery.mjs';
const raw=readFileSync(new URL('../catalog/scope-register-2014.json',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const scope=JSON.parse(raw),proposal=JSON.parse(readFileSync(new URL('../catalog/baldur-background-name-corrections-2014.json',import.meta.url),'utf8'));
test('Baldur correction proposal covers every affected observation without changing source identity',()=>{
 const affected=scope.records.filter(p=>p.section==='backgrounds'&&p.names.en==='Baldur');
 assert.equal(affected.length,13);assert.equal(proposal.records.length,13);
 assert.deepEqual(proposal.records.map(p=>p.observationId).sort(),affected.map(p=>p.id).sort());
 assert.equal(new Set(proposal.records.map(p=>p.proposedEnglishName)).size,13);
 for(const row of proposal.records){const p=affected.find(p=>p.id===row.observationId);assert.equal(row.url,p.url);assert.equal(row.resolvedUrl,p.url);assert.deepEqual(row.sourceIds,p.sourceIds);assert.equal(row.observedEnglishName,p.names.en);assert.match(row.proposedEnglishName,/^Baldur's Gate .+/);assert.equal(row.proposedEnglishName,row.observedCardEnglishName.trim());assert.match(row.rawSha256,/^[0-9a-f]{64}$/);assert.equal(row.accepted,false);assert.equal(row.canonicalId,null);}
 assert.equal(proposal.scopeSha256,createHash('sha256').update(raw).digest('hex'));assert.equal(proposal.approvedDenominator,null);
});
test('malformed index apostrophe explains truncation; correctly encoded heading metadata stays distinct',()=>{
 const selector='<input name="source" data-list="{&quot;core&quot;:{&quot;title&quot;:&quot;Core&quot;,&quot;list&quot;:[{&quot;title&quot;:&quot;BGDA&quot;,&quot;value&quot;:126}]}}">';
 const html=name=>selector+`<div class='for_filter' data-search='Шарлатан,${name},' data-id="830" data-source="126"><a href='/backgrounds/830-baldurs-gate-charlatan/'><div class='list-item-title'>Шарлатан</div></a></div>`;
 assert.equal(parseDiscovery(html("Baldur's Gate Charlatan"),'backgrounds').rows[0].en,'Baldur');
 assert.equal(parseDiscovery(html('Baldur&#39;s Gate Charlatan'),'backgrounds').rows[0].en,"Baldur's Gate Charlatan");
 assert.equal(parseDiscovery(html('Baldur&#39;s Gate Entertainer'),'backgrounds').rows[0].en,"Baldur's Gate Entertainer");
});
