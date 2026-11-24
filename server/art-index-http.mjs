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

// Only the immutable bundled registry feeds the shared buffers. An injected
// library can deliberately change its index between requests, as in fault QA.
export function createArtIndexRepresentations(loadLibrary, {stable}) {
  const read = () => loadLibrary().then(library => Buffer.from(JSON.stringify(library.index())));
  const compress = bytes => bytes.then(body => gzipBuffer(body, {level:4}));
  let jsonBytes, gzipBytes;
  return async acceptEncoding => {
    const encoding = preferredEncoding(acceptEncoding);
    if (!encoding) return null;
    const identity = stable ? (jsonBytes ??= read()) : read();
    let bytes = identity;
    if (encoding === 'gzip') bytes = stable ? (gzipBytes ??= compress(identity)) : compress(identity);
    return {encoding, bytes:await bytes};
  };
}
