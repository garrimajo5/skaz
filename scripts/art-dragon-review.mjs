import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createArtLibrary} from '../server/art-library.mjs';

const base = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(process.argv[2] ?? new URL('../catalog/art-manifest.json', import.meta.url)));
const library = createArtLibrary(manifest, {base});
const index = new Map(library.index().entries.map(entry => [entry.id, entry]));
const colors = [
  ['black', 'Чёрный'], ['blue', 'Синий'], ['green', 'Зелёный'], ['red', 'Красный'],
  ['white', 'Белый'], ['brass', 'Латунный'], ['bronze', 'Бронзовый'], ['copper', 'Медный'],
  ['gold', 'Золотой'], ['silver', 'Серебряный']
];
const make = (id, name) => {
  const entry = index.get('srd51:2014:' + id);
  if (!entry) throw new Error('Для листа нужен принятый арт: ' + id);
  return {entry, name};
};
const adults = colors.map(([slug, name]) => make('monster:adult-' + slug + '-dragon', name));
const ages = [
  make('monster:young-gold-dragon', 'Золотой молодой'),
  make('monster:adult-gold-dragon', 'Золотой взрослый'),
  make('monster:young-silver-dragon', 'Серебряный молодой'),
  make('monster:adult-silver-dragon', 'Серебряный взрослый'),
  make('monster:ancient-silver-dragon', 'Серебряный древний')
];
const spells = [make('spell:faerie-fire', 'Огонь фей'), make('spell:fireball', 'Огненный шар')];
const images = new Set([...adults, ...ages, ...spells].flatMap(({entry}) => Object.values(entry.files).map(file => file.url)));
const themes = new Map([['polaris', 'Полярис'], ['coal', 'Уголь'], ['atlas', 'Атлас']]);

function img(entry, role, size, cssClass = '') {
  return '<img class="' + cssClass + '" src="' + entry.files[role].url
    + '" width="' + size + '" height="' + size + '" alt="">';
}

function strip(items, {gray = false, large = false} = {}) {
  return items.map(({entry, name}) => {
    const samples = gray
      ? img(entry, 'thumbnail', 40, 'gray')
      : (large ? img(entry, 'card', 88) : '') + img(entry, 'thumbnail', 32) + img(entry, 'thumbnail', 40);
    return '<figure><div>' + samples + '</div><figcaption>' + name
      + '<small>v' + entry.version + '</small></figcaption></figure>';
  }).join('');
}

function page(theme) {
  const navigation = Array.from(themes, ([id, name]) =>
    '<a href="?theme=' + id + '"' + (id === theme ? ' aria-current="page"' : '') + '>' + name + '</a>'
  ).join('');
  return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
    + '<title>Арт СКАЗ · #53</title><style>'
    + 'body{margin:20px;font:16px system-ui;background:var(--bg);color:var(--fg)}'
    + '.polaris{--bg:#17263a;--fg:#edf4fc;--tile:#21354a}'
    + '.coal{--bg:#1d2220;--fg:#eeeee5;--tile:#2a312d}'
    + '.atlas{--bg:#faf8f0;--fg:#263f38;--tile:#ece8db}'
    + 'h1{font-size:23px;margin:16px 0 12px}h2{font-size:17px;margin:16px 0 8px}'
    + 'nav{display:flex;gap:8px;flex-wrap:wrap}a{color:inherit;display:inline-grid;place-items:center;min-height:44px;padding:0 12px;border:1px solid currentColor;border-radius:6px}'
    + 'a[aria-current]{background:var(--tile);text-decoration-thickness:2px}'
    + '.strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(94px,1fr));gap:8px}'
    + '.spells{grid-template-columns:repeat(auto-fit,minmax(174px,1fr))}'
    + 'figure{margin:0;padding:8px;display:grid;text-align:center;align-content:start;background:var(--tile);border-radius:8px}'
    + 'figure div{display:flex;align-items:center;justify-content:center;gap:5px;flex-wrap:wrap}'
    + 'figcaption{margin-top:5px;font-size:13px}small{display:block;font-size:11px}'
    + 'img{display:block;object-fit:contain}.gray{filter:grayscale(1);border-radius:50%;background:#6663}'
    + '</style><body class="' + theme + '"><nav aria-label="Темы">' + navigation + '</nav>'
    + '<h1>Арт СКАЗ · #53</h1><h2>Взрослые драконы · серые жетоны 40 px</h2>'
    + '<section class="strip">' + strip(adults, {gray:true}) + '</section>'
    + '<h2>Взрослые драконы · 32 и 40 px</h2><section class="strip">' + strip(adults) + '</section>'
    + '<h2>Золотые и серебряные драконы · сравнение возраста</h2><section class="strip">' + strip(ages) + '</section>'
    + '<h2>Заклинания · карточка, 32 и 40 px</h2><section class="strip spells">' + strip(spells, {large:true}) + '</section></body></html>';
}

const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4337');
  if (request.method === 'GET' && url.pathname === '/') {
    const theme = url.searchParams.get('theme');
    return response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}).end(page(themes.has(theme) ? theme : 'polaris'));
  }
  if (request.method === 'GET' && images.has(url.pathname)) {
    const image = library.read(url.pathname);
    if (image) return response.writeHead(200, {'Content-Type':'image/png'}).end(image.bytes);
  }
  response.writeHead(404).end();
});
server.once('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Порт 4337 занят. Дождись завершения текущего стенда.' : error.message);
  process.exitCode = 1;
});
server.listen(4337, '127.0.0.1', () => console.log('Контактный лист: http://127.0.0.1:4337/'));
process.once('SIGINT', () => {server.closeAllConnections();server.close();});
