import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildInAppScript, buildInAppStatusScript, buildInAppSyncScript, buildRemoveAllScript, buildRemovePetScript, parseInAppRequests,
} from '../src/main/in-app-pet.js';
import { InAppPetMemoryStore, validateInAppPetMemory } from '../src/main/in-app-state.js';
import { Store } from '../src/main/store.js';
import {
  RUNTIME, alphaHit, characterClip, characterEllipse, clampBox, clampSize, defaultBox, defaultPetAppearance, inAppPetCss, inlinedRuntime, insideBox,
  isDefaultCharacterHit, isDragGesture, isResizeHandle, resizeDelta, resizeHandleSize, sampleCoords, topChromeInset, validatePetAppearance, validatePetImage, petSizeRange,
  type InAppConfig,
} from '../src/shared/in-app-pet.js';
import { validateTheme } from '../src/shared/types.js';

// ---------------------------------------------------------------------------
// A small model of a browser document: enough DOM and event routing to execute the real injected
// payload and observe what the page would see. It is a model, not a browser - the manual client
// pass in docs/TEST_RECORD.md is what proves behaviour in Codex and WorkBuddy. What it models
// faithfully: window-capture listeners run before any page listener, stopImmediatePropagation
// hides the event from the rest of the page, events from a shadow root are retargeted to its host,
// and a wheel that lands on the character is handed to the scroller underneath it.
// ---------------------------------------------------------------------------

const PAGE = { width:1000, height:800 };

class FakeClassList {
  private set = new Set<string>();
  get value(){return [...this.set].join(' ')}
  add(...names:string[]){for(const name of names)this.set.add(name)}
  remove(...names:string[]){for(const name of names)this.set.delete(name)}
  contains(name:string){return this.set.has(name)}
  toggle(name:string, force?:boolean){const on=force===undefined?!this.set.has(name):force;if(on)this.set.add(name);else this.set.delete(name);return on}
  reset(value:string){this.set=new Set(String(value||'').split(/\s+/).filter(Boolean))}
}

type Listener = { type:string; capture:boolean; fn:(event:any) => void };

class FakeNode {
  tagName:string; id=''; attributes:Record<string,string>={}; dataset:Record<string,string>={};
  children:any[]=[]; parentNode:any=null; shadowRoot:any=null; isShadowRoot=false; host:any=null;
  style:Record<string,any>={}; textContent=''; value=''; checked=false; type=''; src=''; alt=''; draggable=false; decoding='';
  listeners:Listener[]=[]; classList=new FakeClassList();
  constructor(tagName:string){this.tagName=tagName.toUpperCase()}
  get className(){return this.classList.value}
  set className(value:string){this.classList.reset(value)}
  appendChild(child:any){child.parentNode=this;this.children.push(child);return child}
  append(...nodes:any[]){for(const node of nodes)this.appendChild(node)}
  remove(){const parent=this.parentNode;if(!parent)return;const index=parent.children.indexOf(this);if(index>=0)parent.children.splice(index,1);this.parentNode=null}
  setAttribute(name:string, value:any){this.attributes[name]=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value)}
  getAttribute(name:string){return Object.prototype.hasOwnProperty.call(this.attributes,name)?this.attributes[name]:null}
  removeAttribute(name:string){delete this.attributes[name];const key=name.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());delete this.dataset[key]}
  attachShadow(){this.shadowRoot=new FakeShadowRoot(this);return this.shadowRoot}
  addEventListener(type:string, second:any, third?:any){const capture=typeof second==='boolean'?second:Boolean(third);this.listeners.push({type,capture,fn:second})}
  removeEventListener(type:string, second:any, third?:any){const capture=typeof second==='boolean'?second:Boolean(third);this.listeners=this.listeners.filter(l=>!(l.type===type&&l.capture===capture&&l.fn===second))}
  querySelectorAll(selector:string){return query(this,selector)}
  querySelector(selector:string){return query(this,selector)[0]??null}
  getContext(kind:string){return kind==='2d'&&this.contextFactory?this.contextFactory():null}
  contextFactory:any=null;
  // A real node has both: parentNode is the shadow-aware link, parentElement stops at a shadow root.
  get parentElement(){return this.parentNode}
  // The model has no layout, so a rect is only what a test assigns. Zero size is the honest default
  // and it is what keeps `onScreen` false in the model unless a test says otherwise.
  rect={x:0,y:0,width:0,height:0,top:0,left:0,right:0,bottom:0};
  scrollHeight=0; scrollLeft=0; scrollTop=0; clientHeight=0; computedStyle:any=null;
  getBoundingClientRect(){return this.rect}
}

class FakeShadowRoot {
  isShadowRoot=true; host:FakeNode; children:any[]=[]; listeners:Listener[]=[];
  constructor(host:FakeNode){this.host=host}
  appendChild(child:any){child.parentNode=this;this.children.push(child);return child}
  append(...nodes:any[]){for(const node of nodes)this.appendChild(node)}
  addEventListener(type:string, second:any, third?:any){const capture=typeof second==='boolean'?second:Boolean(third);this.listeners.push({type,capture,fn:second})}
  removeEventListener(type:string, second:any, third?:any){const capture=typeof second==='boolean'?second:Boolean(third);this.listeners=this.listeners.filter(l=>!(l.type===type&&l.capture===capture&&l.fn===second))}
  querySelectorAll(selector:string){return query(this,selector)}
  querySelector(selector:string){return query(this,selector)[0]??null}
}

class FakeDocument {
  documentElement=new FakeNode('html'); head=new FakeNode('head'); body=new FakeNode('body');
  listeners:Listener[]=[]; hidden=false; contextFactory:any=null; parentNode:any=null;
  // What `elementFromPoint` would find: a test sets it to the node that owns the top-right corner.
  hitTest:any=null;
  elementFromPoint(){return this.hitTest}
  constructor(){this.documentElement.appendChild(this.head);this.documentElement.appendChild(this.body);this.documentElement.parentNode=this}
  createElement(tag:string){const node=new FakeNode(tag);node.contextFactory=this.contextFactory;return node}
  getElementById(id:string){return walk(this.documentElement).find(node=>node.id===id)??null}
  querySelectorAll(selector:string){return query(this.documentElement,selector)}
  querySelector(selector:string){return query(this.documentElement,selector)[0]??null}
  addEventListener(type:string, second:any, third?:any){const capture=typeof second==='boolean'?second:Boolean(third);this.listeners.push({type,capture,fn:second})}
  removeEventListener(type:string, second:any, third?:any){const capture=typeof second==='boolean'?second:Boolean(third);this.listeners=this.listeners.filter(l=>!(l.type===type&&l.capture===capture&&l.fn===second))}
}

class FakeEvent {
  type:string; target:any=null; button=0; isPrimary=true; clientX=0; clientY=0; defaultPrevented=false;
  private stopped=false; private immediate=false; path:any[]=[];
  constructor(type:string, init:Record<string,unknown>={}){this.type=type;Object.assign(this,init)}
  preventDefault(){this.defaultPrevented=true}
  stopPropagation(){this.stopped=true}
  stopImmediatePropagation(){this.stopped=true;this.immediate=true}
  get propagationStopped(){return this.stopped}
  composedPath(){return this.path}
}

function walk(node:any):any[]{const out:any[]=[];const visit=(current:any)=>{out.push(current);for(const child of current.children??[])visit(child)};visit(node);return out.filter(node=>node&&!node.isShadowRoot)}

function matches(node:any, selector:string):boolean {
  const simple=selector.trim();
  if(!simple||node.isShadowRoot)return false;
  if(simple.startsWith('#'))return node.id===simple.slice(1);
  if(simple.startsWith('.'))return node.classList.contains(simple.slice(1));
  if(simple.startsWith('[')){const match=/^\[([\w-]+)(?:[=](.*?))?\]$/.exec(simple);if(!match)return false;const value=node.getAttribute(match[1]);if(value===null)return false;if(match[2]===undefined)return true;return value===match[2].replace(/^['"]|['"]$/g,'')}
  return node.tagName?.toLowerCase()===simple.toLowerCase();
}

function query(root:any, selector:string):any[]{
  const selectors=selector.split(',').map(part=>part.trim()).filter(Boolean);
  return walk(root).filter(node=>selectors.some(simple=>matches(node,simple)));
}

type Harness = ReturnType<typeof createHarness>;

function createHarness(options:{alpha?:(x:number,y:number)=>number}={}){
  const document=new FakeDocument();
  const samples:Array<{x:number;y:number}>=[];
  const alpha=options.alpha??(()=>255);
  let draws=0;
  document.contextFactory=()=>({
    clearRect(){}, drawImage(){draws+=1},
    getImageData(x:number,y:number){samples.push({x,y});return {data:[0,0,0,alpha(x,y)]}},
  });
  const win:any=new FakeNode('window');
  win.innerWidth=PAGE.width; win.innerHeight=PAGE.height;
  let timerId=0; const timers=new Map<number,() => void>();
  const setTimeoutFake=(fn:() => void)=>{timerId+=1;timers.set(timerId,fn);return timerId};
  const clearTimeoutFake=(id:number)=>{timers.delete(id)};
  const evaluate=(script:string)=>{const fn=new Function('window','document','setTimeout','clearTimeout',`return (${script})`);return fn(win,document,setTimeoutFake,clearTimeoutFake)};
  const runTimers=()=>{const pending=[...timers.values()];timers.clear();for(const fn of pending)fn()};
  win.addEventListener=(type:string,second:any,third?:any)=>{const capture=typeof second==='boolean'?second:Boolean(third);win.listeners.push({type,capture,fn:second})};
  win.removeEventListener=(type:string,second:any,third?:any)=>{const capture=typeof second==='boolean'?second:Boolean(third);win.listeners=win.listeners.filter((l:Listener)=>!(l.type===type&&l.capture===capture&&l.fn===second))};
  win.listeners=[] as Listener[];
  // Browsers always have this, so the payload may use it. A test can pin a per-node answer by
  // assigning `computedStyle` on the node.
  win.getComputedStyle=(node:any)=>node.computedStyle??{display:'block',visibility:'visible',opacity:'1',pointerEvents:'auto',overflowY:'visible',overflowX:'visible',zIndex:'auto',getPropertyValue:(name:string)=>(name==='-webkit-app-region'?'none':'')};
  document.parentNode=win;

  const path=(target:any)=>{const entries:Array<{node:any;visible:any}> =[];let node:any=target;let visible:any=target;while(node){entries.push({node,visible});if(node===win)break;if(node.isShadowRoot){node=node.host;visible=node;continue}node=node.parentNode??null}return entries};
  const invoke=(entry:any,event:FakeEvent,capture:boolean)=>{if(event.propagationStopped)return true;event.target=entry.visible;for(const listener of [...entry.node.listeners??[]] as Listener[]){if(listener.capture!==capture||listener.type!==event.type)continue;listener.fn(event);if((event as any).immediate)return true}return event.propagationStopped};
  const fire=(type:string,target:any,init:Record<string,unknown>={})=>{const event=new FakeEvent(type,init);const entries=path(target);event.path=entries.map(entry=>entry.node);for(const entry of [...entries].reverse()){if(invoke(entry,event,true)){event.path=entries.map(e=>e.node);return event}}for(const entry of entries){if(invoke(entry,event,false))break}return event};

  const config=(overrides:Partial<InAppConfig>={}):InAppConfig=>({
    target:'codex',
    theme:validateTheme({schemaVersion:2,name:'Aurora',kind:'aurora',brightness:.72,opacity:.82,blur:2,speed:1,fps:30,motion:true,petMode:'in-app',pet:{...defaultPetAppearance}}),
    petImage:null, box:null, wallpaperEngine:{installed:false,running:false,experimental:true}, ...overrides,
  });
  const api=()=>win.__prismdeskInApp;
  return { document, win, evaluate, runTimers, fire, config, samples, alpha, api, draws:()=>draws };
}

const inject=(harness:Harness, overrides:Partial<InAppConfig>={})=>harness.evaluate(buildInAppScript(harness.config(overrides)));
const petHost=(harness:Harness)=>harness.document.getElementById('prismdesk-pet-host');
const panelHost=(harness:Harness)=>harness.document.getElementById('prismdesk-panel-host');

test('pet appearance schema is strict about size, opacity, flags and artwork path',()=>{
  assert.deepEqual(validatePetAppearance({size:128,mirror:true,visible:false}),{size:128,opacity:1,mirror:true,visible:false,imagePath:undefined});
  assert.throws(()=>validatePetAppearance({size:128,opacity:0.1,mirror:false,visible:true}),/透明度/);
  assert.throws(()=>validatePetAppearance({size:petSizeRange.min-1,mirror:false,visible:true}),/尺寸/);
  assert.throws(()=>validatePetAppearance({size:128,mirror:false,visible:true,script:'alert(1)'}),/未知字段/);
  assert.throws(()=>validatePetAppearance({size:128.5,mirror:false,visible:true}),/尺寸/);
  assert.throws(()=>validatePetAppearance({size:128,mirror:'yes',visible:true}),/镜像/);
  assert.throws(()=>validatePetAppearance({size:128,mirror:false,visible:true,imagePath:''}),/路径/);
  assert.throws(()=>validatePetAppearance(null),/对象/);
});

test('theme schema v2 validates the pet and migrates a v1 file',()=>{
  const legacy={schemaVersion:1,name:'Legacy',kind:'aurora',brightness:.8,opacity:.7,blur:4,speed:1,fps:30,motion:true};
  const migrated=validateTheme(legacy);
  assert.equal(migrated.schemaVersion,2);
  assert.equal(migrated.petMode,'in-app');
  assert.deepEqual(migrated.pet,defaultPetAppearance);
  assert.equal(legacy.schemaVersion,1);
  const current=validateTheme({...legacy,schemaVersion:2,petMode:'desktop',pet:{size:96,mirror:true,visible:true,imagePath:'C:\\pets\\pet.png'}});
  assert.equal(current.petMode,'desktop');
  assert.equal(current.pet.size,96);
  assert.throws(()=>validateTheme({...legacy,schemaVersion:2,petMode:'floating'}),/宠物模式无效/);
  assert.throws(()=>validateTheme({...legacy,schemaVersion:2,petMode:'in-app'}),/宠物形象/);
  assert.throws(()=>validateTheme({...legacy,schemaVersion:2,petMode:'in-app',pet:{size:96,mirror:false,visible:true,zoom:2}}),/未知字段/);
  assert.throws(()=>validateTheme({...legacy,schemaVersion:3}),/版本无效/);
});

test('in-app placement migrates old positions and keeps a size per client',()=>{
  assert.deepEqual(validateInAppPetMemory({schemaVersion:1,clients:{workbuddy:{x:20,y:30}}}),{
    schemaVersion:2,clients:{workbuddy:{x:20,y:30,size:48}},
  });
  assert.deepEqual(validateInAppPetMemory({schemaVersion:2,clients:{workbuddy:{x:20,y:30,size:72},codex:{x:40,y:50,size:104}}}),{
    schemaVersion:2,clients:{codex:{x:40,y:50,size:104},workbuddy:{x:20,y:30,size:72}},
  });
});

test('box geometry keeps the pet inside the client window',()=>{
  assert.deepEqual(defaultBox({width:1000,height:800},128),{size:128,x:860,y:12});
  assert.deepEqual(defaultBox({width:1000,height:800},128,30),{size:128,x:860,y:42});
  assert.deepEqual(clampBox({x:848,y:648,size:128},{width:1000,height:800}),{x:848,y:648,size:128});
  assert.deepEqual(clampBox({x:990,y:-40,size:128},{width:1000,height:800}),{x:872,y:0,size:128});
  assert.deepEqual(clampBox({x:-90,y:900,size:128},{width:1000,height:800}),{x:0,y:672,size:128});
  assert.deepEqual(clampBox({x:10,y:10,size:400},{width:300,height:200}),{x:0,y:0,size:400});
  assert.deepEqual(defaultBox({width:100,height:100},128),{size:128,x:0,y:0});
});

test('the default corner is the top right, below whatever chrome owns it',()=>{
  assert.equal(topChromeInset(0,30,1002),30,'a titlebar band pushes the pet down by its height');
  assert.equal(topChromeInset(0,0,1002),0,'a hidden band is not chrome');
  assert.equal(topChromeInset(40,20,1002),0,'a band that is not anchored at the top is not chrome');
  assert.equal(topChromeInset(0,972,1002),0,'the client root must not be read as a titlebar');
  assert.equal(topChromeInset(0,-5,1002),0);
  assert.equal(topChromeInset(Number.NaN,30,1002),0);
  const plain=defaultBox({width:1000,height:800},48);
  const lowered=defaultBox({width:1000,height:800},48,60);
  const capped=defaultBox({width:1000,height:800},48,5000);
  assert.deepEqual([plain.x,plain.y],[940,12]);
  assert.deepEqual([lowered.x,lowered.y],[940,72],'chrome only moves the pet down, never sideways');
  assert.deepEqual([capped.x,capped.y],[940,752],'an absurd inset still clamps inside the viewport');
});

test('hit testing splits the artwork from its transparent margin',()=>{
  const size=128;
  assert.equal(isDefaultCharacterHit(size/2,size/2,size),true);
  for(const [x,y] of [[0,0],[size-1,0],[0,size-1],[size-1,size-1],[2,size/2],[size/2,2]])assert.equal(isDefaultCharacterHit(x,y,size),false,`${x},${y} must stay click-through`);
  assert.equal(insideBox(0,0,size),true);
  assert.equal(insideBox(size,0,size),false);
  assert.equal(alphaHit(255,12),true);
  assert.equal(alphaHit(0,12),false);
  assert.equal(isDragGesture(10,10,16,10,5),true);
  assert.equal(isDragGesture(10,10,14,10,5),false);
});

test('mirrored artwork samples the flipped pixel',()=>{
  assert.deepEqual(sampleCoords(10,40,128,false),{x:10,y:40});
  assert.deepEqual(sampleCoords(10,40,128,true),{x:117,y:40});
  assert.deepEqual(sampleCoords(127.6,200,128,false),{x:127,y:127});
  assert.deepEqual(sampleCoords(-4,-9,128,true),{x:127,y:0});
});

test('resize handle sits in the bottom-right corner and respects the size range',()=>{
  assert.equal(isResizeHandle(120,120,128,18),true);
  assert.equal(isResizeHandle(100,100,128,18),false);
  assert.equal(isResizeHandle(128,128,128,18),false);
  assert.equal(resizeDelta(100,100,120,130),25);
  assert.equal(clampSize(10,48,256),48);
  assert.equal(clampSize(999,48,256),256);
  assert.equal(clampSize(128.4,48,256),128);
  // A fixed handle would be most of a 40 px pet, so it scales with the character and never grows.
  assert.equal(resizeHandleSize(128,18),18);
  assert.equal(resizeHandleSize(60,18),18);
  assert.equal(resizeHandleSize(48,18),16);
  assert.equal(resizeHandleSize(40,18),13);
});

test('local pet artwork is validated by content and size',()=>{
  const png=(colourType:number,size=64)=>{const bytes=new Uint8Array(size);bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);bytes.set([0x49,0x48,0x44,0x52],12);bytes[25]=colourType;return bytes};
  const webp=(chunk:string,flags=0,at=20)=>{const bytes=new Uint8Array(64);bytes.set([0x52,0x49,0x46,0x46],0);bytes.set([0x57,0x45,0x42,0x50],8);for(let i=0;i<4;i+=1)bytes[12+i]=chunk.charCodeAt(i);bytes[at]=flags;return bytes};
  const gif=()=>{const bytes=new Uint8Array(64);bytes.set([0x47,0x49,0x46,0x38,0x39,0x61],0);return bytes};
  const jpeg=()=>{const bytes=new Uint8Array(64);bytes.set([0xff,0xd8,0xff,0xe0],0);return bytes};
  assert.deepEqual(validatePetImage({name:'C:\\a\\pet.png',bytes:png(6)}),{extension:'.png',mime:'image/png',bytes:64,hasAlpha:true});
  assert.equal(validatePetImage({name:'pet.png',bytes:png(2)}).hasAlpha,false);
  assert.equal(validatePetImage({name:'pet.webp',bytes:webp('VP8X',0x10)}).hasAlpha,true);
  assert.equal(validatePetImage({name:'pet.webp',bytes:webp('VP8X',0x00)}).hasAlpha,false);
  assert.equal(validatePetImage({name:'pet.webp',bytes:webp('VP8L',0x10,24)}).hasAlpha,true);
  assert.equal(validatePetImage({name:'pet.webp',bytes:webp('VP8L',0x00,24)}).hasAlpha,false);
  assert.equal(validatePetImage({name:'pet.gif',bytes:gif()}).mime,'image/gif');
  assert.throws(()=>validatePetImage({name:'pet.jpg',bytes:jpeg()}),/仅支持/);
  assert.throws(()=>validatePetImage({name:'pet.jpg',bytes:png(6)}),/扩展名/);
  assert.throws(()=>validatePetImage({name:'pet.svg',bytes:new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')}),/仅支持/);
  assert.throws(()=>validatePetImage({name:'pet.gif',bytes:png(6)}),/扩展名/);
  assert.throws(()=>validatePetImage({name:'pet.png',bytes:png(6).slice(0,8)}),/仅支持/);
  assert.throws(()=>validatePetImage({name:'pet.png',bytes:new Uint8Array(4*1024*1024+1).fill(0x89)}),/MB/);
  assert.throws(()=>validatePetImage({name:'pet.png',bytes:new Uint8Array(0)}),/为空/);
});

test('managed pet artwork is copied locally and replaced on re-import',async()=>{
  const root=await mkdtemp(join(tmpdir(),'prismdesk-pet-assets-'));
  try{
    const store=new Store(root);
    const png=new Uint8Array(64);png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],0);png.set([0x49,0x48,0x44,0x52],12);png[25]=6;
    const gif=new Uint8Array(64);gif.set([0x47,0x49,0x46,0x38,0x39,0x61],0);
    const source=join(root,'download.png');
    await writeFile(source,png);
    const imported=await store.importPetImage(source);
    assert.equal(imported.path,join(root,'pet-assets','pet.png'));
    assert.equal(imported.info.hasAlpha,true);
    assert.equal((await store.petImageData(imported.path))?.startsWith('data:image/png;base64,'),true);
    assert.equal(await store.petImageData(join(root,'missing.png')),null);
    const gifSource=join(root,'download.gif');
    await writeFile(gifSource,gif);
    const replaced=await store.importPetImage(gifSource);
    assert.equal(replaced.path,join(root,'pet-assets','pet.gif'));
    assert.deepEqual(await readdirSafe(join(root,'pet-assets')),['pet.gif']);
    await store.removePetImage();
    assert.deepEqual(await readdirSafe(join(root,'pet-assets')),[]);
  }finally{await rm(root,{recursive:true,force:true})}
});

async function readdirSafe(path:string){try{return (await readdir(path)).sort()}catch{return []}}

test('the inlined runtime matches the tested functions',()=>{
  const source=inlinedRuntime();
  for(const [name] of RUNTIME)assert.match(source,new RegExp('const '+name+'='),`${name} must be inlined`);
  const sandbox=new Function(`${source};return {clampBox,defaultBox,topChromeInset,resizeHandleSize,isDefaultCharacterHit,insideBox,sampleCoords,isResizeHandle,resizeDelta,clampSize,isDragGesture,alphaHit};`)();
  assert.deepEqual(sandbox.defaultBox({width:1000,height:800},48,30),defaultBox({width:1000,height:800},48,30));
  assert.equal(sandbox.topChromeInset(0,30,1002),topChromeInset(0,30,1002));
  assert.equal(sandbox.resizeHandleSize(48,18),resizeHandleSize(48,18));
  assert.deepEqual(sandbox.clampBox({x:-20,y:900,size:128},{width:1000,height:800}),clampBox({x:-20,y:900,size:128},{width:1000,height:800}));
  assert.deepEqual(sandbox.sampleCoords(10,40,128,true),sampleCoords(10,40,128,true));
  assert.equal(sandbox.isDefaultCharacterHit(64,64,128),isDefaultCharacterHit(64,64,128));
  assert.equal(sandbox.isResizeHandle(120,120,128,18),isResizeHandle(120,120,128,18));
  assert.equal(sandbox.resizeDelta(1,2,4,9),resizeDelta(1,2,4,9));
  assert.equal(sandbox.clampSize(999,48,256),clampSize(999,48,256));
  assert.equal(sandbox.isDragGesture(0,0,9,0,5),isDragGesture(0,0,9,0,5));
  assert.equal(sandbox.alphaHit(255,12),alphaHit(255,12));
});

// ---------------------------------------------------------------------------
// Payload behaviour, executed for real against the model document.
// ---------------------------------------------------------------------------

const themeWith=(pet:Record<string,unknown>={},rest:Record<string,unknown>={})=>validateTheme({schemaVersion:2,name:'Aurora',kind:'aurora',brightness:.72,opacity:.82,blur:2,speed:1,fps:30,motion:true,petMode:'in-app',pet:{...defaultPetAppearance,...pet},...rest});
const app=(harness:Harness)=>{const node=harness.document.createElement('div');node.id='app-root';harness.document.body.appendChild(node);return node};
// The payload places an unplaced pet in the top-right corner of the model page, so every pointer
// coordinate in the tests is derived from the same rule the page uses instead of a literal.
const placedBox=()=>defaultBox(PAGE,petSizeRange.default,0);
const petCenter=()=>{const box=placedBox();return {clientX:box.x+Math.floor(box.size/2),clientY:box.y+Math.floor(box.size/2)}};

test('the injected payload parses as javascript and keeps its safety markers',()=>{
  const config=createHarness().config();
  const inject=buildInAppScript(config);
  for(const script of [inject,buildInAppSyncScript(config,true),buildInAppStatusScript(),buildRemovePetScript(),buildRemoveAllScript()])assert.doesNotThrow(()=>new Function(`return (${script})`));
  assert.ok(inject.includes('pointer-events:none'));
  // The character is a real hit target (see the pet stylesheet), so the wheel that lands on it is
  // handed to the scroller underneath instead of being swallowed by the pet.
  assert.ok(inject.includes("addEventListener('wheel'"));
  assert.match(inject,/scrollTop\+=event\.deltaY/);
  assert.ok(inject.includes('attachShadow'));
  assert.ok(buildInAppSyncScript(config,false).includes('splice'));
  assert.match(inAppPetCss.page,/pointer-events:none!important/);
  assert.match(inAppPetCss.page,/z-index:214748300/);
  // The host stays click-through, so only the character box takes pointer input. That is what stops a
  // press on the pet from falling through to a client whose chrome is an OS window-drag region.
  assert.match(inAppPetCss.pet,/\.pd-art\{[^}]*pointer-events:auto/);
  assert.match(inAppPetCss.pet,/\.pd-art\{[^}]*-webkit-app-region:no-drag/);
  // The clip is what keeps the click-through promise: the browser routes the silhouette to the pet
  // and the transparent margin past it, while the box itself still never falls through to a client
  // window-drag region. An imported image has no known silhouette, so its box stays the hit area.
  assert.ok(inAppPetCss.pet.includes(`.pd-art{clip-path:${characterClip}}`),'the character is clipped to its silhouette');
  assert.match(inAppPetCss.pet,/\.pd-art\.pd-solid\{clip-path:none\}/);
  assert.match(inAppPetCss.pet,/\.pd-anchor\{[^}]*\}/);
  assert.match(inAppPetCss.panel,/.pd-panel\{[^}]*pointer-events:auto/);
  assert.ok(buildRemoveAllScript().includes('prismdesk-background'));
  assert.ok(buildRemoveAllScript().includes('__prismdeskCleanup'));
});

test('the character clip is the same ellipse the hit test uses',()=>{
  assert.deepEqual(characterEllipse,{radiusX:0.33,radiusY:0.37});
  assert.equal(characterClip,'ellipse(33% 37% at 50% 50%)');
  // Sample the hit rule on both sides of the clip, so a change to either the numbers in the hit test
  // or the numbers in the stylesheet fails here instead of silently routing a press to the wrong side.
  const size=100;
  assert.equal(isDefaultCharacterHit(size/2+size*characterEllipse.radiusX-1,size/2,size),true,'inside the horizontal radius');
  assert.equal(isDefaultCharacterHit(size/2+size*characterEllipse.radiusX+1,size/2,size),false,'outside the horizontal radius');
  assert.equal(isDefaultCharacterHit(size/2,size/2+size*characterEllipse.radiusY-1,size),true,'inside the vertical radius');
  assert.equal(isDefaultCharacterHit(size/2,size/2+size*characterEllipse.radiusY+1,size),false,'outside the vertical radius');
});

test('the pet stacks above the panel drawer it opens',()=>{
  const zIndex=(id:string)=>{
    const found=new RegExp(`#${id}\\{[^}]*z-index:(\\d+)`).exec(inAppPetCss.page);
    assert.ok(found,`${id} has a z-index`);
    return Number(found[1]);
  };
  assert.ok(zIndex('prismdesk-pet-host')>zIndex('prismdesk-panel-host'),'the pet the user clicks must never end up behind the drawer');
});

test('the settings window offers exactly the pet range the schema accepts',async()=>{
  const html=await readFile(new URL('../src/renderer/index.html',import.meta.url),'utf8');
  const control=/<input id="size" type="range" min="(\d+)" max="(\d+)" step="(\d+)" value="(\d+)">/.exec(html);
  assert.ok(control,'the pet size control is present');
  assert.deepEqual(control.slice(1).map(Number),[petSizeRange.min,petSizeRange.max,petSizeRange.step,petSizeRange.default]);
});

test('injecting twice leaves exactly one pet and one panel',()=>{
  const harness=createHarness();
  const first=inject(harness);
  assert.equal(first.ok,true);
  assert.equal(first.pets,1);
  assert.equal(first.panels,1);
  assert.equal(first.visible,true);
  inject(harness);
  inject(harness);
  assert.equal(harness.document.querySelectorAll('#prismdesk-pet-host').length,1);
  assert.equal(harness.document.querySelectorAll('#prismdesk-panel-host').length,1);
  assert.equal(harness.document.querySelectorAll('#prismdesk-pet-style').length,1);
  assert.equal(harness.win.__prismdeskInApp.counts().pets,1);
});

test('public destroy is idempotent and removes every PrismDesk surface',()=>{
  const harness=createHarness();inject(harness);
  const cleanup=harness.win.__PRISMDESK__;
  assert.equal(typeof cleanup.destroy,'function');
  assert.equal(cleanup.destroy(),true);assert.equal(cleanup.destroy(),true);
  assert.equal(harness.document.getElementById('prismdesk-pet-host'),null);
  assert.equal(harness.document.getElementById('prismdesk-panel-host'),null);
  assert.equal(harness.document.getElementById('prismdesk-pet-style'),null);
  assert.equal(harness.win.__PRISMDESK__,undefined);
  assert.equal(harness.win.listeners.length,0);
});

test('heartbeat cleanup is armed and every sync refreshes it',()=>{
  const harness=createHarness();const script=buildInAppScript(harness.config());const sync=buildInAppSyncScript(harness.config(),false);
  assert.match(script,/Date\.now\(\)-lastHeartbeat>12000/);
  assert.match(script,/clearInterval\(heartbeatTimer\)/);
  assert.match(sync,/__PRISMDESK__\.heartbeat/);
});

test('settings panel uses large glass layout with navigation',()=>{
  const harness=createHarness();inject(harness);const root=panelHost(harness).shadowRoot;
  assert.ok(root.querySelector('.pd-main'));assert.ok(root.querySelector('.pd-nav'));assert.ok(root.querySelector('.pd-content'));
  assert.match(inAppPetCss.panel,/width:78vw/);assert.match(inAppPetCss.panel,/height:82vh/);assert.match(inAppPetCss.panel,/backdrop-filter:blur/);
});

test('the injected panel identifies Wallpaper Engine as experimental',()=>{
  const harness=createHarness();
  inject(harness,{wallpaperEngine:{installed:true,running:false,experimental:true}});
  const root=panelHost(harness).shadowRoot;
  assert.equal(root.querySelector('.pd-experimental').textContent,'实验性功能');
  assert.match(root.querySelector('.pd-status').textContent,/已安装.*未运行/);
});

test('the default placement lands below the chrome band the page owns',()=>{
  const harness=createHarness();
  // The top-right corner belongs to a window-control band, exactly like the one WorkBuddy paints.
  const band=harness.document.createElement('div');
  band.id='window-controls';
  band.rect={x:1204,y:0,width:138,height:30,top:0,left:1204,right:1342,bottom:30};
  harness.document.body.appendChild(band);
  harness.document.hitTest=band;
  inject(harness);
  assert.equal(harness.api().verify().chromeInset,30,'the band the placement measured is the band the page has');
  assert.equal(petHost(harness).shadowRoot.querySelector('.pd-anchor').style.transform,'translate3d(940px,42px,0)');
  // A corner that belongs to the client root must not be read as a titlebar: that would push the pet
  // to the bottom of the window, which is the placement this rule exists to move away from.
  const tall=createHarness();
  const root=tall.document.createElement('div');
  root.id='root';
  root.rect={x:0,y:0,width:1000,height:800,top:0,left:0,right:1000,bottom:800};
  tall.document.body.appendChild(root);
  tall.document.hitTest=root;
  inject(tall);
  assert.equal(petHost(tall).shadowRoot.querySelector('.pd-anchor').style.transform,'translate3d(940px,12px,0)');
});


test('the measured corner is never re-read from the payload own panel',()=>{
  const harness=createHarness();
  const band=harness.document.createElement('div');
  band.id='window-controls';
  band.rect={x:1204,y:0,width:138,height:30,top:0,left:1204,right:1342,bottom:30};
  harness.document.body.appendChild(band);
  harness.document.hitTest=band;
  inject(harness);
  const anchor=()=>petHost(harness).shadowRoot.querySelector('.pd-anchor').style.transform;
  assert.equal(anchor(),'translate3d(940px,42px,0)');
  // Opening the panel covers the corner and takes the pointer, so a re-measure at that moment finds
  // the payload instead of the client's chrome. Dropping the offset would move the pet up over the
  // very window controls the offset exists to keep it away from.
  harness.document.hitTest=panelHost(harness);
  harness.evaluate(buildInAppSyncScript(harness.config(),false));
  assert.equal(anchor(),'translate3d(940px,42px,0)');
  assert.equal(harness.api().verify().chromeInset,30);
});
test('a click on the pet toggles the in-client panel',()=>{
  const harness=createHarness();
  const page=app(harness);
  inject(harness);
  const backdrop=panelHost(harness).shadowRoot.querySelector('.pd-backdrop');
  const pet=petCenter();
  assert.equal(harness.api().counts().open,false);
  harness.fire('pointerdown',page,pet);
  harness.fire('pointerup',page,pet);
  assert.equal(harness.api().counts().open,true);
  assert.equal(backdrop.classList.contains('pd-open'),true);
  harness.fire('pointerdown',backdrop,{clientX:20,clientY:20});
  assert.equal(harness.api().counts().open,false);
  // The panel's own close button must work, and clicking the page elsewhere closes the panel
  // without the page losing that click.
  harness.fire('pointerdown',page,pet);
  harness.fire('pointerup',page,pet);
  const close=panelHost(harness).shadowRoot.querySelector('.pd-close');
  harness.fire('click',close,{});
  assert.equal(harness.api().counts().open,false);
  harness.fire('pointerdown',page,pet);
  harness.fire('pointerup',page,pet);
  let pagePresses=0;
  page.addEventListener('mousedown',()=>{pagePresses+=1});
  const away=harness.fire('pointerdown',page,{clientX:120,clientY:120});
  harness.fire('mousedown',page,{clientX:120,clientY:120});
  assert.equal(away.defaultPrevented,false);
  assert.equal(pagePresses,1);
  assert.equal(harness.api().counts().open,false);
});

test('Escape and the glass backdrop close the in-client panel',()=>{
  const harness=createHarness();
  const page=app(harness);
  inject(harness);
  const pet=petCenter();
  harness.fire('pointerdown',page,pet);harness.fire('pointerup',page,pet);
  assert.equal(harness.api().counts().open,true);
  harness.fire('keydown',page,{key:'Escape'});
  assert.equal(harness.api().counts().open,false);
  harness.fire('pointerdown',page,pet);harness.fire('pointerup',page,pet);
  const backdrop=panelHost(harness).shadowRoot.querySelector('.pd-backdrop');
  harness.fire('pointerdown',backdrop,{clientX:20,clientY:20});
  assert.equal(harness.api().counts().open,false);
});

test('the pet owns only its own pixels: input, copy, scroll and page listeners are untouched',()=>{
  const harness=createHarness();
  const page=app(harness);
  const counters={mousedown:0,click:0,selectstart:0,wheel:0,keydown:0,input:0};
  for(const type of Object.keys(counters))page.addEventListener(type,()=>{counters[type as keyof typeof counters]+=1});
  const listenersBefore=page.listeners.length;
  inject(harness);
  assert.equal(page.listeners.length,listenersBefore,'the payload must not attach listeners to page nodes');
  const pet=petCenter();
  const down=harness.fire('pointerdown',page,pet);
  assert.equal(down.defaultPrevented,true,'a press on the character is consumed by the pet');
  harness.fire('mousedown',page,pet);
  harness.fire('selectstart',page,pet);
  harness.fire('click',page,pet);
  harness.fire('contextmenu',page,pet);
  assert.deepEqual(counters,{mousedown:0,click:0,selectstart:0,wheel:0,keydown:0,input:0});
  harness.fire('pointerup',page,pet);
  // A new press away from the pet reaches the page again, and wheel/keyboard input never reaches
  // the payload at all, so scrolling and typing are unaffected.
  const away=harness.fire('pointerdown',page,{clientX:120,clientY:120});
  assert.equal(away.defaultPrevented,false);
  harness.fire('mousedown',page,{clientX:120,clientY:120});
  harness.fire('mouseup',page,{clientX:120,clientY:120});
  harness.fire('click',page,{clientX:120,clientY:120});
  harness.fire('wheel',page,{clientX:864,clientY:664});
  harness.fire('keydown',page,{clientX:864,clientY:664});
  harness.fire('input',page,{clientX:864,clientY:664});
  assert.deepEqual(counters,{mousedown:1,click:1,selectstart:0,wheel:1,keydown:1,input:1});
});

test('a press on the transparent margin of the character falls through to the page',()=>{
  const harness=createHarness();
  const page=app(harness);
  inject(harness);
  // The box corner belongs to the pet window but not to the character silhouette.
  const corner=harness.fire('pointerdown',page,{clientX:852,clientY:652});
  assert.equal(corner.defaultPrevented,false);
  assert.equal(harness.api().counts().open,false);
});

test('a wheel that lands on the character scrolls what is underneath it',()=>{
  const harness=createHarness();
  const page=app(harness);
  inject(harness);
  const scroller=harness.document.createElement('div');
  scroller.scrollHeight=1200; scroller.clientHeight=400; scroller.scrollTop=300; scroller.scrollLeft=5;
  scroller.computedStyle={overflowY:'auto',overflowX:'auto',pointerEvents:'auto',getPropertyValue:()=>'none'};
  page.appendChild(scroller);
  harness.document.hitTest=scroller;
  const pet=petCenter();
  const over=harness.fire('wheel',page,{clientX:pet.clientX,clientY:pet.clientY,deltaY:120,deltaX:8});
  assert.equal(over.defaultPrevented,true,'a wheel on the character is answered by the pet');
  assert.equal(scroller.scrollTop,420,'the scroller under the character takes the delta');
  assert.equal(scroller.scrollLeft,13);
  const away=harness.fire('wheel',page,{clientX:120,clientY:120,deltaY:120});
  assert.equal(away.defaultPrevented,false,'a wheel anywhere else is left to the page');
  assert.equal(scroller.scrollTop,420);
});

test('a press that arrives on the pet host itself still drags the character',()=>{
  const harness=createHarness();
  inject(harness);
  const host=petHost(harness);
  const pet=petCenter();
  // The character is a real hit target now, so the browser retargets a press on it to the host
  // element instead of the page underneath. That press has to become a drag, not be ignored.
  const down=harness.fire('pointerdown',host,pet);
  assert.equal(down.defaultPrevented,true,'a press on the host is consumed by the pet');
  harness.fire('pointermove',host,{clientX:pet.clientX-40,clientY:pet.clientY+20});
  harness.fire('pointerup',host,{clientX:pet.clientX-40,clientY:pet.clientY+20});
  const box=harness.api().verify().box;
  const start=placedBox();
  assert.deepEqual({x:box.x,y:box.y},{x:start.x-40,y:start.y+20});
  assert.equal(harness.api().counts().open,false,'a drag never toggles the panel');
  assert.equal(harness.api().requests.filter((request:{type:string})=>request.type==='move').length,1,'the new place is queued for main');
  const elsewhere=harness.fire('pointerdown',host,{clientX:100,clientY:100});
  assert.equal(elsewhere.defaultPrevented,false,'a press on the host away from the character is not ours');
});

test('a drag survives the pointer moving off the character, but not off the page',()=>{
  const harness=createHarness();
  const page=app(harness);
  inject(harness);
  const host=petHost(harness);
  const start=placedBox();
  harness.fire('pointerdown',host,petCenter());
  harness.fire('pointermove',host,{clientX:start.x+24-30,clientY:start.y+24+10});
  // The pointer is over a page element now: leaving the character must not end the gesture, or the
  // pet could only ever be dragged while the cursor stayed inside its own 48 px box.
  harness.fire('mouseleave',page,{clientX:start.x+24-30,clientY:start.y+24+10});
  harness.fire('pointermove',host,{clientX:start.x+24-60,clientY:start.y+24+30});
  harness.fire('pointerup',host,{clientX:start.x+24-60,clientY:start.y+24+30});
  const box=harness.api().verify().box;
  assert.deepEqual({x:box.x,y:box.y},{x:start.x-60,y:start.y+30});
  // Leaving the page itself still ends the gesture where it was: the pointer is gone.
  const placed=harness.api().verify().box;
  const centre={clientX:placed.x+24,clientY:placed.y+24};
  harness.fire('pointerdown',host,centre);
  harness.fire('pointermove',host,{clientX:centre.clientX-10,clientY:centre.clientY+10});
  harness.fire('mouseleave',harness.document.documentElement,{clientX:-5,clientY:10});
  harness.fire('pointermove',host,{clientX:centre.clientX-80,clientY:centre.clientY+40});
  harness.fire('pointerup',host,{clientX:centre.clientX-80,clientY:centre.clientY+40});
  const ended=harness.api().verify().box;
  assert.deepEqual({x:ended.x,y:ended.y},{x:placed.x-10,y:placed.y+10});
});

test('transparent artwork pixels fall through, mirrored artwork samples the flipped pixel',()=>{
  let alpha=0;
  const transparent=createHarness({alpha:()=>alpha});
  const page=app(transparent);
  inject(transparent,{petImage:'data:image/png;base64,AAAA'});
  const pet=petCenter();
  assert.equal(transparent.fire('pointerdown',page,pet).defaultPrevented,false);
  assert.equal(transparent.api().counts().open,false);
  alpha=255;
  assert.equal(transparent.fire('pointerdown',page,pet).defaultPrevented,true);
  const size=petSizeRange.default;
  assert.deepEqual(transparent.samples.at(-1),{x:size/2,y:size/2});

  const mirrored=createHarness({alpha:()=>255});
  inject(mirrored,{petImage:'data:image/png;base64,AAAA',theme:themeWith({mirror:true})});
  mirrored.fire('pointerdown',app(mirrored),pet);
  assert.deepEqual(mirrored.samples.at(-1),{x:size/2-1,y:size/2});
});

test('dragging moves the pet inside the window and reports the position',()=>{
  const harness=createHarness();
  const page=app(harness);
  inject(harness);
  const pet=petCenter();
  const box=placedBox();
  harness.fire('pointerdown',page,pet);
  harness.fire('pointermove',page,{clientX:pet.clientX-2,clientY:pet.clientY-2});
  assert.equal(harness.api().counts().open,false,'a press that has not moved yet is not a click either');
  harness.fire('pointermove',page,{clientX:700,clientY:500});
  harness.fire('pointerup',page,{clientX:700,clientY:500});
  const moved={x:box.x+(700-pet.clientX),y:box.y+(500-pet.clientY)};
  assert.deepEqual(harness.api().requests,[{type:'move',x:moved.x,y:moved.y}]);
  assert.equal(petHost(harness).shadowRoot.querySelector('.pd-anchor').style.transform,`translate3d(${moved.x}px,${moved.y}px,0)`);
  assert.equal(harness.api().counts().open,false,'a drag must never open the panel');
  // A fast drag beyond the window edge is clamped to the client window.
  harness.fire('pointerdown',page,{clientX:moved.x+Math.floor(box.size/2),clientY:moved.y+Math.floor(box.size/2)});
  harness.fire('pointermove',page,{clientX:5000,clientY:5000});
  harness.fire('pointerup',page,{clientX:5000,clientY:5000});
  assert.deepEqual(harness.api().requests.at(-1),{type:'move',x:PAGE.width-box.size,y:PAGE.height-box.size});
});

test('the resize handle scales the pet and reports the size',()=>{
  const harness=createHarness();
  const page=app(harness);
  inject(harness);
  const box=placedBox();
  const handleSize=resizeHandleSize(box.size,18);
  const handle={clientX:box.x+box.size-Math.floor(handleSize/2),clientY:box.y+box.size-Math.floor(handleSize/2)};
  harness.fire('pointerdown',page,handle);
  assert.equal(harness.api().counts().open,false,'the handle is not the character');
  harness.fire('pointermove',page,{clientX:handle.clientX+30,clientY:handle.clientY+30});
  harness.fire('pointerup',page,{clientX:handle.clientX+30,clientY:handle.clientY+30});
  assert.deepEqual(harness.api().requests,[{type:'resize',x:PAGE.width-(box.size+30),y:box.y,size:box.size+30}]);
  assert.equal(harness.api().requests[0].size<=petSizeRange.max,true);
});

test('a panel slider previews the background locally and queues exactly one save',()=>{
  const harness=createHarness();
  const background=harness.document.createElement('div');
  background.id='prismdesk-background';
  harness.document.body.appendChild(background);
  inject(harness);
  const controls=panelHost(harness).shadowRoot.querySelectorAll('input');
  const brightness=controls.find((node:any)=>node.type==='range');
  assert.ok(brightness);
  brightness.value='0.5';
  harness.fire('input',brightness,{});
  assert.match(background.style.filter,/brightness\(0\.5\)/);
  harness.runTimers();
  const saves=harness.api().requests.filter((request:any)=>request.type==='save');
  assert.equal(saves.length,1);
  assert.equal(saves[0].theme.brightness,0.5);
  assert.equal(parseInAppRequests(saves).length,1);
  brightness.value='0.4';
  harness.fire('input',brightness,{});
  brightness.value='0.3';
  harness.fire('input',brightness,{});
  harness.runTimers();
  assert.equal(harness.api().requests.filter((request:any)=>request.type==='save').length,2,'the debounce must collapse a drag into one save');
});

test('restore default removes the pet, the panel, the styles and the listeners',()=>{
  const harness=createHarness();
  const page=app(harness);
  const background=harness.document.createElement('div');
  background.id='prismdesk-background';
  harness.document.body.appendChild(background);
  inject(harness);
  const listeners=harness.win.listeners.length;
  assert.ok(listeners>0);
  const petOnly=harness.evaluate(buildRemovePetScript());
  assert.deepEqual(petOnly,{pets:0,panels:0,present:false});
  assert.equal(harness.document.getElementById('prismdesk-pet-host'),null);
  assert.equal(harness.document.getElementById('prismdesk-panel-host'),null);
  assert.equal(harness.win.listeners.length,0,'every listener registered by the payload must be removed');
  assert.equal(harness.document.getElementById('prismdesk-background'),background,'removing the pet must not touch the background');

  inject(harness);
  assert.equal(harness.evaluate(buildRemoveAllScript()).restored,true);
  assert.equal(harness.document.getElementById('prismdesk-background'),null);
  assert.equal(harness.document.getElementById('prismdesk-pet-style'),null);
  assert.equal(harness.win.__prismdeskInApp,undefined);
  assert.equal(harness.document.documentElement.getAttribute('data-prismdesk-pet-state'),null);
  assert.equal(harness.fire('pointerdown',page,petCenter()).defaultPrevented,false);
});

test('the sync probe reports a missing payload and drains the request queue',()=>{
  const harness=createHarness();
  const config=harness.config();
  assert.deepEqual(harness.evaluate(buildInAppSyncScript(config,false)),{present:false});
  inject(harness);
  harness.api().requests.push({type:'move',x:10,y:20});
  const sync=harness.evaluate(buildInAppSyncScript(config,false));
  assert.equal(sync.present,true);
  assert.deepEqual(sync.requests,[{type:'move',x:10,y:20}]);
  assert.deepEqual(harness.api().requests,[]);
  const status=harness.evaluate(buildInAppStatusScript());
  assert.equal(status.present,true);
  assert.equal(status.pets,1);
  assert.equal(status.panels,1);
  assert.equal(status.open,false);
  assert.deepEqual(status.box,{x:940,y:12,size:48},'the status probe reports the placement it measured');
  assert.equal(status.onScreen,false,'the model document has no layout, so nothing can be painted');
});

test('a reloaded page has no payload, so the control loop re-injects one pet and one panel',()=>{
  const before=createHarness();
  inject(before,{petImage:'data:image/png;base64,AAAA',theme:themeWith({size:96,mirror:true})});
  assert.equal(before.document.querySelectorAll('#prismdesk-pet-host').length,1);
  // A navigation or reload throws the document away; the main process only knows the page again on
  // the next tick, when the probe reports no instance and the full payload is written again.
  const after=createHarness();
  assert.deepEqual(after.evaluate(buildInAppSyncScript(after.config(),true)),{present:false});
  const state=after.evaluate(buildInAppScript(after.config({petImage:'data:image/png;base64,AAAA',theme:themeWith({size:96,mirror:true})})));
  assert.equal(state.pets,1);
  assert.equal(after.document.querySelectorAll('#prismdesk-panel-host').length,1);
  assert.equal(after.api().requests.length,0);
});

test('a client DOM rebuild is visible to the supervisor probe',()=>{
  const harness=createHarness();
  inject(harness);
  petHost(harness).remove();panelHost(harness).remove();
  const probe=harness.evaluate(buildInAppSyncScript(harness.config(),false));
  assert.equal(probe.present,true);
  assert.deepEqual([probe.pets,probe.panels],[0,0]);
  const restored=harness.evaluate(buildInAppScript(harness.config()));
  assert.deepEqual([restored.pets,restored.panels],[1,1]);
});

const petWidth=(harness:Harness)=>petHost(harness).shadowRoot.querySelector('.pd-anchor').children[0].style.width;
const sizeSlider=(harness:Harness)=>panelHost(harness).shadowRoot.querySelectorAll('input').find((node:any)=>node.type==='range'&&node.min===String(petSizeRange.min));

test('the panel size control resizes the pet without waiting for a round trip',()=>{
  const harness=createHarness();
  inject(harness);
  assert.equal(petWidth(harness),`${defaultPetAppearance.size}px`);
  const size=sizeSlider(harness);
  assert.ok(size,'the in-client panel must offer a pet size control');
  size.value='160';
  harness.fire('input',size,{});
  assert.equal(petWidth(harness),'160px','the pet must follow the size control immediately');
  harness.runTimers();
  assert.deepEqual(harness.api().requests.filter((request:any)=>request.type==='resize'),[{type:'resize',x:defaultBox(PAGE,160,0).x,y:12,size:160}]);
});

test('a state push never overrides a control the user is still holding',()=>{
  const harness=createHarness();
  inject(harness,{box:{x:100,y:120,size:48}});
  const size=sizeSlider(harness);
  size.value='160';
  harness.fire('input',size,{});
  assert.equal(petWidth(harness),'160px');
  // Main has not stored the edit yet, so the next push still carries the previous size.
  const pushed:any=harness.evaluate(buildInAppSyncScript(harness.config({box:{x:100,y:120,size:48}}),false));
  assert.equal(pushed.present,true,'the push must reach an injected page');
  assert.equal(petWidth(harness),'160px','an in-flight push must not snap the pet back');
});
