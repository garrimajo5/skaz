import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './state.mjs';

const clientRoot = fileURLToPath(new URL('../client/', import.meta.url));
const files = new Set(['index.html', 'style.css', 'quick.css', 'app.js', 'storage.js', 'catalog.js', 'catalog.css', 'local.css', 'map.js', 'quests.js', 'events.js', 'archive.js', 'catalog-import.js', 'spellbook.js']);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const MAX_BODY = 512 * 1024;
function json(response, status, value, extra = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  response.end(JSON.stringify(value));
}
async function body(request) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new AppError(415, 'Ожидается JSON');
  if (Number(request.headers['content-length']) > MAX_BODY) { request.resume(); throw new AppError(413, 'Слишком большой файл. Максимум 512 КБ.'); }
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY) throw new AppError(413, 'Слишком большой файл. Максимум 512 КБ.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'Не удалось прочитать JSON'); }
}
export function createApp(store, { publicOrigin, authenticate, individualWrites = false } = {}) {
  if (authenticate !== undefined && typeof authenticate !== 'function') throw new Error('authenticate должен быть доверенной серверной функцией');
  if (typeof individualWrites !== 'boolean' || (individualWrites && !authenticate)) throw new Error('Индивидуальная запись требует доверенной авторизации и логического флага');
  // TLS and authentication terminate at a loopback reverse proxy. Never trust forwarded headers.
  if (publicOrigin !== undefined) {
    let parsed;
    try { parsed = new URL(publicOrigin); } catch { throw new Error('SKAZ_PUBLIC_ORIGIN должен быть HTTPS origin'); }
    if (parsed.protocol !== 'https:' || parsed.origin !== publicOrigin || parsed.username || parsed.password) throw new Error('SKAZ_PUBLIC_ORIGIN должен быть HTTPS origin без пути');
  }
  return http.createServer(async (request, response) => {
    try {
      response.setHeader('X-Skaz-Mode', publicOrigin ? 'private-server' : 'local');
      const host = request.headers.host;
      const port = request.socket.localPort;
      if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(host)) throw new AppError(403, 'Доступ только с локального адреса');
      if (request.headers.origin && request.headers.origin !== `http://${host}` && request.headers.origin !== publicOrigin) throw new AppError(403, 'Запрос с другого сайта запрещён');
      const pathname = new URL(request.url, `http://${host}`).pathname;
      if (pathname.startsWith('/api/')) {
        const viewId = request.headers['x-skaz-view'];
        let view;
        if (authenticate) {
          const userId = await authenticate(request);
          if (typeof userId !== 'string' || !userId) throw new AppError(401, 'Нужен индивидуальный вход');
          // Identity bootstrap must work before a user has a hero. It never
          // falls back to the shared workspace or accepts a client-supplied ID.
          if (pathname === '/api/me' && request.method === 'GET') return json(response,200,{user:store.access.user(userId),individualWrites});
          view = store.forUser(userId, viewId ?? 'primary-view', {write:individualWrites});
        } else view = viewId === undefined ? store : store.forView(viewId);
        if (request.method === 'GET') {
          if (pathname === '/api/health') return json(response, 200, { status: 'ok', mode: authenticate ? individualWrites ? 'individual' : 'individual-read-only' : publicOrigin ? 'private-server' : 'local', storage: 'sqlite' });
          if (pathname === '/api/proposals') return json(response, 200, view.proposals());
          if (pathname === '/api/places') return json(response, 200, view.places());
          if (pathname === '/api/quests') return json(response, 200, view.quests());
          if (pathname === '/api/spellbook') return json(response, 200, view.spellbook());
          if (pathname === '/api/inventory') return json(response, 200, view.inventory());
          if (pathname === '/api/catalog/bundled') return json(response, 200, view.catalog.previewBundled());
          if (pathname === '/api/catalog/entry') return json(response, 200, view.catalog.lookup(new URL(request.url, `http://${host}`).searchParams));
          if (pathname === '/api/catalog') return json(response, 200, view.catalog.search(new URL(request.url, `http://${host}`).searchParams));
          if (pathname === '/api/catalog/spell-inventory') return json(response, 200, view.catalog.spellInventory());
          if (pathname === '/api/catalog/coverage') return json(response, 200, view.catalog.coverage());
          if (pathname === '/api/workspace') return json(response, 200, view.read());
          if (pathname === '/api/context') return json(response, 200, view.context());
          if (pathname === '/api/campaigns') return json(response, 200, { campaigns: view.campaigns() });
          const sessionList = pathname.match(/^\/api\/campaigns\/([a-zA-Z0-9-]{1,80})\/sessions$/);
          if (sessionList) return json(response, 200, { sessions: view.sessions(sessionList[1]) });
          const review = pathname.match(/^\/api\/sessions\/([a-zA-Z0-9-]{1,80})\/review$/);
          if (review) return json(response, 200, view.sessionReview(review[1]));
          const sessionDetail = pathname.match(/^\/api\/sessions\/([a-zA-Z0-9-]{1,80})$/);
          if (sessionDetail) return json(response, 200, view.session(sessionDetail[1]));
          if (pathname === '/api/history') return json(response, 200, { changes: view.history() });
          if (pathname === '/api/export/active-v7') return json(response, 200, view.exportActive(7), { 'Content-Disposition': 'attachment; filename="skaz-active-v7.json"' });
          if (pathname === '/api/export/active-v6') return json(response, 200, view.exportActive(6), { 'Content-Disposition': 'attachment; filename="skaz-active-v6.json"' });
          if (pathname === '/api/export/active-v5') return json(response, 200, view.exportActive(5), { 'Content-Disposition': 'attachment; filename="skaz-active-v5.json"' });
          if (pathname === '/api/export/active-v4') return json(response, 200, view.exportActive(4), { 'Content-Disposition': 'attachment; filename="skaz-active-v4.json"' });
          if (pathname === '/api/export/active-v3') return json(response, 200, view.exportActive(3), { 'Content-Disposition': 'attachment; filename="skaz-active-v3.json"' });
          if (pathname === '/api/export/active') return json(response, 200, view.exportActive(), { 'Content-Disposition': 'attachment; filename="skaz-active-v2.json"' });
          if (pathname === '/api/export') return json(response, 200, { app: 'skaz', ...view.read() }, { 'Content-Disposition': 'attachment; filename="skaz-backup.json"' });
        }
        if ((pathname === '/api/workspace' && request.method === 'PUT') || (['/api/catalog/import/preview', '/api/catalog/import', '/api/catalog/bundled', '/api/characters', '/api/campaigns', '/api/context/select', '/api/sessions', '/api/inventory', '/api/inventory/remove', '/api/inventory/charges', '/api/inventory/undo', '/api/import/active', '/api/spellbook', '/api/quests', '/api/places', '/api/proposals', '/api/proposals/decide'].includes(pathname) && request.method === 'POST')) {
          if (request.headers['x-skaz-client'] !== 'local-v1') throw new AppError(403, 'Запрос должен исходить из приложения');
          const data = await body(request);
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError(400, 'Неверный запрос');
          const result = pathname === '/api/catalog/import/preview' ? view.catalog.reviewedImport(data) : pathname === '/api/catalog/import' ? view.catalog.reviewedImport(data,true) : pathname === '/api/catalog/bundled' ? view.catalog.installBundled(data) : pathname === '/api/characters' ? view.createCharacter(data) : pathname === '/api/proposals' ? view.createProposal(data) : pathname === '/api/proposals/decide' ? view.decideProposal(data) : pathname === '/api/places' ? view.savePlace(data) : pathname === '/api/quests' ? view.saveQuest(data) : pathname === '/api/spellbook' ? view.setSpell(data) : pathname === '/api/import/active' ? view.importActive(data) : pathname === '/api/inventory/charges' ? view.changeCharges(data) : pathname === '/api/inventory/undo' ? view.undoInventory(data) : pathname === '/api/inventory/remove' ? view.removeInventory(data) : pathname === '/api/inventory' ? view.addInventory(data) : pathname === '/api/sessions' ? view.startSession(data) : pathname === '/api/campaigns' ? view.createCampaign(data) : pathname === '/api/context/select' ? view.selectContext(data) : view.update(data);
          return json(response, 200, result);
        }
        return json(response, 404, { error: 'Неизвестный метод API' });
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'Метод не поддерживается' }, { Allow: 'GET, HEAD' });
      const filename = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!files.has(filename)) return json(response, 404, { error: 'Страница не найдена' });
      const content = await readFile(path.join(clientRoot, filename));
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filename)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error instanceof AppError) json(response, error.status, { error: error.message });
      else { console.error('Ошибка локального сервера:', error.message); json(response, 500, { error: 'Не удалось сохранить данные. Попробуй ещё раз.' }); }
    }
  });
}
