import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
await mkdir(root+'vendor',{recursive:true});
const result=await build({entryPoints:[root+'node_modules/qrcode/lib/core/qrcode.js'],bundle:true,platform:'node',format:'esm',target:'node24',minify:true,metafile:true,outfile:root+'vendor/qr-encoder.mjs',banner:{js:'// Generated from qrcode 1.5.4. See qr-encoder.LICENSE. Regenerate with npm run build:qr.'}});
if(Object.values(result.metafile.outputs).some(output=>output.imports.length))throw Error('QR encoder must not depend on runtime packages.');
for(const [input,output]of [['qrcode/LICENSE','qr-encoder.LICENSE'],['dijkstrajs/LICENSE.md','dijkstrajs.LICENSE']])await writeFile(root+'vendor/'+output,(await readFile(root+'node_modules/'+input,'utf8')).replaceAll('\r\n','\n').trimEnd()+'\n');
