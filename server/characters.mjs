import {AppError,seed} from './state.mjs';
import {splitState,selectGame} from './entities.mjs';
import {validateCharacterStats,writeCharacterStats} from './character-stats.mjs';
import {validateCharacterSheet,writeCharacterSheet} from './character-sheet.mjs';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
function validateManual(value){
  if(!exact(value,['stats','sheet','hp','maxHp','tempHp','gold']))throw new AppError(422,'Нужны явные характеристики, ручной лист, хиты и золото');
  const stats=validateCharacterStats(value.stats),sheet=validateCharacterSheet(value.sheet);
  for(const [key,min,max] of [['maxHp',1,999],['hp',0,value.maxHp],['tempHp',0,9999],['gold',0,1000000000]]){
    if(!Number.isSafeInteger(value[key])||value[key]<min||value[key]>max)throw new AppError(422,'Неверное число: '+key);
  }
  return {stats,sheet,hp:value.hp,maxHp:value.maxHp,tempHp:value.tempHp,gold:value.gold};
}

export function validateCharacterCreate(input) {
  const keys=['mutationId','expectedRevision','campaignId','characterId','template','profile',...(input?.template==='manual-2014'?['manual']:[])];
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).length!==keys.length || keys.some(key=>!Object.hasOwn(input,key))) throw new AppError(422,'Неверные поля создания персонажа');
  if (![input.campaignId,input.characterId].every(id=>typeof id==='string' && /^[a-zA-Z0-9-]{8,80}$/.test(id))) throw new AppError(422,'Неверный ID персонажа или кампании');
  if (!['bard5-demo','manual-2014'].includes(input.template)) throw new AppError(422,'Выберите bard5-demo или manual-2014');
  const p=input.profile;
  if (!p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).length!==2 || !Object.hasOwn(p,'name') || !Object.hasOwn(p,'tagline') || typeof p.name!=='string' || !p.name.trim() || p.name.length>80 || typeof p.tagline!=='string' || p.tagline.length>160) throw new AppError(422,'Нужны имя до 80 и описание до 160 символов');
  return {campaignId:input.campaignId,characterId:input.characterId,template:input.template,profile:{name:p.name.trim(),tagline:p.tagline.trim()},...(input.template==='manual-2014'?{manual:validateManual(input.manual)}:{})};
}
// Caller owns the revision, receipt and transaction. Never copy another character's possessions.
export function createCharacter(db,data,context,viewId) {
  if (data.campaignId!==context.campaignId) throw new AppError(409,'Активная кампания изменилась');
  if (db.prepare('SELECT id FROM characters WHERE id=?').get(data.characterId)) throw new AppError(409,'ID персонажа уже используется');
  if (db.prepare('SELECT count(*) AS n FROM characters WHERE campaign_id=?').get(data.campaignId).n>=100) throw new AppError(422,'Не более 100 персонажей в кампании');
  const initial=data.template==='manual-2014'?{
    hp:data.manual.hp,maxHp:data.manual.maxHp,tempHp:data.manual.tempHp,gold:data.manual.gold,
    slots:{1:0,2:0,3:0},inspiration:0,concentration:null,
    accepted:[],dismissed:[],journal:[],notes:[],mapNotes:[],checks:{},eventEdits:{},
    profile:{name:data.profile.name,tagline:data.profile.tagline,campaign:JSON.parse(db.prepare('SELECT data_json FROM campaigns WHERE id=?').get(data.campaignId).data_json).name},
  }:seed;
  const character=splitState(initial).character;
  character.name=data.profile.name;character.tagline=data.profile.tagline;
  db.prepare('INSERT INTO characters VALUES (?, ?, ?)').run(data.characterId,data.campaignId,JSON.stringify(character));
  if(data.template==='manual-2014'){
    writeCharacterStats(db,data.characterId,data.manual.stats);
    writeCharacterSheet(db,data.characterId,data.manual.sheet);
  }
  selectGame(db,{...context,characterId:data.characterId},viewId);
}
