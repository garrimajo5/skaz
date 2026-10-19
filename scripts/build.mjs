import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
for (const name of ['index.html', 'style.css', 'quick.css', 'local.css', 'app.js', 'storage.js', 'catalog.js', 'catalog-import.js', 'spellbook.js', 'catalog.css', 'map.js', 'quests.js', 'events.js', 'archive.js']) {
  await copyFile(new URL(`client/${name}`, root), new URL(name, output));
}
let html = await readFile(new URL('client/index.html', root), 'utf8');
for (const name of ['style', 'quick', 'local', 'catalog']) {
  const css = await readFile(new URL(`client/${name}.css`, root), 'utf8');
  html = html.replace(`<link rel="stylesheet" href="${name}.css">`, () => `<style>${css}</style>`);
}
for (const name of ['storage', 'catalog', 'catalog-import', 'spellbook', 'archive', 'events', 'quests', 'map', 'app']) {
  const script = await readFile(new URL(`client/${name}.js`, root), 'utf8');
  html = html.replace(`<script src="${name}.js"></script>`, () => `<script>${script}</script>`);
}
await writeFile(new URL('skaz.html', output), html);
console.log('Готово: dist/index.html и автономный dist/skaz.html');
