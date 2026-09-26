import { execFile, spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { extname } from 'node:path';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { targets, evaluate, CdpSession } from './cdp.js';
import { buildApplyScript, removeScript, statusScript } from './injection.js';
import { buildInAppScript, buildInAppStatusScript, buildInAppSyncScript, buildRemoveAllScript, buildRemovePetScript, parseInAppRequests } from './in-app-pet.js';
import { defaultPetAppearance, type InAppConfig, type InAppRequest } from '../shared/in-app-pet.js';
import type { InAppPetMemory, InAppPetMemoryStore } from './in-app-state.js';
import type { Store } from './store.js';
import type { TargetId, TargetStatus, Theme } from '../shared/types.js';
const exec=promisify(execFile);

// ---------------------------------------------------------------------------
// In-client floating pet control loop.
//
// The page cannot call the main process, so main polls each injected page: one `Runtime.evaluate`
// per tick drains the page's request queue, pushes the current state back, and doubles as the
// presence probe. A page that was reloaded or navigated has no instance, so the full payload is
// re-injected on that same tick - that is what makes the pet survive page switches and reloads.
// ---------------------------------------------------------------------------
const tickMs=900;
export type InAppDeps = {
  memory:InAppPetMemoryStore;
  store:Store;
  pickFile:(kind:'pet'|'background')=>Promise<string|null>;
  notifyTheme:(theme:Theme)=>void;
};
type PageSession = { session:CdpSession; sentImage:string|null };
type Loop = { theme:Theme; memory:InAppPetMemory; sessions:Map<string,PageSession>; timer:ReturnType<typeof setInterval>|null; busy:boolean; petImagePath:string|undefined; petImage:string|null };
const loops=new Map<TargetId,Loop>();
let deps:InAppDeps|undefined;
export function initInApp(next:InAppDeps){ deps=next }
const defs={
  workbuddy:{name:'WorkBuddy',port:9223,exe:`${process.env.LOCALAPPDATA}\\Programs\\WorkBuddy\\WorkBuddy.exe`,hint:'renderer/index.html'},
  codex:{name:'Codex',port:9222,exe:'',hint:'app://'}
} as const;
const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
async function exists(path:string){try{await readFile(path);return true}catch{return false}}
async function versionOf(path:string){if(!path)return undefined;try{const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`(Get-Item -LiteralPath '${path.replaceAll("'","''")}').VersionInfo.ProductVersion`]);return stdout.trim()}catch{return undefined}}
async function definition(id:TargetId){if(id==='codex'){try{const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',"(Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1 | ConvertTo-Json -Compress)"]);const p=JSON.parse(stdout);return {...defs.codex,exe:`${p.InstallLocation}\\app\\ChatGPT.exe`,version:String(p.Version)}}catch{return {...defs.codex,version:undefined}}}return {...defs.workbuddy,version:await versionOf(defs.workbuddy.exe)}}
async function matching(id:TargetId){const d=await definition(id);const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`$c=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort ${d.port} -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1;if($c){(Get-Process -Id $c.OwningProcess).Path}`]);if(!stdout.trim()||stdout.trim().toLowerCase()!==d.exe.toLowerCase())throw new Error('调试端口不属于指定客户端');const list=await targets(d.port);const pages=list.filter(t=>t.type==='page'&&(id==='codex'?t.url==='app://-/index.html':t.url.includes(d.hint))&&new URL(t.webSocketDebuggerUrl).hostname==='127.0.0.1');if(!pages.length)throw new Error('调试端口属于指定客户端，但未找到兼容的主渲染页');return {d,pages}}
export async function status(id:TargetId):Promise<TargetStatus>{const d=await definition(id);const installed=await exists(d.exe);if(!installed)return{id,name:d.name,installed:false,running:false,connected:false,status:'not_installed',detail:'未安装'};let running=false;try{const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`[bool](Get-Process -Name '${id==='codex'?'ChatGPT':'WorkBuddy'}' -ErrorAction SilentlyContinue)`]);running=stdout.trim()==='True'}catch{};try{const {pages}=await matching(id);const states=await Promise.all(pages.map(async p=>{const state=await evaluate(p.webSocketDebuggerUrl,statusScript) as any;let pet=false;try{const probe=await evaluate(p.webSocketDebuggerUrl,buildInAppStatusScript()) as any;pet=Boolean(probe?.present)}catch(error){pet=false}return {...state,pet}})) as any[];const applied=states.some(s=>s?.applied);const pet=states.some(s=>s?.pet);return{id,name:d.name,installed:true,running:true,connected:true,version:d.version,installPath:d.exe,status:applied?'applied':'connected',pet,detail:applied?(pet?'已应用 · 悬浮宠物':'已应用'):(pet?'悬浮宠物已注入':'已连接')}}catch(error){return{id,name:d.name,installed:true,running,connected:false,version:d.version,installPath:d.exe,status:running?'needs_restart':'not_running',detail:running?'需要以本机调试模式重启':'未运行'}}}
export async function launch(id:TargetId){const s=await status(id);if(s.running&&!s.connected)throw new Error(`${s.name} 正在运行；为避免中断任务，PrismDesk 不会自动重启。请先手动退出后再连接。`);if(s.connected)return s;const d=await definition(id);if(!await exists(d.exe))throw new Error('客户端未安装');if(id==='codex'){const dev=join(process.cwd(),'scripts','launch-codex-cdp.ps1');const packaged=join(process.resourcesPath,'app.asar.unpacked','scripts','launch-codex-cdp.ps1');const script=existsSync(dev)?dev:packaged;await exec('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Port',String(d.port)],{timeout:35_000})}else{spawn(d.exe,[`--remote-debugging-address=127.0.0.1`,`--remote-debugging-port=${d.port}`],{detached:true,stdio:'ignore'}).unref()}for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,500));const now=await status(id);if(now.connected)return now}throw new Error('客户端调试端口未就绪')}
export async function apply(id:TargetId,theme:Theme){const {pages}=await matching(id);const data=await backgroundData(theme);const results=await Promise.all(pages.map(p=>evaluate(p.webSocketDebuggerUrl,buildApplyScript(theme,data)))) as any[];if(results.some(r=>!r?.ok))throw new Error('注入校验失败');if(theme.petMode==='in-app'){await startLoop(id,theme)}else{await stopLoop(id);await Promise.all(pages.map(p=>evaluate(p.webSocketDebuggerUrl,buildRemovePetScript())))}return {targets:results.length,results,pet:theme.petMode==='in-app'}}
async function backgroundData(theme:Theme){if(theme.kind!=='image'||!theme.imagePath)return undefined;const bytes=await readFile(theme.imagePath);const type=mime[extname(theme.imagePath).toLowerCase()];if(!type)throw new Error('图片类型不支持');return `data:${type};base64,${bytes.toString('base64')}`}
export async function restore(id:TargetId){await stopLoop(id);const {pages}=await matching(id);const results=await Promise.all(pages.map(p=>evaluate(p.webSocketDebuggerUrl,buildRemoveAllScript())));return {targets:results.length,restored:results.every(Boolean)}}
function depsOrThrow(){if(!deps)throw new Error('PrismDesk 未初始化');return deps}
export async function startLoop(id:TargetId,theme:Theme){
  const d=depsOrThrow();
  let loop=loops.get(id);
  if(!loop){loop={theme,memory:await d.memory.load(),sessions:new Map(),timer:null,busy:false,petImagePath:undefined,petImage:null};loops.set(id,loop)}
  loop.theme=theme;
  await syncPetImage(loop);
  if(!loop.timer)loop.timer=setInterval(()=>{void tick(id)},tickMs);
  await tick(id);
}
export async function stopLoop(id:TargetId){
  const loop=loops.get(id);
  if(!loop)return;
  loops.delete(id);
  if(loop.timer)clearInterval(loop.timer);
  loop.timer=null;
  for(const entry of loop.sessions.values())entry.session.close();
  loop.sessions.clear();
}
export function stopAllLoops(){for(const id of [...loops.keys()])void stopLoop(id)}
// One tick per client: reconcile the page list, drain each page's request queue, and re-inject the
// payload into any page that no longer has one (reload, navigation, or a fresh window).
async function tick(id:TargetId){
  const loop=loops.get(id);
  if(!loop||loop.busy||!deps)return;
  loop.busy=true;
  try{
    const {pages}=await matching(id);
    const live=new Set(pages.map(page=>page.webSocketDebuggerUrl));
    for(const [url,entry] of loop.sessions){if(!live.has(url)){entry.session.close();loop.sessions.delete(url)}}
    await syncPetImage(loop);
    for(const page of pages){
      if(!loops.has(id))return;
      const url=page.webSocketDebuggerUrl;
      let entry=loop.sessions.get(url);
      if(!entry||!entry.session.open){
        if(entry)entry.session.close();
        try{entry={session:await CdpSession.open(url),sentImage:null};loop.sessions.set(url,entry)}catch(error){continue}
      }
      const config:InAppConfig={target:id,theme:loop.theme,petImage:loop.petImage,box:loop.memory.clients[id]??null};
      let result:any;
      try{result=await entry.session.evaluate(buildInAppSyncScript(config,entry.sentImage!==loop.petImage))}
      catch(error){entry.session.close();loop.sessions.delete(url);continue}
      if(!result?.present){
        try{await entry.session.evaluate(buildInAppScript(config));entry.sentImage=loop.petImage}
        catch(error){entry.session.close();loop.sessions.delete(url)}
        continue;
      }
      entry.sentImage=loop.petImage;
      const requests=parseInAppRequests(result.requests);
      if(requests.length){await handleRequests(id,loop,requests);await pushBack(id,loop,url,entry)}
    }
  }catch(error){/* the client may be closed, restarting or mid-navigation; the next tick retries */}
finally{loop.busy=false}
}
// The page only sees its own edit once main has stored it and answered. Pushing the reconciled state
// back on the same tick stops a control the user just released from showing the value it replaced.
async function pushBack(id:TargetId,loop:Loop,url:string,entry:PageSession){
  if(loops.get(id)!==loop||!entry.session.open)return;
  const config:InAppConfig={target:id,theme:loop.theme,petImage:loop.petImage,box:loop.memory.clients[id]??null};
  try{await entry.session.evaluate(buildInAppSyncScript(config,false))}
  catch(error){entry.session.close();loop.sessions.delete(url)}
}
async function handleRequests(id:TargetId,loop:Loop,requests:InAppRequest[]){
  for(const request of requests){
    try{await handleRequest(id,loop,request)}
    catch(error){/* one rejected request must never kill the control loop */}
  }
}
async function handleRequest(id:TargetId,loop:Loop,request:InAppRequest){
  const d=depsOrThrow();
  if(request.type==='move'){
    loop.memory={schemaVersion:1,clients:{...loop.memory.clients,[id]:{x:request.x,y:request.y}}};
    await d.memory.save(loop.memory);
    return;
  }
  if(request.type==='resize'){await saveTheme({...loop.theme,pet:{...loop.theme.pet,size:request.size}});return}
  if(request.type==='restore-pet'){await d.store.removePetImage();await saveTheme({...loop.theme,pet:{...defaultPetAppearance}});return}
  if(request.type==='import-pet'){
    const file=await d.pickFile('pet');
    if(file){const imported=await d.store.importPetImage(file);await saveTheme({...loop.theme,pet:{...loop.theme.pet,imagePath:imported.path}})}
    return;
  }
  if(request.type==='import-background'){
    const file=await d.pickFile('background');
    if(file){const path=await d.store.importImage(file);await reapplyBackground(id,await saveTheme({...loop.theme,kind:'image',imagePath:path}))}
    return;
  }
  if(request.type==='save'){await reapplyBackground(id,await saveTheme(request.theme));return}
  if(request.type==='restore'){await restore(id)}
}
async function saveTheme(value:unknown){
  const theme=await depsOrThrow().store.save(value);
  for(const loop of loops.values())loop.theme=theme;
  deps?.notifyTheme(theme);
  return theme;
}
async function reapplyBackground(id:TargetId,theme:Theme){
  const data=await backgroundData(theme);
  const {pages}=await matching(id);
  await Promise.all(pages.map(page=>evaluate(page.webSocketDebuggerUrl,buildApplyScript(theme,data))));
}
async function syncPetImage(loop:Loop){
  const path=loop.theme.pet.imagePath;
  if(path===loop.petImagePath)return;
  loop.petImagePath=path;
  loop.petImage=await depsOrThrow().store.petImageData(path);
}
