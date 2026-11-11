import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {templateStats} from '../server/character-stats.mjs';
import {previewClassLevel} from '../server/class-progression.mjs';
test('scheduled backup works after advancement and restores exact retry without opening a disabled store',t=>{
 const folder=mkdtempSync(join(tmpdir(),'skaz-backup-advanced-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const source=join(folder,'game.sqlite'),dest=join(folder,'backups'),s=openStore(source,{classAdvancement:true});
 const fields=extra=>({mutationId:randomUUID(),expectedRevision:s.read().revision,characterId:s.read().context.characterId,...extra});
 s.saveCharacterStats(fields({stats:structuredClone(templateStats)}));s.saveCharacterSheet(fields({sheet:{ruleset:'5e-2014',ancestry:'',className:'fighter',subclass:'',level:1,counters:[]}}));
 const q=fields({classId:'fighter',fromLevel:1,hpMethod:'fixed',hpRoll:null,choices:{},reviewedFeatures:previewClassLevel({classId:'fighter',fromLevel:1,toLevel:2,constitution:14}).requiresFeatureReview});
 s.advanceCharacter(q);const expected=s.read();s.close();const original=readFileSync(source);
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/backup.mjs',import.meta.url))],{env:{...process.env,SKAZ_DB:source,SKAZ_BACKUP_DIR:dest},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(readFileSync(source),original);const files=readdirSync(dest);assert.equal(files.length,1);
 const restored=openStore(join(dest,files[0]),{classAdvancement:true});assert.deepEqual(restored.read(),expected);assert.equal(restored.advanceCharacter(q).replayed,true);restored.close();
});
test('backup copies unfamiliar schema without migrating the input',t=>{
 const folder=mkdtempSync(join(tmpdir(),'skaz-backup-schema-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const source=join(folder,'game.sqlite'),dest=join(folder,'backups'),db=new DatabaseSync(source);db.exec('CREATE TABLE future_data(id INTEGER PRIMARY KEY,value BLOB); INSERT INTO future_data VALUES (1,x\'0012ff\')');db.close();const before=readFileSync(source);
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/backup.mjs',import.meta.url))],{env:{...process.env,SKAZ_DB:source,SKAZ_BACKUP_DIR:dest},encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.deepEqual(readFileSync(source),before);
 const restored=new DatabaseSync(join(dest,readdirSync(dest)[0]),{readOnly:true});assert.equal(restored.prepare('SELECT hex(value) value FROM future_data').get().value,'0012FF');assert.equal(restored.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n,1);restored.close();
});
