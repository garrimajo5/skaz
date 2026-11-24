import {promisify} from 'node:util';
import {gzip} from 'node:zlib';

const gzipBuffer = promisify(gzip);
const encodingMember = /^([\w-]+|\*)(?:[ \t]*;[ \t]*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?$/i;

function preferredEncoding(header = '') {
  const weights = new Map();
  for (const member of header.split(',')) {
    const match = encodingMember.exec(member.trim().toLowerCase());
    if (!match) continue;
    const [, token, q = '1'] = match;
    const coding = token === 'x-gzip' ? 'gzip' : token;
    weights.set(coding, Math.max(weights.get(coding) ?? 0, Number(q)));
  }
  const wildcard = weights.get('*');
  const gzipWeight = weights.get('gzip') ?? wildcard ?? 0;
  const identityWeight = weights.get('identity') ?? (wildcard === 0 ? 0 : undefined);
  if (gzipWeight > 0 && gzipWeight >= (identityWeight ?? 0)) return 'gzip';
  return identityWeight === 0 ? null : 'identity';
}

// Only the immutable, common registry feeds these shared buffers. Requests
// still pass the app's session, identity and view checks before selecting one.
export function createArtIndexRepresentations(loadLibrary) {
  let jsonBytes, gzipBytes;
  return async acceptEncoding => {
    const encoding = preferredEncoding(acceptEncoding);
    if (!encoding) return null;
    jsonBytes ??= loadLibrary().then(library => Buffer.from(JSON.stringify(library.index())));
    const bytes = encoding === 'gzip'
      ? await (gzipBytes ??= jsonBytes.then(body => gzipBuffer(body, {level:4})))
      : await jsonBytes;
    return {encoding, bytes};
  };
}
