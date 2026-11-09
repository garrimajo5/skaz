import {AppError} from './state.mjs';
import {createPersonalArtStore} from './personal-art-store.mjs';
import {isDeepStrictEqual} from 'node:util';
import {bundledCatalog} from './bundled-catalog.mjs';
import {validateCatalog} from './catalog.mjs';

// Trusted bridge, not yet mounted by openStore/HTTP. A session guard is checked
// inside every storage authorization, including after asynchronous body reads.
// Match the individual game's bundled-only catalog policy without nesting a
// reader transaction inside an image mutation transaction.
export function createPersonalArtAccess(db, access) {
  const shared=new Map(validateCatalog(bundledCatalog().bundle).map(entry=>[entry.id,entry]));
  return function forUser(userId, {write=false, guard}={}) {
    if(typeof write!=='boolean'||typeof guard!=='function')
      throw new Error('Trusted personal art session capability required');
    guard(); access.user(userId);
    const store=createPersonalArtStore(db, {
      authorize(actor,characterId,mutation) {
        guard();
        if(actor!==userId)throw new AppError(404,'Изображение недоступно');
        access.user(actor);
        const row=db.prepare('SELECT campaign_id FROM characters WHERE id=?').get(characterId);
        if(!row)throw new AppError(404,'Изображение недоступно');
        access.character(actor,row.campaign_id,characterId);
        if(mutation&&!write)throw new AppError(403,'Личные изображения доступны только для чтения');
        return true;
      },
      catalogExists(catalogId) {
        const row=db.prepare('SELECT entry_json FROM catalog_entries WHERE id=?').get(catalogId);
        return !!row&&isDeepStrictEqual(shared.get(catalogId),JSON.parse(row.entry_json));
      },
    });
    return store.forUser(userId);
  };
}
