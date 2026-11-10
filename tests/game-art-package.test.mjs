import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openStore} from '../server/store.mjs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {personalArtTransfer} from '../server/personal-art-transfer.mjs';
import {gameArtPackage,validateGameArtPackage} from '../server/game-art-package.mjs';
import {validateTransfer} from '../server/transfer.mjs';
const catalogId='srd51:2014:spell:shield';
const manifest=JSON.parse(readFileSync(new URL('../catalog/art-manifest.json',import.meta.url)));
const png=readFileSync(new URL('../'+manifest.entries[0].files.thumbnail.path,import.meta.url));
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'skaz-game-art-package-')),store=openStore(join(dir,'game.sqlite'));
 t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const game=store.exportActive(12),art=personalArtTransfer([{catalogId,bytes:png}]);
 const entries=new Map(bundledCatalog().bundle.entries.map(entry=>[entry.id,entry]));
 return {store,game,art,lookup:id=>entries.get(id)};
}
test('one package retains images for catalog entries outside the spellbook and inventory',t=>{
 const {game,art,lookup}=fixture(t),before=JSON.stringify(game);
 const bundle=gameArtPackage(game,art,{lookup}),parsed=validateGameArtPackage(bundle);
 assert.equal(JSON.stringify(game),before);assert.equal(parsed.art.length,1);assert.deepEqual(parsed.art[0].bytes,png);
 assert.ok(parsed.game.entries.some(e=>e.id===catalogId));assert.equal(bundle.game.schemaVersion,12);
 assert.throws(()=>validateTransfer(bundle),{status:422}); // Legacy clients must not silently discard artwork.
 bundle.personalArt.entries[0].png='corrupt';assert.equal(art.entries[0].png,png.toString('base64'));
});
test('missing catalog record, broken image and missing companion cannot silently downgrade the export',t=>{
 const {game,art,lookup}=fixture(t);
 assert.throws(()=>gameArtPackage(game,art),{status:422});
 const bundle=gameArtPackage(game,art,{lookup});
 for(const mutate of [b=>delete b.personalArt,b=>b.game.catalog.entries=[],b=>b.personalArt.entries[0].sha256='0'.repeat(64),b=>b.ruleset='5e-2024',b=>b.game.schemaVersion=11,b=>b.owner='forged']){
  const changed=structuredClone(bundle);mutate(changed);assert.throws(()=>validateGameArtPackage(changed),{status:422});
 }
});
test('unknown linked catalog record fails instead of producing a partial package',t=>{
 const {game,art,lookup}=fixture(t);
 assert.throws(()=>gameArtPackage(game,art,{lookup:id=>id===catalogId?{...lookup(id),links:['missing-record']}:null}),{status:422});
});
