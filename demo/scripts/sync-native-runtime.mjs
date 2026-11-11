// Explicit source synchronization; never fetches code or reads private inputs.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(process.argv[2]||''),output=resolve(import.meta.dirname,'../native-runtime');
if(!process.argv[2])throw Error('Supply the reviewed Passli source worktree.');
const queue=['native-rp-ledger','native-rp-operations','native-rp-http','native-rp-policy','native-rp-configuration'].map(n=>'scripts/fedcm/'+n+'.mjs'),files={};
while(queue.length){const name=queue.pop();if(files[name])continue;if(name.startsWith('..')||!name.endsWith('.mjs'))throw Error('Unsafe source path.');const source=readFileSync(join(root,name)),target=join(output,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,source);files[name]=createHash('sha256').update(source).digest('hex');for(const match of source.toString('utf8').matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.mjs)['"]/g))queue.push(relative(root,resolve(root,dirname(name),match[1])).replaceAll('\\','/'));}
writeFileSync(join(output,'manifest.json'),JSON.stringify({source:'skirsch/passli',files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))},null,2)+'\n');
console.log('Synchronized '+Object.keys(files).length+' reviewed runtime modules.');
