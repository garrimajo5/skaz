import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/state.mjs';
const cmd = (s, fields) => ({ mutationId: randomUUID(), expectedRevision: s.read().revision, ...fields });
const create = (s, kind = 'journal') => cmd(s, { ...s.read().context, proposalId: randomUUID(), source: { kind: 'manual-text', speaker: 'Мастер', text: 'На перевале замечен костёр.', offsetMs: 6120000 }, suggestion: { kind, title: 'Костёр на перевале', text: 'Проводник заметил дым.' } });
const decide = (s, id, decision = 'accept') => cmd(s, { proposalId: id, decision, content: decision === 'accept' ? { title: 'Уточнение', text: 'Костёр был на восточном склоне.' } : null });

test('proposal never applies before confirmation; correction applies once with source retained', () => {
  const s = openStore(':memory:');
  try {
    const before = s.read(), request = create(s); s.createProposal(request);
    assert.deepEqual(s.read().state, before.state); assert.equal(s.proposals().proposals[0].status, 'pending');
    assert.equal(s.createProposal(request).replayed, true); assert.equal(s.proposals().proposals.length, 1);
    const decision = decide(s,request.proposalId); s.decideProposal(decision);
    assert.equal(s.read().state.journal.length, 1); assert.equal(s.read().state.notes.length, 0);
    assert.equal(s.read().state.journal[0].time, '01:42'); assert.equal(s.read().state.journal[0].text, decision.content.text);
    assert.equal(s.proposals().proposals[0].source.text, request.source.text);
    assert.equal(s.proposals().proposals[0].suggestion.text, request.suggestion.text);
    assert.equal(s.proposals().proposals[0].status, 'accepted');
    assert.equal(s.decideProposal(decision).replayed, true); assert.equal(s.read().state.journal.length, 1);
    assert.throws(() => s.decideProposal(decide(s,request.proposalId)), { status: 409 });
    assert.throws(() => s.decideProposal(decide(s,request.proposalId,'dismiss')), { status: 409 });
    const resources = s.read().state; assert.equal(resources.hp,before.state.hp); assert.equal(resources.gold,before.state.gold);
    assert.deepEqual(resources.slots,before.state.slots);
  } finally { s.close(); }
});

test('personal and dismissed proposals stay distinct; other sessions cannot apply them', () => {
  const s = openStore(':memory:');
  try {
    const personal = create(s,'personal-note'); s.createProposal(personal); s.decideProposal(decide(s,personal.proposalId));
    assert.equal(s.read().state.notes.length,1); assert.equal(s.read().state.journal.length,0);
    const dismissed = create(s); s.createProposal(dismissed); s.decideProposal(decide(s,dismissed.proposalId,'dismiss'));
    assert.equal(s.proposals().proposals[1].status,'dismissed'); assert.equal(s.read().state.journal.length,0);
    const pending = create(s); s.createProposal(pending);
    s.startSession(cmd(s, { session: { name: 'Next', playedOn: '2026-10-19' } }));
    assert.deepEqual(s.proposals().proposals,[]); assert.equal(s.read().state.notes.length,1);
    assert.throws(() => s.decideProposal(decide(s,pending.proposalId)), { status: 409 });
  } finally { s.close(); }
});

test('invalid sources, unsupported effects, foreign targets and full journal do not partially apply', () => {
  const s = openStore(':memory:');
  try {
    const request = create(s);
    for (const edit of [r => r.source.kind = 'audio', r => r.source.offsetMs = -1, r => r.source.offsetMs = 1.5, r => r.source.text = '', r => r.source.text = 'x'.repeat(12001), r => r.suggestion.kind = 'damage', r => r.suggestion.title = '', r => r.suggestion.amount = 5]) {
      const invalid = structuredClone(request); edit(invalid);
      assert.throws(() => s.createProposal(invalid), { status: 422 });
    }
    assert.throws(() => s.createProposal({ ...request, characterId: randomUUID() }), { status: 409 });
    assert.equal(s.read().revision,0); s.createProposal(request);
    assert.throws(() => s.decideProposal({ ...decide(s,request.proposalId,'dismiss'), content: {title:'x',text:'y'} }), {status:422});
    const state = structuredClone(seed); state.journal = Array.from({length:2000},() => ({title:'Existing',text:'',at:0,time:'00:00'}));
    s.update(cmd(s,{state,label:'Full journal'}));
    assert.throws(() => s.decideProposal(decide(s,request.proposalId)), {status:422});
    assert.equal(s.proposals().proposals[0].status,'pending'); assert.equal(s.read().state.journal.length,2000);
  } finally { s.close(); }
});

test('decision, journal and audit roll back together and safe retry survives reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(),'skaz-proposals-')), file = join(dir,'game.sqlite');
  let s = openStore(file); const raw = new DatabaseSync(file);
  try {
    const request = create(s); s.createProposal(request); const decision = decide(s,request.proposalId), before = s.read();
    raw.exec("CREATE TRIGGER reject_decision BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'decision failure'); END");
    assert.throws(() => s.decideProposal(decision), /decision failure/); assert.deepEqual(s.read(),before);
    assert.equal(s.proposals().proposals[0].status,'pending');
    assert.equal(raw.prepare('SELECT count(*) AS n FROM proposal_changes').get().n,1);
    raw.exec('DROP TRIGGER reject_decision'); s.decideProposal(decision);
    s.close(); s = openStore(file); assert.equal(s.decideProposal(decision).replayed,true);
    assert.equal(s.read().state.journal.length,1); assert.equal(s.proposals().proposals[0].status,'accepted');
  } finally {raw.close();s.close();}
});

test('v6 carries pending/accepted/dismissed proposals without reapplying journal and preserves origin', () => {
  const s = openStore(':memory:');
  try {
    const pending = create(s); s.createProposal(pending);
    const accepted = create(s); s.createProposal(accepted); s.decideProposal(decide(s,accepted.proposalId));
    const dismissed = create(s); s.createProposal(dismissed); s.decideProposal(decide(s,dismissed.proposalId,'dismiss'));
    const file = s.exportActive(6); for(const v of [2,3,4,5]) assert.throws(() => s.exportActive(v),{status:409});
    const request = cmd(s,{destination:'new-campaign',file}); s.importActive(request);
    assert.equal(s.read().state.journal.length,1); const items = s.proposals().proposals;
    assert.notEqual(items[0].id,pending.proposalId); assert.deepEqual(items[0].importedFrom,file.proposals[0].origin);
    assert.equal(s.importActive(request).replayed,true); assert.deepEqual(s.exportActive(6).proposals,file.proposals);
    assert.throws(() => s.decideProposal(decide(s,items[1].id)),{status:409});
    s.decideProposal(decide(s,items[0].id)); assert.equal(s.read().state.journal.length,2);
    for(const edit of [f => delete f.proposals, f => f.proposals.push(f.proposals[0]), f => f.proposals[0].status = 'accepted', f => f.proposals[1].appliedEntry = null, f => f.proposals[0].origin.characterId = '../bad']) {
      const invalid = structuredClone(file); edit(invalid);
      assert.throws(() => s.importActive(cmd(s,{destination:'new-campaign',file:invalid})),{status:422});
    }
  } finally { s.close(); }
});

test('v6 import provenance and proposals roll back with game creation', async () => {
  const dir = await mkdtemp(join(tmpdir(),'skaz-proposal-transfer-')), file = join(dir,'game.sqlite');
  const s = openStore(file), raw = new DatabaseSync(file);
  try {
    s.createProposal(create(s)); const before = s.read(), request = cmd(s,{destination:'new-campaign',file:s.exportActive(6)});
    raw.exec("CREATE TRIGGER reject_proposal_import BEFORE INSERT ON changes BEGIN SELECT RAISE(ABORT, 'proposal import failure'); END");
    assert.throws(() => s.importActive(request),/proposal import failure/); assert.deepEqual(s.read(),before);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM event_proposals').get().n,1);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM proposal_origins').get().n,0);
    assert.equal(raw.prepare('SELECT count(*) AS n FROM campaigns').get().n,1);
  } finally { raw.close();s.close(); }
});

test('proposal HTTP requires local headers, confirms once and exports v6', async t => {
  const s = openStore(':memory:'), app = createApp(s);
  await new Promise(resolve => app.listen(0,'127.0.0.1',resolve));
  t.after(async () => { await new Promise(resolve => app.close(resolve));s.close(); });
  const base = `http://127.0.0.1:${app.address().port}`, request = create(s), body = JSON.stringify(request);
  const headers = {'Content-Type':'application/json','X-Skaz-Client':'local-v1'};
  assert.equal((await fetch(base+'/api/proposals',{method:'POST',headers:{'Content-Type':'application/json'},body})).status,403);
  assert.equal((await fetch(base+'/api/proposals',{method:'POST',headers:{...headers,Origin:'https://other.example'},body})).status,403);
  assert.equal((await fetch(base+'/api/proposals',{method:'POST',headers,body})).status,200);
  const result = await fetch(base+'/api/proposals').then(r=>r.json());assert.equal(result.proposals[0].status,'pending');
  assert.equal((await fetch(base+'/api/proposals/decide',{method:'POST',headers,body:JSON.stringify(decide(s,request.proposalId))})).status,200);
  const exported = await fetch(base+'/api/export/active-v6');assert.equal(exported.status,200);assert.equal((await exported.json()).proposals[0].status,'accepted');
});
