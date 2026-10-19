import {AppError,seed} from './state.mjs';
import {splitState,selectGame} from './entities.mjs';

export function validateCharacterCreate(input) {
  const keys=['mutationId','expectedRevision','campaignId','characterId','template','profile'];
  if (!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).length!==keys.length || keys.some(key=>!Object.hasOwn(input,key))) throw new AppError(422,'Неверные поля создания персонажа');
  if (![input.campaignId,input.characterId].every(id=>typeof id==='string' && /^[a-zA-Z0-9-]{8,80}$/.test(id))) throw new AppError(422,'Неверный ID персонажа или кампании');
  if (input.template!=='bard5-demo') throw new AppError(422,'Пока доступен только явно выбранный демо-шаблон барда 5 уровня');
  const p=input.profile;
  if (!p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).length!==2 || !Object.hasOwn(p,'name') || !Object.hasOwn(p,'tagline') || typeof p.name!=='string' || !p.name.trim() || p.name.length>80 || typeof p.tagline!=='string' || p.tagline.length>160) throw new AppError(422,'Нужны имя до 80 и описание до 160 символов');
  return {campaignId:input.campaignId,characterId:input.characterId,template:input.template,profile:{name:p.name.trim(),tagline:p.tagline.trim()}};
}
// Caller owns the revision, receipt and transaction. Never copy another character's possessions.
export function createCharacter(db,data,context,viewId) {
  if (data.campaignId!==context.campaignId) throw new AppError(409,'Активная кампания изменилась');
  if (db.prepare('SELECT id FROM characters WHERE id=?').get(data.characterId)) throw new AppError(409,'ID персонажа уже используется');
  if (db.prepare('SELECT count(*) AS n FROM characters WHERE campaign_id=?').get(data.campaignId).n>=100) throw new AppError(422,'Не более 100 персонажей в кампании');
  const character=splitState(seed).character;
  character.name=data.profile.name;character.tagline=data.profile.tagline;
  db.prepare('INSERT INTO characters VALUES (?, ?, ?)').run(data.characterId,data.campaignId,JSON.stringify(character));
  selectGame(db,{...context,characterId:data.characterId},viewId);
}
