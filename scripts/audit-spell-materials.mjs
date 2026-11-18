import {readFileSync} from 'node:fs';
import {bundledCatalog} from '../server/bundled-catalog.mjs';
import {validateCatalog} from '../server/catalog.mjs';
import {validateMaterialProposal,digest,materialSourceSha256} from './spell-materials-contract.mjs';
const args=process.argv.slice(2);
if(args.length!==0&&args.length!==2)throw new Error('Usage: node scripts/audit-spell-materials.mjs [pinned.pdf extracted-spell-bodies.json]');
const proposal=JSON.parse(readFileSync(new URL('../catalog/spell-materials.proposal.json',import.meta.url),'utf8'));
let source;
if(args.length){if(digest(readFileSync(args[0]))!==materialSourceSha256)throw new Error('PDF hash differs');source=JSON.parse(readFileSync(args[1],'utf8'));}
console.log(JSON.stringify(validateMaterialProposal(proposal,validateCatalog(bundledCatalog().bundle),source)));
