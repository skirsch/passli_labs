import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDemo} from '../server.mjs';
import {version} from '../version.mjs';

for(const mode of ['real','walkthrough'])test(mode+' shows the running version on every HTML page, outside changing account content',async t=>{
 const server=createDemo({mode,provider:{},publicPrefix:mode==='walkthrough'?'/walkthrough/':''});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await(await fetch(base+'/health')).json()).version,version);
 for(const path of ['/','/privacy','/terms']){
  const response=await fetch(base+path),html=await response.text();
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((html.match(/aria-label="Demo version"/g)||[]).length,1,path);
  assert.ok(html.includes('aria-label="Demo version">v'+version+'</div>'),path);
  assert.ok(!html.includes('{{DEMO_VERSION}}'),path);
  assert.ok(html.indexOf('aria-label="Demo version"')<html.indexOf('<main'),path+' badge survives main-content changes');
 }
 const css=await(await fetch(base+'/style.css')).text();assert.match(css,/\.demo-version\s*\{[^}]*font-size:\s*12px/);
 assert.equal(version,JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version);
});
