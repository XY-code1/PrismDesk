import test from 'node:test';
import assert from 'node:assert/strict';
import { targets } from '../src/main/cdp.js';
test('invalid and privileged CDP ports are rejected',async()=>await assert.rejects(targets(80),/无效/));
test('closed loopback port reports a connection error',async()=>await assert.rejects(targets(65534)));
