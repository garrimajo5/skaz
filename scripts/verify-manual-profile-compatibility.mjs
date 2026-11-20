// Synthetic-only compatibility rehearsal. Never accepts an existing campaign database.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {openStore} from '../server/store.mjs';
import {privateDatabaseBackup} from './private-backup.mjs';

const command=(store,fields)=>({mutationId:randomUUID(),expectedRevision:store.read().revision,...fields});
const digest=async file=>createHash('sha256').update(await readFile(file)).digest('hex');

export async function verifyManualProfileCompatibility(candidateOpenStore) {
 if(typeof candidateOpenStore!=='function')throw Error('Candidate store factory required');
 const tempRoot=await realpath(tmpdir()),directory=await mkdtemp(join(tempRoot,'skaz-manual-compat-'));
 const source=join(directory,'synthetic.sqlite'),backup=join(directory,'backup.sqlite'),restored=join(directory,'restored.sqlite');
 let original,candidate,target;
 try{
  original=openStore(source);
  const initialContext=original.read().context;
  original.access.apply({action:'bootstrap-owner',userId:'qa-owner-compat',displayName:'Synthetic owner',campaignId:initialContext.campaignId,characterId:initialContext.characterId});
  original.access.apply({action:'create-user',userId:'qa-player-compat',displayName:'Synthetic player'});
  original.access.apply({action:'set-member',userId:'qa-player-compat',campaignId:initialContext.campaignId,role:'player'});
  original.access.apply({action:'grant-character',userId:'qa-player-compat',campaignId:initialContext.campaignId,characterId:initialContext.characterId});
  const created=command(original,{campaignId:original.read().context.campaignId,characterId:randomUUID(),template:'manual-2014',profile:{name:'Synthetic compatibility hero',tagline:''},manual:{stats:{abilities:{str:16,dex:33,con:14,int:18,wis:12,cha:10},armorClass:17,initiative:3,speed:30},sheet:{ruleset:'5e-2014',ancestry:'',className:'Synthetic wizard',subclass:'',level:21,counters:[{id:'synthetic-counter',name:'Synthetic reserve',current:8,max:7}]},hp:10,maxHp:20,tempHp:0,gold:0}});
  original.createCharacter(created);
  original.access.apply({action:'grant-character',userId:'qa-owner-compat',campaignId:created.campaignId,characterId:created.characterId});
  const stats=original.read().characterStats;
  stats.ruleAcknowledgements=original.read().profileRuleWarnings.filter(w=>w.key.startsWith('ability:')).map(({key,facts})=>({key,facts,note:'Synthetic agreement'}));
  const statsCommand=command(original,{characterId:created.characterId,stats});original.saveCharacterStats(statsCommand);
  const sheet=original.read().characterSheet;
  sheet.ruleAcknowledgements=original.read().profileRuleWarnings.filter(w=>w.key==='level').map(({key,facts})=>({key,facts,note:'Synthetic level agreement'}));
  original.saveCharacterSheet(command(original,{characterId:created.characterId,sheet}));
  const spend=command(original,{context:original.read().context,resource:{kind:'counter',counterId:'synthetic-counter'},delta:-1,before:8,maximum:7});original.changeResource(spend);
  original.undoResource(command(original,{targetMutationId:spend.mutationId,characterId:created.characterId}));
  const expected=original.read(),history=original.history(),exported=original.exportActive(15);
  assert.equal(expected.profileRuleWarnings.filter(w=>w.acknowledged).length,2,'Fixture must exercise both agreement scopes');
  original.close();original=null;
  const originalDigest=await digest(source);
  await privateDatabaseBackup(source,backup);const backupDigest=await digest(backup);
  await privateDatabaseBackup(backup,restored);
  candidate=candidateOpenStore(restored);
  assert.deepEqual(candidate.read(),expected,'Restored read changed profile or context');
  assert.deepEqual(candidate.history(),history,'Restored history changed');
  assert.equal(candidate.createCharacter(created).replayed,true,'Creation receipt lost');
  assert.equal(candidate.saveCharacterStats(statsCommand).replayed,true,'Stats receipt lost');
  assert.equal(candidate.changeResource(spend).replayed,true,'Resource receipt lost');
  assert.deepEqual(candidate.read(),expected,'Replay changed restored state');
  assert.deepEqual(candidate.history(),history,'Replay duplicated history');
  const restoredExport=candidate.exportActive(15);
  assert.ok(Number.isFinite(Date.parse(restoredExport.exportedAt)),'Invalid export timestamp');
  assert.deepEqual({...restoredExport,exportedAt:exported.exportedAt},exported,'Transfer changed after restore');
  assert.throws(()=>candidate.exportActive(14),{status:409},'Old format silently discarded exceptions');
  target=candidateOpenStore(':memory:');
  target.importActive(command(target,{destination:'new-campaign',file:candidate.exportActive(15)}));
  const imported=target.read();
  assert.deepEqual(imported.characterStats,expected.characterStats);
  assert.deepEqual(imported.characterSheet,expected.characterSheet);
  assert.deepEqual(imported.profileRuleWarnings,expected.profileRuleWarnings);
  assert.equal(imported.state.hp,expected.state.hp);assert.equal(imported.state.maxHp,expected.state.maxHp);
  const player=candidate.forUser('qa-player-compat','compat-player',{write:true});
  const playerBefore=player.read();
  assert.throws(()=>player.selectContext(command(player,{context:expected.context})),{status:404},'Restored player gained another character');
  assert.deepEqual(player.read(),playerBefore,'Denied selection changed player context');
  const owner=candidate.forUser('qa-owner-compat','compat-owner',{write:true});
  owner.selectContext(command(owner,{context:expected.context}));
  assert.deepEqual(owner.read().characterStats,expected.characterStats);
  const readonly=candidate.forUser('qa-owner-compat','compat-readonly');
  assert.throws(()=>readonly.saveCharacterStats(statsCommand),{status:403},'Read-only actor could write after restore');
  const next=command(candidate,{context:candidate.read().context,resource:{kind:'counter',counterId:'synthetic-counter'},delta:-1,before:8,maximum:7});
  candidate.changeResource(next);assert.equal(candidate.read().characterSheet.counters[0].current,7);
  candidate.undoResource(command(candidate,{targetMutationId:next.mutationId,characterId:created.characterId}));
  assert.equal(candidate.read().characterSheet.counters[0].current,8);
  assert.deepEqual(candidate.read().characterStats,expected.characterStats);
  assert.equal(await digest(source),originalDigest,'Synthetic original modified');
  assert.equal(await digest(backup),backupDigest,'Backup modified');
  return {verified:true,syntheticOnly:true,restoredRead:true,receiptsPreserved:true,transferVersion:15,spendUndo:true,accessIsolation:true,sourceModified:false,backupModified:false,releaseApproved:false};
 }finally{
  target?.close();candidate?.close();original?.close();
  const resolved=resolve(directory);if(!resolved.startsWith(tempRoot+sep)||!resolved.split(sep).at(-1).startsWith('skaz-manual-compat-'))throw Error('Unsafe cleanup target');
  await rm(resolved,{recursive:true,force:true});
 }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [candidateRoot,...extra]=process.argv.slice(2);
 try{
  if(!candidateRoot||extra.length)throw Error('Usage: node scripts/verify-manual-profile-compatibility.mjs candidate-checkout');
  const root=await realpath(candidateRoot),module=await import(pathToFileURL(join(root,'server/store.mjs')).href);
  console.log(JSON.stringify(await verifyManualProfileCompatibility(module.openStore)));
 }catch{console.error('Synthetic candidate compatibility failed; no existing campaign database was opened.');process.exitCode=1;}
}
