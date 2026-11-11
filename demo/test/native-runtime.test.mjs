import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('vendored native verifier matches the reviewed source manifest',()=>{
 const base=new URL('../native-runtime/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',base)));
 for(const [name,hash]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync(new URL(name,base))).digest('hex'),hash,name);
});
