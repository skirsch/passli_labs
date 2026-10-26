import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {version} from '../version.mjs';
test('displayed and health version matches the released package',()=>{assert.equal(version,JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version)});
