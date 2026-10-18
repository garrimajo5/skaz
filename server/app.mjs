import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from './state.mjs';

const clientRoot = fileURLToPath(new URL('../client/', import.meta.url));
const files = new Set(['index.html', 'style.css', 'quick.css', 'app.js', 'storage.js', 'local.css']);
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
export function createApp(store) {
  return http.createServer(async (request, response) => {
    try {
      const host = request.headers.host;
      const port = request.socket.localPort;
      if (![ `localhost:${port}`, `127.0.0.1:${port}` ].includes(host)) throw new AppError(403, 'Доступ только с локального адреса');
      if (request.headers.origin && request.headers.origin !== `http://${host}`) throw new AppError(403, 'Запрос с другого сайта запрещён');
      const pathname = new URL(request.url, `http://${host}`).pathname;
      if (pathname.startsWith('/api/')) {
        if (request.method === 'GET') {
          if (pathname === '/api/health') return json(response, 200, { status: 'ok', mode: 'local', storage: 'sqlite' });
          if (pathname === '/api/catalog') return json(response, 200, store.catalog.search(new URL(request.url, `http://${host}`).searchParams));
          if (pathname === '/api/catalog/coverage') return json(response, 200, store.catalog.coverage());
          if (pathname === '/api/workspace') return json(response, 200, store.read());
          if (pathname === '/api/history') return json(response, 200, { changes: store.history() });
          if (pathname === '/api/export') return json(response, 200, { app: 'skaz', ...store.read() }, { 'Content-Disposition': 'attachment; filename="skaz-backup.json"' });
        }
        if (pathname === '/api/workspace' && request.method === 'PUT') {
          if (request.headers['x-skaz-client'] !== 'local-v1') throw new AppError(403, 'Запрос должен исходить из приложения');
          const data = await body(request);
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError(400, 'Неверный запрос');
          return json(response, 200, store.update(data));
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
