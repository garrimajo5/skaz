import Casting from '../client/casting.js';
import {AppError} from './state.mjs';
import {readSpellbook} from './spellbook.mjs';
import {saveCharacterSheet} from './character-sheet.mjs';

export function castingBalance(current,resource){
 try{return {...Casting.balance(current,resource.operation==='restore'?resource.receipt?.cost:resource.command?.cost),title:'Сотворение'};}
 catch(error){throw new AppError(409,error.message);}
}
// Invoked inside the existing resource transaction after authorization/revision
// checks. A restore resource is accepted only after inverseResource matched it
// against the persisted original receipt. No client-provided receipt is trusted.
export function applyCasting(db,current,payload,mutationId,writeState){
 const r=payload.resource,snapshot={...current,spellbook:readSpellbook(db,current.context.characterId)};
 let next,receipt;
 try{
  if(r.operation==='cast'){const result=Casting.project(snapshot,r.command);next=result.snapshot;receipt=result.receipt;}
  else next=Casting.restore(snapshot,r.receipt);
 }catch(error){throw new AppError(409,error.message);}
 const cost=r.operation==='cast'?r.command.cost:r.receipt.cost;
 if(cost?.kind==='counter')saveCharacterSheet(db,{characterId:current.context.characterId,sheet:next.characterSheet},mutationId,current.context.characterId);
 writeState(next.state);
 return {state:next.state,after:Casting.balance(next,cost).value,casting:receipt||null,title:r.operation==='cast'?r.command.spell.name:'Отмена сотворения'};
}
