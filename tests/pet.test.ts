import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPointerGesture, clampToDisplays, defaultPetPosition, isPetHit, petWindowSize, validatePetState } from '../src/shared/pet.js';
import { PetStateStore } from '../src/main/pet-state.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const primary={x:0,y:0,width:1920,height:1040};
const secondary={x:1920,y:-200,width:1600,height:900};
const aligned={x:1920,y:0,width:1600,height:900};
const frame=(x:number,y:number)=>({x,y,...petWindowSize});

test('stored pet position must be an integer pair of schema version 1',()=>{
  assert.deepEqual(validatePetState({schemaVersion:1,x:120,y:-40}),{schemaVersion:1,x:120,y:-40});
  assert.equal(validatePetState({schemaVersion:1,x:1.5,y:0}),null);
  assert.equal(validatePetState({schemaVersion:1,x:'1',y:0}),null);
  assert.equal(validatePetState({schemaVersion:2,x:1,y:0}),null);
  assert.equal(validatePetState({schemaVersion:1,x:1e9,y:0}),null);
  assert.equal(validatePetState({schemaVersion:1,x:1,y:0,script:'alert(1)'}),null);
  assert.equal(validatePetState(null),null);
});
test('a tampered or missing pet position falls back instead of throwing',async()=>{
  const root=await mkdtemp(join(tmpdir(),'prismdesk-pet-'));
  try{
    assert.equal(await new PetStateStore(root).load(),null);
    await writeFile(join(root,'pet.json'),'{ not json');
    assert.equal(await new PetStateStore(root).load(),null);
    await new PetStateStore(root).save({x:12.4,y:-8.6});
    assert.deepEqual(await new PetStateStore(root).load(),{schemaVersion:1,x:12,y:-9});
  }finally{await rm(root,{recursive:true,force:true})}
});
test('a visible pet keeps its exact position across restarts',()=>{
  const bounds=frame(1600,800);
  assert.deepEqual(clampToDisplays(bounds,[primary]),{x:1600,y:800});
  assert.deepEqual(clampToDisplays(bounds,[primary,secondary]),{x:1600,y:800});
});
test('a pet hanging over a work-area edge is pulled back inside it',()=>{
  assert.deepEqual(clampToDisplays(frame(1600,900),[primary]),{x:1600,y:1040-petWindowSize.height});
  assert.deepEqual(clampToDisplays(frame(-40,300),[primary]),{x:0,y:300});
});
test('a pet straddling two adjacent displays is not moved',()=>{
  const bounds=frame(primary.width-60,100);
  assert.deepEqual(clampToDisplays(bounds,[primary,aligned]),{x:primary.width-60,y:100});
});
test('an uncovered corner of a straddling pet is still corrected',()=>{
  // The second display starts above the first, so this pet hangs off both work areas.
  assert.deepEqual(clampToDisplays(frame(primary.width-60,-40),[primary,secondary]),{x:primary.width,y:-40});
});
test('a pet left outside every display is pulled back inside the nearest one',()=>{
  assert.deepEqual(clampToDisplays(frame(5000,300),[primary,secondary]),{x:3352,y:300});
  assert.deepEqual(clampToDisplays(frame(-400,600),[primary]),{x:0,y:600});
});
test('a removed display returns the pet to the remaining display',()=>{
  const bounds=frame(2400,300);
  assert.deepEqual(clampToDisplays(bounds,[primary]),{x:primary.width-petWindowSize.width,y:300});
});
test('a resolution change keeps the pet inside the shrunk work area',()=>{
  const shrunk={x:0,y:0,width:1280,height:720};
  assert.deepEqual(clampToDisplays(frame(1200,700),[shrunk]),{x:1280-petWindowSize.width,y:720-petWindowSize.height});
});
test('a work area smaller than the pet still yields its origin',()=>{
  const tiny={x:100,y:100,width:80,height:80};
  assert.deepEqual(clampToDisplays(frame(0,0),[tiny]),{x:100,y:100});
});
test('the first run position sits inside the primary work area with a margin',()=>{
  const position=defaultPetPosition(primary);
  assert.deepEqual(position,{x:1920-168-24,y:1040-168-24});
  assert.deepEqual(defaultPetPosition({x:0,y:0,width:100,height:100}),{x:0,y:0});
});
test('only the character silhouette receives the pointer, the margin stays click-through',()=>{
  const {width,height}=petWindowSize;
  assert.equal(isPetHit(width/2,height/2,width,height),true);
  for(const [x,y] of [[0,0],[width-1,0],[0,height-1],[width-1,height-1],[2,height/2],[width-2,height/2],[width/2,height-1]])assert.equal(isPetHit(x,y,width,height),false,`${x},${y} must stay click-through`);
});
test('a press shorter than the drag threshold is a click, anything longer is a move',()=>{
  assert.equal(classifyPointerGesture({x:100,y:100},{x:102,y:102}),'click');
  assert.equal(classifyPointerGesture({x:100,y:100},{x:100,y:100}),'click');
  assert.equal(classifyPointerGesture({x:100,y:100},{x:104,y:100}),'click');
  assert.equal(classifyPointerGesture({x:100,y:100},{x:105,y:100}),'drag');
  assert.equal(classifyPointerGesture({x:100,y:100},{x:140,y:100}),'drag');
  assert.equal(classifyPointerGesture({x:100,y:100},{x:100,y:220},8),'drag');
  assert.equal(classifyPointerGesture({x:100,y:100},{x:106,y:100},8),'click');
});
