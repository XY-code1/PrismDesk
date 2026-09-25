import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTheme } from '../src/shared/types.js';
import { buildApplyScript, removeScript } from '../src/main/injection.js';
import { Store } from '../src/main/store.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const good={schemaVersion:1,name:'Aurora',kind:'aurora',brightness:.8,opacity:.7,blur:4,speed:1,fps:30,motion:true};
test('theme schema accepts safe declarative configuration',()=>assert.equal(validateTheme(good).name,'Aurora'));
test('theme schema rejects scripts and unknown fields',()=>assert.throws(()=>validateTheme({...good,script:'alert(1)'}),/未知字段/));
test('theme schema rejects unsafe ranges',()=>assert.throws(()=>validateTheme({...good,opacity:2}),/超出范围/));
test('apply is idempotent and cleanup is PrismDesk-scoped',()=>{const script=buildApplyScript(validateTheme(good));assert.match(script,/prismdesk-background/);assert.match(script,/__prismdeskCleanup/);assert.doesNotMatch(removeScript,/querySelectorAll\(['"]style/);});
test('settings persist across Store instances',async()=>{const root=await mkdtemp(join(tmpdir(),'prismdesk-'));try{await new Store(root).save({...good,name:'Persisted'});assert.equal((await new Store(root).load()).name,'Persisted')}finally{await rm(root,{recursive:true,force:true})}});
