import { mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await mkdir(output, { recursive: true });
for (const name of ['class-advancement-transport.js', 'class-advancement.js', 'class-advancement-shell.js', 'art-cache.js', 'art.js', 'fonts.css', 'health.js', 'casting.js', 'spell-facts.js', 'resource-queue.js', 'waiting.html', 'login.html', 'login.js', 'login.css', 'personal-art-session.js', 'private-exit.js', 'game-art-transfer.js', 'game-art-transfer-panel.js', 'game-art-transfer-shell.js', 'personal-art-command.js', 'personal-art-transport.js', 'personal-art-preview.js', 'personal-art-history.js', 'personal-art-editor.js', 'personal-art-cards.js', 'personal-art-view.js', 'account.js', 'index.html', 'style.css', 'quick.css', 'local.css', 'app.js', 'play.js', 'ui.js', 'storage.js', 'character-sheet.js', 'members.js', 'catalog.js', 'catalog-import.js', 'spellbook.js', 'catalog.css', 'map.js', 'quests.js', 'events.js', 'archive.js']) {
  await copyFile(new URL(`client/${name}`, root), new URL(name, output));
}
await mkdir(new URL('fonts/', output), {recursive:true});
for(const name of await readdir(new URL('client/fonts/',root)))await copyFile(new URL('client/fonts/'+name,root),new URL('fonts/'+name,output));
let html = await readFile(new URL('client/index.html', root), 'utf8');
for (const name of ['fonts', 'login', 'style', 'quick', 'local', 'catalog']) {
  let css = await readFile(new URL(`client/${name}.css`, root), 'utf8');
  if(name==='fonts')for(const file of await readdir(new URL('client/fonts/',root)))if(file.endsWith('.woff2'))css=css.replaceAll('fonts/'+file,'data:font/woff2;base64,'+(await readFile(new URL('client/fonts/'+file,root))).toString('base64'));
  html = html.replace(`<link rel="stylesheet" href="${name}.css">`, () => `<style>${css}</style>`);
}
for (const name of ['class-advancement-transport', 'class-advancement', 'class-advancement-shell', 'art-cache', 'art', 'personal-art-session', 'personal-art-command', 'personal-art-transport', 'personal-art-preview', 'personal-art-history', 'personal-art-editor', 'personal-art-cards', 'personal-art-view', 'account', 'health', 'casting', 'spell-facts', 'resource-queue', 'ui', 'storage', 'character-sheet', 'members', 'catalog', 'catalog-import', 'spellbook', 'archive', 'events', 'quests', 'map', 'play', 'app']) {
  const script = await readFile(new URL(`client/${name}.js`, root), 'utf8');
  html = html.replace(`<script src="${name}.js"></script>`, () => `<script>${script}</script>`);
}
await writeFile(new URL('skaz.html', output), html);
console.log('Готово: dist/index.html и автономный dist/skaz.html');
