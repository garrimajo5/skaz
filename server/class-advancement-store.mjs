import {validateCatalog} from './catalog.mjs';
import {isDeepStrictEqual} from 'node:util';
import {bundledCatalog} from './bundled-catalog.mjs';
let sharedSpells;
import {AppError} from './state.mjs';
import {validateAdvancementLedger} from './class-advancement.mjs';
import {saveCharacterSheet} from './character-sheet.mjs';
import {saveCharacterStats} from './character-stats.mjs';
import {readSpellbook} from './spellbook.mjs';

const tables=['class_advancement_schema','character_advancement','advancement_changes'];
export function checkAdvancementCompatibility(db,{enabled}){
 const present=tables.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
 if(!present.length)return;
 if(present.length!==tables.length)throw new AppError(409,'Неполная схема повышения уровня; нужна совместимая резервная копия');
 const rows=db.prepare('SELECT id,version FROM class_advancement_schema').all();
 if(rows.length!==1||rows[0].id!==1||rows[0].version!==1)throw new AppError(409,'Версия повышения уровня не поддерживается');
 if(!enabled&&db.prepare('SELECT 1 FROM character_advancement LIMIT 1').get())throw new AppError(409,'База содержит повышение уровня: нужен совместимый режим или резервная копия до включения');
}
export function setupAdvancement(db){
 checkAdvancementCompatibility(db,{enabled:true});
 if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='class_advancement_schema'").get())return;
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(`CREATE TABLE class_advancement_schema(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
   CREATE TABLE character_advancement(character_id TEXT PRIMARY KEY REFERENCES characters(id),ledger_json TEXT NOT NULL);
   CREATE TABLE advancement_changes(mutation_id TEXT PRIMARY KEY REFERENCES changes(mutation_id) DEFERRABLE INITIALLY DEFERRED,character_id TEXT NOT NULL REFERENCES characters(id),before_json TEXT NOT NULL,after_json TEXT NOT NULL);
   INSERT INTO class_advancement_schema VALUES(1,1)`);
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
export function readAdvancement(db,characterId){
 const row=db.prepare('SELECT ledger_json FROM character_advancement WHERE character_id=?').get(characterId);
 return row?validateAdvancementLedger(JSON.parse(row.ledger_json)):null;
}
// Caller owns BEGIN IMMEDIATE, authorization, global revision and the receipt.
// Any failure (including a late audit/FK failure) must roll back this entire call.
export function persistAdvancement(db,change,mutationId,characterId){
 const before=readAdvancement(db,characterId),ledger=validateAdvancementLedger(change.advancement);
 if((ledger.events.at(-1)?.mutationId??ledger.binding?.mutationId)!==mutationId)throw new AppError(422,'Происхождение не соответствует команде');
 saveCharacterSheet(db,{characterId,sheet:change.characterSheet},mutationId,characterId);
 saveCharacterStats(db,{characterId,stats:change.characterStats},mutationId,characterId);
 if(change.addSpells.length){
  const beforeSpells=readSpellbook(db,characterId);
  if(beforeSpells.length+change.addSpells.length>1000)throw new AppError(422,'Не более 1000 заклинаний');
  for(const catalogId of change.addSpells){
   const row=db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(catalogId);
   const entry=row&&JSON.parse(row.entry_json);
   sharedSpells??=new Map(validateCatalog(bundledCatalog().bundle).filter(e=>e.kind==='spell').map(e=>[e.id,e]));
   if(!entry||!isDeepStrictEqual(sharedSpells.get(catalogId),entry))throw new AppError(409,'Заклинание отсутствует в проверенном каталоге 2014 либо его источник изменён');
   db.prepare('INSERT INTO character_spells VALUES (?,?,?,?)').run(characterId,catalogId,'known',row.entry_json);
  }
  db.prepare('INSERT INTO spell_changes VALUES (?,?,?,?)').run(mutationId,characterId,JSON.stringify(beforeSpells),JSON.stringify(readSpellbook(db,characterId)));
 }
 db.prepare('INSERT INTO character_advancement VALUES (?,?) ON CONFLICT(character_id) DO UPDATE SET ledger_json=excluded.ledger_json').run(characterId,JSON.stringify(ledger));
 db.prepare('INSERT INTO advancement_changes VALUES (?,?,?,?)').run(mutationId,characterId,JSON.stringify(before),JSON.stringify(ledger));
}
