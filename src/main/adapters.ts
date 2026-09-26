import { execFile, spawn } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, extname } from 'node:path';
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
  quit:()=>void;
};
type PageSession = { session:CdpSession; sentImage:string|null; lastState:string };
type WallpaperEngineState={installed:boolean;running:boolean;experimental:true;path:string|null};
type Loop = { theme:Theme; memory:InAppPetMemory; sessions:Map<string,PageSession>; timer:ReturnType<typeof setInterval>|null; busy:boolean; petImagePath:string|undefined; petImage:string|null; wallpaperEngine:WallpaperEngineState; notice:{kind:'info'|'error';text:string;nonce:number}|null };
const loops=new Map<TargetId,Loop>();
let deps:InAppDeps|undefined;
export function initInApp(next:InAppDeps){ deps=next }
// Roll out the new in-client settings surface to WorkBuddy first. Codex keeps its existing manual
// apply path until the WorkBuddy pass has been visually accepted.
const targetIds:TargetId[]=['codex','workbuddy'];

// ---------------------------------------------------------------------------
// Injection log.
//
// The record a user can point at when a client shows no pet: which page was driven, what the payload
// returned for it, and the payload's own answer to "is the pet actually painted". Every entry is
// appended to `injection.log` in the PrismDesk configuration directory as well, so the evidence
// survives the window that was open when the problem happened.
// ---------------------------------------------------------------------------
export type InjectionLogEntry = { at:number; target:TargetId; event:string; detail?:unknown };
const injectionLogLimit=600;
const injectionLogFileLimit=4000;
const injectionLogEntries:InjectionLogEntry[]=[];
let injectionLogLines=0;
let injectionLogPath:string|undefined;
export function setInjectionLogPath(path:string){ injectionLogPath=path }
export function injectionLog(){ return [...injectionLogEntries] }
function errorMessage(error:unknown){ return error instanceof Error?error.message:String(error) }
function log(target:TargetId, event:string, detail?:unknown){
  injectionLogEntries.push({ at:Date.now(), target, event, detail });
  if(injectionLogEntries.length>injectionLogLimit)injectionLogEntries.splice(0,injectionLogEntries.length-injectionLogLimit);
  if(!injectionLogPath)return;
  const line=`${JSON.stringify({ at:Date.now(), target, event, detail })}\n`;
  // The file keeps its last injectionLogFileLimit lines so a client left running for days cannot fill
  // the disk with one entry per tick.
  injectionLogLines+=1;
  if(injectionLogLines>injectionLogFileLimit){injectionLogLines=1;void writeFile(injectionLogPath,line).catch(()=>{});return}
  void appendFile(injectionLogPath,line).catch(()=>{});
}
const defs={
  workbuddy:{name:'WorkBuddy',port:9223,exe:`${process.env.LOCALAPPDATA}\\Programs\\WorkBuddy\\WorkBuddy.exe`,hint:'renderer/index.html'},
  codex:{name:'Codex',port:9222,exe:'',hint:'app://'}
} as const;
const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
async function exists(path:string){try{await readFile(path);return true}catch{return false}}
async function detectWallpaperEngine():Promise<WallpaperEngineState>{
  const paths=[`${process.env.ProgramFiles??'C:\\Program Files (x86)'}\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe`,`${process.env['ProgramFiles(x86)']??'C:\\Program Files (x86)'}\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe`];
  const path=paths.find(path=>existsSync(path))??null;const installed=Boolean(path);
  let running=false;try{const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',"[bool](Get-Process wallpaper32,wallpaper64 -ErrorAction SilentlyContinue)"]);running=stdout.trim()==='True'}catch{}
  return {installed,running,experimental:true,path};
}
async function versionOf(path:string){if(!path)return undefined;try{const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`(Get-Item -LiteralPath '${path.replaceAll("'","''")}').VersionInfo.ProductVersion`]);return stdout.trim()}catch{return undefined}}
async function definition(id:TargetId){if(id==='codex'){try{const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',"(Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1 | ConvertTo-Json -Compress)"]);const p=JSON.parse(stdout);return {...defs.codex,exe:`${p.InstallLocation}\\app\\ChatGPT.exe`,version:String(p.Version)}}catch{return {...defs.codex,version:undefined}}}return {...defs.workbuddy,version:await versionOf(defs.workbuddy.exe)}}
async function matching(id:TargetId){const d=await definition(id);const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`$c=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort ${d.port} -State Listen -ErrorAction SilentlyContinue|Select-Object -First 1;if($c){(Get-Process -Id $c.OwningProcess).Path}`]);if(!stdout.trim()||stdout.trim().toLowerCase()!==d.exe.toLowerCase())throw new Error('调试端口不属于指定客户端');const list=await targets(d.port);const pages=list.filter(t=>t.type==='page'&&(id==='codex'?t.url==='app://-/index.html':t.url.includes(d.hint))&&new URL(t.webSocketDebuggerUrl).hostname==='127.0.0.1');if(!pages.length)throw new Error('调试端口属于指定客户端，但未找到兼容的主渲染页');return {d,pages}}
export async function status(id:TargetId):Promise<TargetStatus>{const d=await definition(id);const installed=await exists(d.exe);if(!installed)return{id,name:d.name,installed:false,running:false,connected:false,status:'not_installed',detail:'未安装'};let running=false;try{const {stdout}=await exec('powershell.exe',['-NoProfile','-Command',`[bool](Get-Process -Name '${id==='codex'?'ChatGPT':'WorkBuddy'}' -ErrorAction SilentlyContinue)`]);running=stdout.trim()==='True'}catch{};try{const {pages}=await matching(id);const states=await Promise.all(pages.map(async p=>{const state=await evaluate(p.webSocketDebuggerUrl,statusScript) as any;let pet=false;try{const probe=await evaluate(p.webSocketDebuggerUrl,buildInAppStatusScript()) as any;pet=Boolean(probe?.present)}catch(error){pet=false}return {...state,pet}})) as any[];const applied=states.some(s=>s?.applied);const pet=states.some(s=>s?.pet);return{id,name:d.name,installed:true,running:true,connected:true,version:d.version,installPath:d.exe,status:applied?'applied':'connected',pet,detail:applied?(pet?'已应用 · 悬浮宠物':'已应用'):(pet?'悬浮宠物已注入':'已连接')}}catch(error){return{id,name:d.name,installed:true,running,connected:false,version:d.version,installPath:d.exe,status:running?'needs_restart':'not_running',detail:running?'需要以本机调试模式重启':'未运行'}}}
export async function launch(id:TargetId){const s=await status(id);if(s.running&&!s.connected)throw new Error(`${s.name} 正在运行；为避免中断任务，PrismDesk 不会自动重启。请先手动退出后再连接。`);if(s.connected)return s;const d=await definition(id);if(!await exists(d.exe))throw new Error('客户端未安装');if(id==='codex'){const dev=join(process.cwd(),'scripts','launch-codex-cdp.ps1');const packaged=join(process.resourcesPath,'app.asar.unpacked','scripts','launch-codex-cdp.ps1');const script=existsSync(dev)?dev:packaged;await exec('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Port',String(d.port)],{timeout:35_000})}else{spawn(d.exe,[`--remote-debugging-address=127.0.0.1`,`--remote-debugging-port=${d.port}`],{detached:true,stdio:'ignore'}).unref()}for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,500));const now=await status(id);if(now.connected)return now}throw new Error('客户端调试端口未就绪')}
export async function apply(id:TargetId,theme:Theme){const {pages}=await matching(id);const data=await backgroundData(theme);const results=await Promise.all(pages.map(p=>evaluate(p.webSocketDebuggerUrl,buildApplyScript(theme,data)))) as any[];if(results.some(r=>!r?.ok))throw new Error('注入校验失败');if(theme.petMode==='in-app'){await startLoop(id,theme)}else{await stopLoop(id);await Promise.all(pages.map(p=>evaluate(p.webSocketDebuggerUrl,buildRemovePetScript())))}return {targets:results.length,results,pet:theme.petMode==='in-app'}}
async function backgroundData(theme:Theme){if(theme.kind!=='image'||!theme.imagePath)return undefined;const bytes=await readFile(theme.imagePath);const type=mime[extname(theme.imagePath).toLowerCase()];if(!type)throw new Error('图片类型不支持');return `data:${type};base64,${bytes.toString('base64')}`}
export async function restore(id:TargetId){await stopLoop(id);const {pages}=await matching(id);const results=await Promise.all(pages.map(p=>evaluate(p.webSocketDebuggerUrl,buildRemoveAllScript())));return {targets:results.length,restored:results.every(Boolean)}}
function depsOrThrow(){if(!deps)throw new Error('PrismDesk 未初始化');return deps}
// The in-client pet has to come back on its own: after a PrismDesk restart, after a client restart and
// after switching back from the desktop pet. Pressing the apply button is one way in, but it is not
// the only moment the pet is wanted, so main reconciles the control loop whenever an in-client pet is
// configured and a client is listening. The port probe is a plain HTTP request, so the check stays
// cheap while no client is running: no PowerShell, no CDP session, no client-side side effect.
const ensuring=new Set<TargetId>();
async function portAnswers(id:TargetId){try{return (await targets(defs[id].port)).some(entry=>entry.type==='page')}catch(error){return false}}
export async function ensureInApp(id:TargetId):Promise<boolean>{
  if(!deps||loops.has(id)||ensuring.has(id))return loops.has(id);
  ensuring.add(id);
  try{
    const theme=await deps.store.load();
    if(theme.petMode!=='in-app'){if(loops.has(id))await stopLoop(id);return false}
    if(!await portAnswers(id))return false;
    await startLoop(id,theme);
    log(id,'loop-start',{reason:'ensure'});
    return true;
  }catch(error){log(id,'loop-failed',{message:errorMessage(error)});return false}
  finally{ensuring.delete(id)}
}
let supervisorTimer:ReturnType<typeof setInterval>|null=null;
// A slow reconcile, not a poll: while a client is absent the probe is one failed request to a closed
// port, and when it appears the pet is back within one interval.
export function startInAppSupervisor(){
  if(supervisorTimer)return;
  supervisorTimer=setInterval(()=>{for(const id of targetIds)void ensureInApp(id)},5000);
}
export function stopInAppSupervisor(){if(!supervisorTimer)return;clearInterval(supervisorTimer);supervisorTimer=null}
// The pet bobs, so its rect is always a few pixels different and cannot take part in the comparison:
// the signature is the set of facts that mean "something actually changed for the user".
function stateSignature(verify:any){
  if(!verify)return 'none';
  const box=verify.box??{};
  return [verify.onScreen,box.x,box.y,box.size,verify.panel?.open,verify.art?.complete,verify.art?.local,verify.art?.pointer,verify.under?.node,verify.under?.appRegion,verify.under?.dragBand,verify.chromeInset,verify.hostStyle?.display,verify.hostRect?.width,verify.hostRect?.height].join('|');
}
export async function startLoop(id:TargetId,theme:Theme){
  const d=depsOrThrow();
  let loop=loops.get(id);
  if(!loop){loop={theme,memory:await d.memory.load(),sessions:new Map(),timer:null,busy:false,petImagePath:undefined,petImage:null,wallpaperEngine:await detectWallpaperEngine(),notice:null};loops.set(id,loop)}
  loop.theme=theme;
  await syncPetImage(loop);
  if(!loop.timer)loop.timer=setInterval(()=>{void tick(id)},tickMs);
  await tick(id);
}
export async function stopLoop(id:TargetId){
  const loop=loops.get(id);
  if(!loop)return;
  log(id,'loop-stop',{});
  loops.delete(id);
  if(loop.timer)clearInterval(loop.timer);
  loop.timer=null;
  for(const entry of loop.sessions.values())entry.session.close();
  loop.sessions.clear();
}
export function stopAllLoops(){for(const id of [...loops.keys()])void stopLoop(id)}
// Best-effort bounded cleanup used by the real application quit path. It reconnects instead of
// trusting the session cache, so pages injected before a renderer reload are cleaned as well.
export async function cleanupAllInjected(){
  stopInAppSupervisor();
  const results:Record<string,unknown>={};
  for(const id of ['codex','workbuddy'] as TargetId[]){
    try{const {pages}=await matching(id);results[id]=await Promise.all(pages.map(page=>evaluate(page.webSocketDebuggerUrl,buildRemoveAllScript())))}
    catch(error){results[id]={skipped:true,message:errorMessage(error)}}
  }
  stopAllLoops();return results;
}
// Switching to the desktop pet has to take the in-client pet away as well, or the window would show
// two pets. A client that is closed or restarting has nothing to remove, so this never throws.
export async function removeInjectedPet(id:TargetId){
  try{
    const {pages}=await matching(id);
    const results=await Promise.all(pages.map(page=>evaluate(page.webSocketDebuggerUrl,buildRemovePetScript())));
    log(id,'pet-removed',{pages:results.length,results});
  }catch(error){log(id,'pet-remove-failed',{message:errorMessage(error)})}
}
// One tick per client: reconcile the page list, drain each page's request queue, and re-inject the
// payload into any page that no longer has one (reload, navigation, or a fresh window).
async function tick(id:TargetId){
  const loop=loops.get(id);
  if(!loop||loop.busy||!deps)return;
  loop.busy=true;
  try{
    const {pages}=await matching(id);
    const live=new Set(pages.map(page=>page.webSocketDebuggerUrl));
    for(const [url,entry] of loop.sessions){if(!live.has(url)){entry.session.close();loop.sessions.delete(url);log(id,'page-gone',{url})}}
    await syncPetImage(loop);
    for(const page of pages){
      if(!loops.has(id))return;
      const url=page.webSocketDebuggerUrl;
      let entry=loop.sessions.get(url);
      if(!entry||!entry.session.open){
        if(entry)entry.session.close();
        try{entry={session:await CdpSession.open(url),sentImage:null,lastState:''};loop.sessions.set(url,entry);log(id,'page',{url,title:page.title})}catch(error){log(id,'page-failed',{url,message:errorMessage(error)});continue}
      }
      const config:InAppConfig={target:id,theme:loop.theme,petImage:loop.petImage,box:loop.memory.clients[id]??null,wallpaperEngine:loop.wallpaperEngine,notice:loop.notice};
      let result:any;
      try{result=await entry.session.evaluate(buildInAppSyncScript(config,entry.sentImage!==loop.petImage))}
      catch(error){entry.session.close();loop.sessions.delete(url);log(id,'probe-failed',{url,message:errorMessage(error)});continue}
      if(!result?.present||result.pets!==1||result.panels!==1){
        try{const injected=await entry.session.evaluate(buildInAppScript(config));entry.sentImage=loop.petImage;log(id,'inject',{url,result:injected})}
        catch(error){entry.session.close();loop.sessions.delete(url);log(id,'inject-failed',{url,message:errorMessage(error)})}
        continue;
      }
      entry.sentImage=loop.petImage;
      // The page reports its own view of the pet; a change is what gets logged, so the file stays
      // readable while still catching a pet that silently stopped being painted.
      const state=stateSignature(result.verify);
      if(state!==entry.lastState){entry.lastState=state;log(id,'state',{url,verify:result.verify??null})}
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
  const config:InAppConfig={target:id,theme:loop.theme,petImage:loop.petImage,box:loop.memory.clients[id]??null,wallpaperEngine:loop.wallpaperEngine,notice:loop.notice};
  try{await entry.session.evaluate(buildInAppSyncScript(config,false))}
  catch(error){entry.session.close();loop.sessions.delete(url)}
}
async function handleRequests(id:TargetId,loop:Loop,requests:InAppRequest[]){
  for(const request of requests){
    try{await handleRequest(id,loop,request)}
    catch(error){loop.notice={kind:'error',text:errorMessage(error),nonce:Date.now()};log(id,'request-failed',{type:request.type,message:errorMessage(error)})}
  }
}
async function handleRequest(id:TargetId,loop:Loop,request:InAppRequest){
  const d=depsOrThrow();
  log(id,'request',request);
  if(request.type==='move'){
    const size=loop.memory.clients[id]?.size??loop.theme.pet.size;
    loop.memory={schemaVersion:2,clients:{...loop.memory.clients,[id]:{x:request.x,y:request.y,size}}};
    await d.memory.save(loop.memory);
    return;
  }
  if(request.type==='resize'){
    loop.memory={schemaVersion:2,clients:{...loop.memory.clients,[id]:{x:request.x,y:request.y,size:request.size}}};
    await d.memory.save(loop.memory);return;
  }
  if(request.type==='restore-pet'){await d.store.removePetImage();await saveTheme({...loop.theme,pet:{...defaultPetAppearance}});await syncPetImage(loop);loop.notice={kind:'info',text:'已恢复默认宠物。',nonce:Date.now()};return}
  if(request.type==='import-pet'){
    const file=await d.pickFile('pet');
    if(file){const imported=await d.store.importPetImage(file);await saveTheme({...loop.theme,pet:{...loop.theme.pet,imagePath:imported.path}});await syncPetImage(loop);loop.notice={kind:'info',text:'宠物图片已保存并应用。',nonce:Date.now()}}else loop.notice={kind:'info',text:'已取消选择文件。',nonce:Date.now()}
    return;
  }
  if(request.type==='import-background'){
    const file=await d.pickFile('background');
    if(file){const path=await d.store.importImage(file);await reapplyBackground(id,await saveTheme({...loop.theme,kind:'image',imagePath:path}));loop.notice={kind:'info',text:'背景图片已保存并应用。',nonce:Date.now()}}else loop.notice={kind:'info',text:'已取消选择文件。',nonce:Date.now()}
    return;
  }
  if(request.type==='restore-background'){await d.store.removeBackgroundImage();await reapplyBackground(id,await saveTheme({...loop.theme,kind:'aurora',imagePath:undefined}));loop.notice={kind:'info',text:'已恢复默认极光背景。',nonce:Date.now()};return}
  if(request.type==='wallpaper-open'){if(!loop.wallpaperEngine.path)throw new Error('未检测到 Wallpaper Engine');spawn(loop.wallpaperEngine.path,[],{detached:true,stdio:'ignore'}).unref();loop.notice={kind:'info',text:'已请求打开 Wallpaper Engine。',nonce:Date.now()};return}
  if(request.type==='wallpaper-folder'){if(!loop.wallpaperEngine.path)throw new Error('未检测到 Wallpaper Engine');spawn('explorer.exe',[dirname(loop.wallpaperEngine.path)],{detached:true,stdio:'ignore'}).unref();loop.notice={kind:'info',text:'已打开 Wallpaper Engine 安装目录。',nonce:Date.now()};return}
  if(request.type==='quit-app'){d.quit();return}
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
