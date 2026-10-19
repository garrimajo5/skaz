import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentOrigin, verifyDeployment } from '../scripts/verify-deployment.mjs';

const options = { origin: 'https://example.test', username: 'test-app', password: 'only-a-test-fixture', minimumCatalogCount: 460 };
const authorization = 'Basic ' + Buffer.from(options.username + ':' + options.password).toString('base64');
function server(overrides = {}) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.redirect, 'manual');
    assert.equal(init.method, undefined); assert.equal(init.body, undefined);
    const route = new URL(url).pathname;
    if (url.startsWith('http:')) { assert.deepEqual(init.headers, {}); return new Response(null, { status: 308, headers: { Location: options.origin + '/' } }); }
    if (init.headers.Authorization !== authorization) return new Response(null, { status: 401 });
    if (init.headers.Origin) return new Response(null, { status: overrides.originStatus || 403 });
    if (overrides.redirect) return new Response(null, { status: 302, headers: { Location: 'https://other.test/' } });
    const data = route === '/api/health' ? { status: 'ok', mode: overrides.mode || 'private-server', storage: 'sqlite' } : { total: overrides.total ?? 460 };
    return Response.json(data);
  } };
}
test('deployment check performs only read requests, protects credentials and verifies the closed server', async () => {
  const fake = server(), result = await verifyDeployment({ ...options, fetchImpl: fake.fetchImpl });
  assert.equal(result.catalogTotal, 460); assert.equal(result.checks.length, 6);
  assert.ok(fake.calls.every(c => !c.url.includes(options.password)));
  assert.ok(!JSON.stringify(result).includes(options.password));
});
test('deployment checker refuses credential redirects, wrong mode, missing catalog and foreign-origin acceptance', async () => {
  for (const overrides of [{ redirect: true }, { mode: 'local' }, { total: 459 }, { total: '460' }, { originStatus: 200 }]) {
    const fake = server(overrides);
    await assert.rejects(verifyDeployment({ ...options, fetchImpl: fake.fetchImpl }));
    assert.ok(fake.calls.every(c => new URL(c.url).hostname === 'example.test'));
  }
});
test('deployment checker rejects unsafe origins before any network request and sanitizes transport failures', async () => {
  for (const origin of ['http://example.test', 'https://user:secret@example.test', 'https://example.test/path', 'https://example.test/', 'not-a-url']) assert.throws(() => deploymentOrigin(origin));
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('transport echoed: ' + options.password); };
  await assert.rejects(verifyDeployment({ ...options, origin: 'http://example.test', fetchImpl })); assert.equal(calls, 0);
  await assert.rejects(verifyDeployment({ ...options, fetchImpl }), error => !error.message.includes(options.password));
  await assert.rejects(verifyDeployment({ ...options, username: 'bad:name', fetchImpl })); assert.equal(calls, 1);
});
