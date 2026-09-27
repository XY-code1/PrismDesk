import test from 'node:test';
import assert from 'node:assert/strict';
import { finishQuit } from '../src/main/quit.js';

test('normal and tray quit wait for remote cleanup before finalizing',async()=>{
  for(const entry of ['normal','tray']){
    const calls:string[]=[];
    await finishQuit(async()=>{calls.push(`${entry}:cleanup`)},()=>{calls.push(`${entry}:finalize`)},50);
    assert.deepEqual(calls,[`${entry}:cleanup`,`${entry}:finalize`]);
  }
});

test('remote cleanup failure still finalizes quit',async()=>{
  let finalized=0;
  await finishQuit(async()=>{throw new Error('client gone')},()=>{finalized+=1},50);
  assert.equal(finalized,1);
});

test('remote cleanup timeout still finalizes quit',async()=>{
  let finalized=0;
  await finishQuit(()=>new Promise(()=>{}),()=>{finalized+=1},5);
  assert.equal(finalized,1);
});
