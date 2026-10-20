import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './state.mjs';
import { cookieToken, sessionCookie, clearSessionCookie } from './authentication.mjs';

const clientRoot = fileURLToPath(new URL('../client/', import.meta.url));
const files = new Set(['index.html', 'login.html', 'waiting.html', 'login.js', 'login.css', 'account.js', 'members.js', 'style.css', 'quick.css', 'app.js', 'storage.js', 'catalog.js', 'catalog.css', 'local.css', 'map.js', 'quests.js', 'events.js', 'archive.js', 'catalog-import.js', 'spellbook.js']);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const MAX_BODY = 512 * 1024;
function json(response, status, value, extra = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  response.end(JSON.stringify(value));
}
async function body(request, limit = MAX_BODY) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') throw new AppError(415, 'Ожидается JSON');
  if (Number(request.headers['content-length']) > limit) { request.resume(); throw new AppError(413, 'Слишком большой запрос.'); }
  let length = 0;
  const chunks = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) throw new AppError(413, 'Слишком большой запрос.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'Не удалось прочитать JSON'); }
}
export function createApp(store, { publicOrigin, authenticate, individualWrites = false, sessions } = {}) {
  if (sessions !== undefined) {
    if (!publicOrigin || authenticate !== undefined || !sessions || ['login','authenticate','check','logout'].some(key=>typeof sessions[key]!=='function')) throw new Error('Сессии требуют HTTPS origin и отдельный доверенный провайдер');
    authenticate=request=>sessions.authenticate(cookieToken(request.headers.cookie));
  }
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
        if (sessions && !['GET','HEAD'].includes(request.method)) {
          if(request.headers.origin!==publicOrigin || request.headers['x-skaz-client']!=='local-v1')throw new AppError(403,'Нужен запрос из приложения');
        }
        if (sessions && request.method==='POST' && ['/api/auth/login','/api/auth/logout'].includes(pathname)) {
          const input=await body(request,8192);
          if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError(422,'Неверные поля входа');
          if(pathname==='/api/auth/logout') {
            if(Object.keys(input).length)throw new AppError(422,'Выход не принимает параметры');
            const current=sessions.authenticate(cookieToken(request.headers.cookie));
            if(current && request.headers['x-skaz-identity']!==current)throw new AppError(401,'В этой вкладке изменился пользователь');
            sessions.logout(cookieToken(request.headers.cookie));
            return json(response,200,{signedOut:true},{'Set-Cookie':clearSessionCookie()});
          }
          if(Object.keys(input).length!==2 || !Object.hasOwn(input,'login') || !Object.hasOwn(input,'password'))throw new AppError(422,'Неверные поля входа');
          const session=await sessions.login(input.login,input.password);
          sessions.logout(cookieToken(request.headers.cookie));
          return json(response,200,{signedIn:true,expiresAt:session.expiresAt},{'Set-Cookie':sessionCookie(session.token)});
        }
        const viewId = request.headers['x-skaz-view'];
        let view;
        if (authenticate) {
          const userId = await authenticate(request);
          if (typeof userId !== 'string' || !userId) throw new AppError(401, 'Нужен индивидуальный вход');
          if(sessions && request.headers['x-skaz-identity']!==userId)throw new AppError(401,'В этой вкладке изменился пользователь');
          // Identity bootstrap must work before a user has a hero. It never
          // falls back to the shared workspace or accepts a client-supplied ID.
          if (pathname === '/api/me' && request.method === 'GET') return json(response,200,{user:store.access.user(userId),individualWrites});
          const guard=sessions?()=>{if(sessions.check(cookieToken(request.headers.cookie))!==userId)throw new AppError(401,'Нужен индивидуальный вход');}:undefined;
          view = store.forUser(userId, viewId ?? 'primary-view', {write:individualWrites,guard});
        } else view = viewId === undefined ? store : store.forView(viewId);
        if(authenticate && pathname==='/api/members'){
          if(request.method==='GET')return json(response,200,view.members.list());
          if(request.method==='POST'){
            if(request.headers['x-skaz-client']!=='local-v1')throw new AppError(403,'Нужен запрос из приложения');
            return json(response,200,view.members.change(await body(request,16384)));
          }
          return json(response,405,{error:'Метод не поддерживается'},{Allow:'GET, POST'});
        }
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
          if (pathname === '/api/workspace') return json(response, 200, { ...view.read(), ...(authenticate ? {permissions:view.permissions()} : {}) });
          if (pathname === '/api/context') return json(response, 200, view.context());
          if (pathname === '/api/campaigns') return json(response, 200, { campaigns: view.campaigns() });
          const sessionList = pathname.match(/^\/api\/campaigns\/([a-zA-Z0-9-]{1,80})\/sessions$/);
          if (sessionList) return json(response, 200, { sessions: view.sessions(sessionList[1]) });
          const review = pathname.match(/^\/api\/sessions\/([a-zA-Z0-9-]{1,80})\/review$/);
          if (review) return json(response, 200, view.sessionReview(review[1]));
          const sessionDetail = pathname.match(/^\/api\/sessions\/([a-zA-Z0-9-]{1,80})$/);
          if (sessionDetail) return json(response, 200, view.session(sessionDetail[1]));
          if (pathname === '/api/history') return json(response, 200, { changes: view.history() });
          if (pathname === '/api/export/active-v8') return json(response,200,view.exportActive(8),{'Content-Disposition':'attachment; filename="skaz-active-v8.json"'});
          if (pathname === '/api/export/active-v7') return json(response, 200, view.exportActive(7), { 'Content-Disposition': 'attachment; filename="skaz-active-v7.json"' });
          if (pathname === '/api/export/active-v6') return json(response, 200, view.exportActive(6), { 'Content-Disposition': 'attachment; filename="skaz-active-v6.json"' });
          if (pathname === '/api/export/active-v5') return json(response, 200, view.exportActive(5), { 'Content-Disposition': 'attachment; filename="skaz-active-v5.json"' });
          if (pathname === '/api/export/active-v4') return json(response, 200, view.exportActive(4), { 'Content-Disposition': 'attachment; filename="skaz-active-v4.json"' });
          if (pathname === '/api/export/active-v3') return json(response, 200, view.exportActive(3), { 'Content-Disposition': 'attachment; filename="skaz-active-v3.json"' });
          if (pathname === '/api/export/active') return json(response, 200, view.exportActive(), { 'Content-Disposition': 'attachment; filename="skaz-active-v2.json"' });
          if (pathname === '/api/export') {const current=view.read();if(current.characterStats)throw new AppError(409,'Ручные характеристики требуют экспорт v8 или SQLite backup');return json(response,200,{app:'skaz',...current},{'Content-Disposition':'attachment; filename="skaz-backup.json"'});}
        }
        if ((pathname === '/api/workspace' && request.method === 'PUT') || (['/api/catalog/import/preview', '/api/catalog/import', '/api/catalog/bundled', '/api/characters', '/api/campaigns', '/api/context/select', '/api/sessions', '/api/inventory', '/api/inventory/remove', '/api/inventory/charges', '/api/inventory/undo', '/api/import/active', '/api/spellbook', '/api/character-stats', '/api/quests', '/api/places', '/api/proposals', '/api/proposals/decide'].includes(pathname) && request.method === 'POST')) {
          if (request.headers['x-skaz-client'] !== 'local-v1') throw new AppError(403, 'Запрос должен исходить из приложения');
          const data = await body(request);
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError(400, 'Неверный запрос');
          const result = pathname === '/api/catalog/import/preview' ? view.catalog.reviewedImport(data) : pathname === '/api/catalog/import' ? view.catalog.reviewedImport(data,true) : pathname === '/api/catalog/bundled' ? view.catalog.installBundled(data) : pathname === '/api/characters' ? view.createCharacter(data) : pathname === '/api/proposals' ? view.createProposal(data) : pathname === '/api/proposals/decide' ? view.decideProposal(data) : pathname === '/api/places' ? view.savePlace(data) : pathname === '/api/quests' ? view.saveQuest(data) : pathname === '/api/character-stats' ? view.saveCharacterStats(data) : pathname === '/api/spellbook' ? view.setSpell(data) : pathname === '/api/import/active' ? view.importActive(data) : pathname === '/api/inventory/charges' ? view.changeCharges(data) : pathname === '/api/inventory/undo' ? view.undoInventory(data) : pathname === '/api/inventory/remove' ? view.removeInventory(data) : pathname === '/api/inventory' ? view.addInventory(data) : pathname === '/api/sessions' ? view.startSession(data) : pathname === '/api/campaigns' ? view.createCampaign(data) : pathname === '/api/context/select' ? view.selectContext(data) : view.update(data);
          return json(response, 200, { ...result, ...(authenticate && result?.state ? {permissions:view.permissions()} : {}) });
        }
        return json(response, 404, { error: 'Неизвестный метод API' });
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { error: 'Метод не поддерживается' }, { Allow: 'GET, HEAD' });
      let filename = pathname === '/' ? 'index.html' : pathname.slice(1);
      if (!files.has(filename)) return json(response, 404, { error: 'Страница не найдена' });
      let identity;
      if(sessions && filename==='index.html') {
        identity=await authenticate(request);
        if(!identity)filename='login.html';
        else {store.access.user(identity);if(!store.access.hasPlayableCharacter(identity))filename='waiting.html';if(!/^[a-zA-Z0-9-]{8,80}$/.test(identity))throw new AppError(401,'Нужен индивидуальный вход');}
      }
      let content = await readFile(path.join(clientRoot, filename));
      if(identity)content=content.toString('utf8').replace('<body ',`<body data-user-id="${identity}" `);
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filename)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error instanceof AppError) json(response, error.status, { error: error.message });
      else { console.error('Ошибка локального сервера:', error.message); json(response, 500, { error: 'Не удалось сохранить данные. Попробуй ещё раз.' }); }
    }
  });
}
