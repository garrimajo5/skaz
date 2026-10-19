import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function deploymentOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Нужен HTTPS origin сервера'); }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('Нужен HTTPS origin без пути и учётных данных');
  return url.origin;
}

// Read-only smoke check. Manual redirects prevent credential forwarding to a
// redirected destination. No response bodies or credentials appear in results.
export async function verifyDeployment({ origin, username, password, minimumCatalogCount = 1, fetchImpl = fetch }) {
  origin = deploymentOrigin(origin);
  if (typeof username !== 'string' || !username || /[:\r\n]/.test(username) || typeof password !== 'string' || !password || /[\r\n]/.test(password)) throw new Error('Нужны корректные отдельные учётные данные приложения');
  if (!Number.isSafeInteger(minimumCatalogCount) || minimumCatalogCount < 1) throw new Error('Неверный минимум материалов каталога');
  const authorization = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
  const checks = [];
  async function request(url, headers = {}) {
    try { return await fetchImpl(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) }); }
    catch { throw new Error('Нет проверенного HTTPS-соединения или сервер не ответил'); }
  }
  async function expectStatus(url, headers, expected, label) {
    const response = await request(url, headers);
    const status = response.status;
    await response.body?.cancel();
    if (status !== expected) throw new Error(label + ': ожидался HTTP ' + expected + ', получен ' + status);
  }
  for (const route of ['/', '/api/workspace', '/api/catalog', '/api/export/active-v7']) {
    await expectStatus(origin + route, {}, 401, 'Закрытый доступ ' + route);
  }
  checks.push('Страница, прогресс, каталог и экспорт закрыты без входа');
  // A new unrelated credential must not be accepted accidentally by the proxy.
  const wrong = 'Basic ' + Buffer.from(username + ':' + password + ':invalid').toString('base64');
  await expectStatus(origin + '/api/health', { Authorization: wrong }, 401, 'Неверный пароль');
  checks.push('Неверный пароль отклонён');
  async function json(route) {
    const response = await request(origin + route, { Authorization: authorization });
    if (response.status !== 200) { await response.body?.cancel(); throw new Error('Авторизованный API ' + route + ': HTTP ' + response.status); }
    try { return await response.json(); } catch { throw new Error('API вернул некорректный JSON: ' + route); }
  }
  const health = await json('/api/health');
  if (health.status !== 'ok' || health.mode !== 'private-server' || health.storage !== 'sqlite') throw new Error('API не подтвердил готовность закрытого сервера');
  checks.push('HTTPS и готовность закрытого API подтверждены');
  const coverage = await json('/api/catalog/coverage');
  if (!Number.isSafeInteger(coverage.total) || coverage.total < minimumCatalogCount) throw new Error('Каталог не достиг ожидаемого минимального охвата');
  checks.push('Каталог доступен: ' + coverage.total + ' материалов');
  await expectStatus(origin + '/api/health', { Authorization: authorization, Origin: 'https://skaz-check.invalid' }, 403, 'Посторонний Origin');
  checks.push('Запрос с постороннего сайта отклонён');
  const http = new URL(origin); http.protocol = 'http:';
  const redirect = await request(http.href);
  const validRedirect = redirect.status === 308 && redirect.headers.get('location') === origin + '/';
  await redirect.body?.cancel();
  if (!validRedirect) throw new Error('HTTP должен перенаправлять на точный HTTPS-адрес с кодом 308');
  checks.push('HTTP перенаправляет на HTTPS без передачи пароля');
  return { checks, catalogTotal: coverage.total };
}

async function main() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('Проверка запрещена при отключённой проверке TLS');
  const [origin, credentialsFile, minimum = '1', ...extra] = process.argv.slice(2);
  if (!credentialsFile || extra.length) throw new Error('Использование: node scripts/verify-deployment.mjs https://host путь-к-приватному-json [минимум-каталога]');
  deploymentOrigin(origin);
  let credentials;
  try { credentials = JSON.parse((await readFile(credentialsFile, 'utf8')).replace(/^\uFEFF/, '')); }
  catch { throw new Error('Не удалось прочитать приватный JSON с username и password'); }
  const result = await verifyDeployment({ origin, username: credentials?.username, password: credentials?.password, minimumCatalogCount: Number(minimum) });
  for (const check of result.checks) console.log('OK: ' + check);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
