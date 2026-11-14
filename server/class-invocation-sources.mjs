import {isDeepStrictEqual} from 'node:util';
import {bundledCatalog} from './bundled-catalog.mjs';
import {validateCatalog} from './catalog.mjs';
import {activeInvocationOrigins,ELDRITCH_BLAST_ID,invocationDescription} from './class-invocations.mjs';
import {AppError} from './state.mjs';
let sources;
export function validateInvocationSpellSources(ledger,spellbook,lookup){
 if(ledger.version!==4)return;
 const ids=new Set(ledger.pact?.spells||[]);
 if(activeInvocationOrigins(ledger.invocations,ledger).some(o=>invocationDescription(o.id).eldritchBlast))ids.add(ELDRITCH_BLAST_ID);
 if(!ids.size)return;
 sources??=new Map(validateCatalog(bundledCatalog().bundle).filter(e=>e.kind==='spell').map(e=>[e.id,e]));
 for(const id of ids){const entry=lookup?lookup(id):spellbook.find(s=>s.catalogId===id)?.entry;
  if(!entry||!isDeepStrictEqual(entry,sources.get(id)))throw new AppError(422,'Источник заклинания дара или требования воззвания не совпадает с проверенным каталогом 2014');
 }
}
