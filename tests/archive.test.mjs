import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openStore} from '../server/store.mjs';
import {createApp} from '../server/app.mjs';
import {seed} from '../server/state.mjs';
const cmd=(s,fields)=>({mutationId:randomUUID(),expectedRevision:s.read().revision,...fields});
function proposal(s,kind='journal') {
 const request=cmd(s,{...s.read().context,proposalId:randomUUID(),source:{kind:'manual-text',speaker:'Мастер',text:'Исходная фраза',offsetMs:120000},suggestion:{kind,title:'Первоначально',text:'Исходная запись'}});
 s.createProposal(request);return request.proposalId;
}
test('archive review preserves original, correction, decisions and pending without changing progress',()=>{
 const s=openStore(':memory:');try{
  const sessionId=s.read().context.sessionId;
  const accepted=proposal(s),personal=proposal(s,'personal-note'),dismissed=proposal(s),pending=proposal(s);
  for(const id of [accepted,personal])s.decideProposal(cmd(s,{proposalId:id,decision:'accept',content:{title:'Исправлено',text:'Правильная запись'}}));
  s.decideProposal(cmd(s,{proposalId:dismissed,decision:'dismiss',content:null}));
  s.startSession(cmd(s,{session:{name:'Следующая',playedOn:'2026-10-19'}}));const before=s.read(),history=s.history();
  const archive=s.sessionReview(sessionId);assert.equal(archive.session.archived,true);assert.equal(archive.session.data.journal.length,1);
  assert.deepEqual(archive.proposals.map(p=>p.status),['accepted','accepted','dismissed','pending']);
  assert.equal(archive.proposals[0].source.text,'Исходная фраза');assert.equal(archive.proposals[0].suggestion.title,'Первоначально');assert.equal(archive.proposals[0].appliedEntry.title,'Исправлено');
  assert.equal(archive.proposals[1].suggestion.kind,'personal-note');assert.equal(s.read().state.notes.length,1);
  assert.deepEqual(s.read(),before);assert.deepEqual(s.history(),history);
  assert.throws(()=>s.decideProposal(cmd(s,{proposalId:pending,decision:'accept',content:{title:'x',text:'y'}})),{status:409});
  assert.deepEqual(s.sessionReview(before.context.sessionId).proposals,[]);
  s.createCampaign(cmd(s,{state:seed}));assert.throws(()=>s.sessionReview(sessionId),{status:404});
  assert.throws(()=>s.sessionReview(randomUUID()),{status:404});
 }finally{s.close();}
});
test('archive review HTTP is read-only, same-origin and scoped to the active campaign',async t=>{
 const s=openStore(':memory:'),app=createApp(s);await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.close(r));s.close();});
 proposal(s);const id=s.read().context.sessionId,before=s.read();const url=`http://127.0.0.1:${app.address().port}/api/sessions/${id}/review`;
 const result=await fetch(url).then(r=>r.json());assert.equal(result.proposals.length,1);assert.equal(result.context.characterId,before.context.characterId);assert.deepEqual(s.read(),before);
 assert.equal((await fetch(url,{headers:{Origin:'https://other.example'}})).status,403);
 assert.equal((await fetch(url,{method:'POST'})).status,404);
 s.createCampaign(cmd(s,{state:seed}));assert.equal((await fetch(url)).status,404);
});
