import {
  characterDataUrl, inAppPetCss, inAppPetIds, inlinedRuntime, parseInAppRequests,
  inAppPetPayloadVersion, petAlphaThreshold, petDragThreshold, petResizeHandle, petSizeRange,
  type InAppConfig, type InAppRequest,
} from '../shared/in-app-pet.js';
import { wallpaperEngineFeature } from '../shared/in-app-settings.js';

// ---------------------------------------------------------------------------
// The payload that CDP writes into a client's main renderer.
//
// Everything the page needs is contained in one self-contained IIFE:
//   * a full-viewport, click-through layer that carries exactly one pet;
//   * a side panel that is created at the same time but stays hidden until the pet is clicked;
//   * the gesture rules (inlined from src/shared/in-app-pet.ts, so the tested code is the code that
//     runs inside the client);
//   * a request queue that the main process drains over CDP and answers with a new state.
//
// The payload never touches the page's nodes, listeners or styles: it adds two host elements with
// fixed ids, one style element, and listeners on `window` that only act when the pointer is actually
// over the character. Wheel events are never intercepted, so scrolling always reaches the page.
// ---------------------------------------------------------------------------

const constants = {
  min:petSizeRange.min,
  max:petSizeRange.max,
  step:petSizeRange.step,
  handle:petResizeHandle,
  threshold:petDragThreshold,
  alpha:petAlphaThreshold,
  character:characterDataUrl(),
  ids:inAppPetIds,
};

function configJson(config:InAppConfig, imageChanged:boolean):string {
  return JSON.stringify({
    target:config.target,
    theme:config.theme,
    box:config.box,
    petImage:config.petImage,
    wallpaperEngine:config.wallpaperEngine,
    notice:config.notice??null,
    imageChanged,
  });
}

const body = String.raw`
const W=window,D=document;
// ---- one pet, one panel: a previous payload is torn down before anything is built ------------
const previous=W[K.ids.global];
if(previous&&typeof previous.destroy==='function'){try{previous.destroy()}catch(error){}}
for(const stale of D.querySelectorAll('['+K.ids.marker+']')){const kind=stale.getAttribute(K.ids.marker);if(kind==='host'||kind==='panel'||kind==='style')stale.remove()}

// ---- state -----------------------------------------------------------------------------------
const requests=[];
let state={theme:C.theme,petImage:C.petImage,box:C.box,wallpaperEngine:C.wallpaperEngine,notice:C.notice||null};
// pinned means the user has placed this pet at least once: main stored a position for this client, or
// a drag was just committed here. Until then the default placement is re-derived on every layout, so
// a client whose titlebar only appears after the first paint still pushes the pet below it.
// The measured top inset, kept for the life of the payload (see measureChrome): measured before the
// hosts are added, and re-measured only while the corner still belongs to the page.
let chromeTop=0;
let pinned=Boolean(state.box&&Number.isFinite(state.box.x)&&Number.isFinite(state.box.y));
let box=pinned
  ?clampBox({x:state.box.x,y:state.box.y,size:state.box.size||state.theme.pet.size},view())
  :defaultBox(view(),state.theme.pet.size,chromeTop);
if(pinned)state.theme.pet.size=box.size;
let press=null,suppress=false,panelOpen=false,touchUntil=0,saveTimer=0,currentArt='',destroyed=false,heartbeatTimer=0,lastHeartbeat=Date.now();

function view(){return {width:W.innerWidth,height:W.innerHeight}}
// The default corner is the top-right one. Whatever the client paints there - its window controls, a
// toolbar, its own root - is measured by hit test and reduced to an inset by topChromeInset, which
// also decides that a full-height element is not chrome.
//
// The measurement is taken once, before this payload adds its own hosts, and then kept. Two reasons:
// the pet layer itself is pointer-events:none and invisible to the hit test, but the open settings
// panel is not, and it covers exactly this corner - a re-measure while it is open would read the
// payload instead of the client and drop the offset. Keeping the number also lets a client whose
// titlebar appears a moment after the first paint be corrected on a later layout. -1 means "this
// corner belongs to the payload now", so the previous measurement still stands.
// elementFromPoint never returns a node inside a shadow root, so the payload own hosts are the only
// nodes that can show up in this measurement: a corner the payload owns is not client chrome.
function isPayloadNode(node){return node===layer||node===panelLayer||node===style}
function measureChrome(){
  try{
    const hit=D.elementFromPoint(Math.max(0,W.innerWidth-6),6);
    if(!hit||isPayloadNode(hit))return -1;
    if(hit===D.body||hit===D.documentElement)return 0;
    let node=hit;
    while(node.parentElement&&node.parentElement!==D.body&&node.parentElement!==D.documentElement)node=node.parentElement;
    const rect=node.getBoundingClientRect();
    return topChromeInset(rect.top,rect.height,W.innerHeight);
  }catch(error){return -1}
}
function refreshChrome(){const measured=measureChrome();if(measured>=0)chromeTop=measured;return chromeTop}
function el(tag,cls,text){const node=D.createElement(tag);if(cls)node.className=cls;if(text!==undefined&&text!==null)node.textContent=String(text);return node}
function now(){return Date.now()}

// ---- style -----------------------------------------------------------------------------------
const style=D.createElement('style');
style.id=K.ids.style;style.setAttribute(K.ids.marker,'style');style.textContent=K.css.page;
(D.head||D.documentElement).appendChild(style);

// ---- pet layer -------------------------------------------------------------------------------
const layer=D.createElement('div');
layer.id=K.ids.host;layer.setAttribute(K.ids.marker,'host');layer.setAttribute('aria-hidden','true');
const petRoot=layer.attachShadow({mode:'open'});
const petStyle=D.createElement('style');petStyle.textContent=K.css.pet;petRoot.appendChild(petStyle);
const anchor=el('div','pd-anchor');
const flip=el('div','pd-flip');
const art=D.createElement('img');
art.className='pd-art';art.alt='';art.decoding='async';art.draggable=false;
const grip=el('div','pd-grip');
flip.appendChild(art);anchor.appendChild(flip);petRoot.appendChild(anchor);petRoot.appendChild(grip);

// ---- panel -----------------------------------------------------------------------------------
const panelLayer=D.createElement('div');
panelLayer.id=K.ids.panel;panelLayer.setAttribute(K.ids.marker,'panel');
const panelRoot=panelLayer.attachShadow({mode:'open'});
const panelStyle=D.createElement('style');panelStyle.textContent=K.css.panel;panelRoot.appendChild(panelStyle);
const backdrop=el('div','pd-backdrop');
const panel=el('aside','pd-panel');
panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','PrismDesk 设置');
backdrop.appendChild(panel);panelRoot.appendChild(backdrop);

const head=el('div','pd-head');
const headText=el('div');
headText.appendChild(el('strong',null,'PrismDesk'));
headText.appendChild(el('small',null,(C.target==='workbuddy'?'WorkBuddy':'Codex')+' · 客户端内设置'));
const closeButton=el('button','pd-close','\u00d7');
closeButton.type='button';closeButton.setAttribute('aria-label','关闭设置面板');
head.appendChild(headText);head.appendChild(closeButton);
panel.appendChild(head);

function section(parent,title){
  const node=el('section','pd-section');
  if(title)node.appendChild(el('b',null,title));
  parent.appendChild(node);
  return node;
}
const main=el('div','pd-main'),nav=el('nav','pd-nav'),content=el('div','pd-content');
main.appendChild(nav);main.appendChild(content);panel.appendChild(main);
const views={};
function viewTab(name){const button=el('button','pd-btn',name);button.type='button';const view=el('div','pd-view');nav.appendChild(button);content.appendChild(view);views[name]={button:button,view:view};button.addEventListener('click',()=>selectTab(name));return view}
function selectTab(name){for(const key of Object.keys(views)){views[key].button.classList.toggle('pd-on',key===name);views[key].view.classList.toggle('pd-active',key===name)}}
const appearanceView=viewTab('外观'),backgroundView=viewTab('背景'),petView=viewTab('桌宠'),wallpaperView=viewTab('Wallpaper Engine'),advancedView=viewTab('高级设置');selectTab('外观');
function slider(parent,label,min,max,step,format,read,write,persist){
  const wrap=el('label','pd-field');
  const row=el('span','pd-row');
  row.appendChild(el('span',null,label));
  const out=el('output');row.appendChild(out);
  const input=D.createElement('input');
  input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);
  wrap.appendChild(row);wrap.appendChild(input);parent.appendChild(wrap);
  const refresh=()=>{out.textContent=format(read())};
  input.addEventListener('input',()=>{const value=Number(input.value);write(value);touch();refresh();previewBackground();(persist||queueSave)()});
  return {input:input,read:read,refresh:refresh};
}
function toggle(parent,label,read,write){
  const wrap=el('label','pd-check');
  const input=D.createElement('input');input.type='checkbox';
  wrap.appendChild(input);wrap.appendChild(el('span',null,label));parent.appendChild(wrap);
  input.addEventListener('change',()=>{write(input.checked);touch();queueSave()});
  return {input:input,read:read};
}

const background=section(backgroundView,'背景');
const kindRow=el('div','pd-seg');
const kindAurora=el('button','pd-btn','极光');kindAurora.type='button';
const kindImage=el('button','pd-btn','图片');kindImage.type='button';
const pickBackground=el('button','pd-btn','导入背景图片');pickBackground.type='button';
const resetBackground=el('button','pd-btn','恢复默认背景');resetBackground.type='button';
kindRow.appendChild(kindAurora);kindRow.appendChild(kindImage);kindRow.appendChild(pickBackground);kindRow.appendChild(resetBackground);
background.appendChild(kindRow);
const backgroundHint=el('small','pd-hint');
background.appendChild(backgroundHint);

const tuning=section(appearanceView,'外观');
const percent=value=>Math.round(value*100)+'%';
const brightness=slider(tuning,'亮度',0.2,1.5,0.01,percent,()=>state.theme.brightness,v=>state.theme.brightness=v);
const opacity=slider(tuning,'透明度',0,1,0.01,percent,()=>state.theme.opacity,v=>state.theme.opacity=v);
const blur=slider(tuning,'模糊',0,40,1,value=>value+'px',()=>state.theme.blur,v=>state.theme.blur=v);
const speed=slider(tuning,'动画速度',0.1,3,0.1,value=>value.toFixed(1)+'x',()=>state.theme.speed,v=>state.theme.speed=v);
const tuningRow=el('div','pd-row');
const motion=toggle(tuningRow,'动态效果',()=>state.theme.motion,v=>state.theme.motion=v);
const fpsWrap=el('label','pd-check');
fpsWrap.appendChild(el('span',null,'帧率'));
const fps=D.createElement('select');
for(const value of ['15','30','60']){const option=D.createElement('option');option.value=value;option.textContent=value+' FPS';fps.appendChild(option)}
fps.addEventListener('change',()=>{state.theme.fps=Number(fps.value);touch();queueSave()});
fpsWrap.appendChild(fps);tuningRow.appendChild(fpsWrap);
tuning.appendChild(tuningRow);

const petSection=section(petView,'宠物形象');
const petPreview=D.createElement('img');
petPreview.className='pd-preview';petPreview.alt='';
petSection.appendChild(petPreview);
const petPicker=el('button','pd-btn','导入宠物图片');petPicker.type='button';
const petReset=el('button','pd-btn','恢复默认宠物');petReset.type='button';
const petButtons=el('div','pd-seg');petButtons.appendChild(petPicker);petButtons.appendChild(petReset);
petSection.appendChild(petButtons);
const petHint=el('small','pd-hint');petSection.appendChild(petHint);
const size=slider(petSection,'尺寸',K.min,K.max,K.step,value=>value+'px',()=>state.theme.pet.size,v=>{state.theme.pet.size=clampSize(v,K.min,K.max);layout()},()=>requests.push({type:'resize',x:box.x,y:box.y,size:box.size}));
const petOpacity=slider(petSection,'透明度',0.2,1,0.05,percent,()=>state.theme.pet.opacity,v=>{state.theme.pet.opacity=v;layout()});
const petRow=el('div','pd-row');
const mirror=toggle(petRow,'水平镜像',()=>state.theme.pet.mirror,v=>{state.theme.pet.mirror=v;layout()});
const visible=toggle(petRow,'显示宠物',()=>state.theme.pet.visible,v=>{state.theme.pet.visible=v;layout()});
petSection.appendChild(petRow);

const wallpaper=section(wallpaperView,K.wallpaper.title);
wallpaper.appendChild(el('span','pd-experimental',K.wallpaper.badge));
const wallpaperStatus=el('div','pd-status');wallpaper.appendChild(wallpaperStatus);
wallpaper.appendChild(el('small','pd-hint',K.wallpaper.note));
const wallpaperButtons=el('div','pd-seg'),wallpaperOpen=el('button','pd-btn','打开 Wallpaper Engine'),wallpaperFolder=el('button','pd-btn','打开安装目录');
wallpaperOpen.type='button';wallpaperFolder.type='button';wallpaperButtons.appendChild(wallpaperOpen);wallpaperButtons.appendChild(wallpaperFolder);wallpaper.appendChild(wallpaperButtons);
for(const label of ['切换壁纸（未实现）','暂停壁纸（未实现）','刷新列表（未实现）']){const button=el('button','pd-btn',label);button.disabled=true;wallpaperButtons.appendChild(button)}

const advanced=section(advancedView,'高级设置');advanced.appendChild(el('small','pd-hint','动态效果和帧率在上方外观页设置。关闭面板不会移除桌宠。'));
const quitButton=el('button','pd-btn pd-danger','完全退出 PrismDesk');quitButton.type='button';advanced.appendChild(quitButton);
const footer=el('div','pd-footer');panel.appendChild(footer);
const footerRow=el('div','pd-seg');
const apply=el('button','pd-btn pd-primary','保存并应用');apply.type='button';
const restoreAll=el('button','pd-btn pd-danger','恢复默认');restoreAll.type='button';
footerRow.appendChild(apply);footerRow.appendChild(restoreAll);
footer.appendChild(footerRow);
const notice=el('div','pd-notice');footer.appendChild(notice);
footer.appendChild(el('small','pd-hint','拖动宠物移动位置，右下角手柄缩放；位置按客户端分别记忆。'));

// ---- geometry and hit testing ----------------------------------------------------------------
function artUrl(){return state.petImage||K.character}
function layout(){
  // The theme owns the size, so deriving it here keeps every control (panel slider, resize handle,
  // a push from main) in sync without a second source of truth that could fall behind.
  if(!pinned&&!press)box=defaultBox(view(),state.theme.pet.size,refreshChrome());
  box=clampBox({x:box.x,y:box.y,size:state.theme.pet.size},view());
  layer.classList.toggle('pd-hidden',!state.theme.pet.visible);
  anchor.style.transform='translate3d('+box.x+'px,'+box.y+'px,0)';
  flip.style.width=box.size+'px';flip.style.height=box.size+'px';
  art.style.width=box.size+'px';art.style.height=box.size+'px';
  art.style.opacity=String(state.theme.pet.opacity);
  // The clip only matches the built-in character: an imported image has no known silhouette, so its
  // whole box stays the hit area instead of a shape that would cut the artwork.
  art.classList.toggle('pd-solid',Boolean(state.petImage));
  flip.classList.toggle('pd-mirror',!!state.theme.pet.mirror);
  layer.classList.toggle('pd-paused',!state.theme.motion);
  const handle=resizeHandleSize(box.size,K.handle);
  grip.style.width=handle+'px';grip.style.height=handle+'px';
  grip.style.left=(box.x+box.size-handle)+'px';
  grip.style.top=(box.y+box.size-handle)+'px';
}
function setArt(url){
  if(!url)url=K.character;
  if(url===currentArt)return;
  currentArt=url;art.src=url;
}
function alphaAt(localX,localY){
  const canvas=D.createElement('canvas');
  canvas.width=box.size;canvas.height=box.size;
  const context=canvas.getContext('2d');
  if(!context)return 255;
  const point=sampleCoords(localX,localY,box.size,!!state.theme.pet.mirror);
  try{
    context.clearRect(0,0,box.size,box.size);
    context.drawImage(art,0,0,box.size,box.size);
    return context.getImageData(point.x,point.y,1,1).data[3];
  }catch(error){return 255}
}
function hitPet(clientX,clientY){
  const localX=clientX-box.x,localY=clientY-box.y;
  if(!insideBox(localX,localY,box.size))return false;
  if(state.petImage)return alphaHit(alphaAt(localX,localY),K.alpha);
  return isDefaultCharacterHit(localX,localY,box.size);
}
function hitGrip(clientX,clientY){
  return isResizeHandle(clientX-box.x,clientY-box.y,box.size,resizeHandleSize(box.size,K.handle));
}
// The character is a real hit target, not a click-through overlay (see the pet stylesheet), because
// these clients keep their top chrome in an OS window-drag region: a press that falls through to it
// turns the first move into a window drag and this payload never sees the gesture. Shadow retargeting
// means such a press arrives with the layer as its target, so only the panel keeps the old rule:
// the events that belong to the panel own controls must never be read as pet gestures.
function isPanelEvent(event){
  if(event.target===panelLayer)return true;
  const path=event.composedPath?event.composedPath():null;
  return Boolean(path&&path.indexOf(panelLayer)>=0);
}

// ---- panel rendering -------------------------------------------------------------------------
function touch(){touchUntil=now()+700}
function snapshot(){return JSON.parse(JSON.stringify(state.theme))}
function queueSave(){
  if(saveTimer)clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{saveTimer=0;requests.push({type:'save',theme:snapshot()})},250);
}
function previewBackground(){
  const node=D.getElementById('prismdesk-background');
  if(!node)return;
  node.style.filter='brightness('+state.theme.brightness+') blur('+state.theme.blur+'px)';
  node.style.opacity=String(state.theme.opacity);
}
function updatePanel(){
  brightness.input.value=String(state.theme.brightness);
  opacity.input.value=String(state.theme.opacity);
  blur.input.value=String(state.theme.blur);
  speed.input.value=String(state.theme.speed);
  brightness.refresh();opacity.refresh();blur.refresh();speed.refresh();
  motion.input.checked=state.theme.motion;
  fps.value=String(state.theme.fps);
  kindAurora.classList.toggle('pd-on',state.theme.kind==='aurora');
  kindImage.classList.toggle('pd-on',state.theme.kind==='image');
  backgroundHint.textContent=state.theme.kind==='image'?(state.theme.imagePath||'已选择图片'):'极光动画（不依赖远程素材）';
  size.input.value=String(state.theme.pet.size);
  size.refresh();petOpacity.input.value=String(state.theme.pet.opacity);petOpacity.refresh();
  mirror.input.checked=state.theme.pet.mirror;
  visible.input.checked=state.theme.pet.visible;
  petPreview.src=artUrl();
  petHint.textContent=state.petImage?'本地素材，仅保存在本机':'内置角色 Prism（MIT）';
  const engine=state.wallpaperEngine||{installed:false,running:false};
  wallpaperStatus.textContent=(engine.running?'已检测到正在运行':engine.installed?'已安装，当前未运行':'未检测到安装')+(engine.path?' · '+engine.path:'');
  wallpaperOpen.disabled=!engine.installed;wallpaperFolder.disabled=!engine.installed;
  if(state.notice){notice.textContent=state.notice.text;notice.classList.toggle('pd-error',state.notice.kind==='error')}
}
function openPanel(next){
  panelOpen=!!next;
  backdrop.classList.toggle('pd-open',panelOpen);
  layer.classList.toggle('pd-panel-open',panelOpen);
  if(panelOpen)setTimeout(()=>{if(typeof closeButton.focus==='function')closeButton.focus()},0);
}

closeButton.addEventListener('click',()=>openPanel(false));
backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)openPanel(false)});
kindAurora.addEventListener('click',()=>{if(state.theme.kind!=='aurora'){state.theme.kind='aurora';updatePanel();queueSave()}});
kindImage.addEventListener('click',()=>{if(state.theme.kind!=='image'){state.theme.kind='image';updatePanel();queueSave()}});
pickBackground.addEventListener('click',()=>{requests.push({type:'import-background'})});
resetBackground.addEventListener('click',()=>{requests.push({type:'restore-background'})});
petPicker.addEventListener('click',()=>{requests.push({type:'import-pet'})});
petReset.addEventListener('click',()=>{requests.push({type:'restore-pet'})});
restoreAll.addEventListener('click',()=>{requests.push({type:'restore'})});
apply.addEventListener('click',()=>{requests.push({type:'save',theme:snapshot()})});
wallpaperOpen.addEventListener('click',()=>{requests.push({type:'wallpaper-open'})});
wallpaperFolder.addEventListener('click',()=>{requests.push({type:'wallpaper-folder'})});
quitButton.addEventListener('click',()=>{requests.push({type:'quit-app'})});

// ---- gestures --------------------------------------------------------------------------------
function clearSuppress(){suppress=false}
function onPointerDown(event){
  if(event.button!==0||press||!event.isPrimary)return;
  if(isPanelEvent(event))return;
  clearSuppress();
  if(!state.theme.pet.visible)return;
  const onGrip=hitGrip(event.clientX,event.clientY);
  const onPet=!onGrip&&hitPet(event.clientX,event.clientY);
  if(!onGrip&&!onPet){if(panelOpen)openPanel(false);return}
  suppress=true;
  press={mode:onGrip?'resize':'drag',startX:event.clientX,startY:event.clientY,x:box.x,y:box.y,size:box.size,moved:false};
  event.preventDefault();event.stopPropagation();
  if(event.stopImmediatePropagation)event.stopImmediatePropagation();
}
function onKeyDown(event){if(panelOpen&&event.key==='Escape'){event.preventDefault();event.stopPropagation();openPanel(false)}}
function onPointerMove(event){
  if(!press){
    if(state.theme.pet.visible)grip.classList.toggle('pd-on',hitGrip(event.clientX,event.clientY)||hitPet(event.clientX,event.clientY));
    return;
  }
  if(!press.moved&&isDragGesture(press.startX,press.startY,event.clientX,event.clientY,K.threshold)){
    press.moved=true;layer.classList.add('pd-dragging');
  }
  if(!press.moved)return;
  if(press.mode==='drag'){
    box=clampBox({x:press.x+(event.clientX-press.startX),y:press.y+(event.clientY-press.startY),size:box.size},view());
  }else{
    state.theme.pet.size=clampSize(press.size+resizeDelta(press.startX,press.startY,event.clientX,event.clientY),K.min,K.max);
  }
  layout();
  event.preventDefault();
}
function endPress(commit){
  const current=press;
  if(!current)return;
  press=null;layer.classList.remove('pd-dragging');
  if(current.moved&&commit){
    if(current.mode==='drag'){pinned=true;state.box={x:box.x,y:box.y};requests.push({type:'move',x:box.x,y:box.y})}
    else{state.theme.pet.size=box.size;pinned=true;state.box={x:box.x,y:box.y,size:box.size};requests.push({type:'resize',x:box.x,y:box.y,size:box.size})}
  }
  if(!current.moved&&commit&&current.mode==='drag')openPanel(!panelOpen);
  setTimeout(clearSuppress,250);
}
function onPointerUp(event){
  if(!press)return;
  const blocking=!isPanelEvent(event);
  endPress(true);
  if(blocking){event.preventDefault();event.stopPropagation();if(event.stopImmediatePropagation)event.stopImmediatePropagation()}
}
// The character is a real element now, so dragging it fires mouseleave for every element the pointer
// leaves - the character itself first of all. Only leaving the page means the gesture is gone: a
// mouseleave aimed at a descendant is just the pointer moving across the page mid-drag.
function onPointerLost(event){
  if(event&&event.type==='mouseleave'){
    const target=event.target;
    if(target!==D&&target!==D.documentElement&&target!==W)return;
  }
  endPress(true);
}
function blocker(event){
  if(!suppress||isPanelEvent(event))return;
  event.preventDefault();event.stopPropagation();
  if(event.stopImmediatePropagation)event.stopImmediatePropagation();
}

// Wheel events used to reach the page below for free, because the pet was click-through. It cannot be
// click-through any more, so a wheel that lands on the character is handed to the scroller underneath
// it; otherwise the pet would be a small dead spot for scrolling. The cheap box test runs first, so
// every other wheel event on the page stays exactly as it was, and a missing measurement never
// swallows the wheel.
function parentOf(node){return node.parentElement||node.parentNode||null}
function scrollUnder(x,y){
  const previous=art.style.pointerEvents;
  art.style.pointerEvents='none';
  let node=null;
  try{node=D.elementFromPoint(x,y)}catch(error){node=null}
  art.style.pointerEvents=previous;
  while(node&&node!==D.documentElement&&node!==D){
    let overflow='';
    try{overflow=(W.getComputedStyle(node).overflowY||'')}catch(error){overflow=''}
    if(node.scrollHeight>node.clientHeight+1&&(overflow==='auto'||overflow==='scroll'))return node;
    node=parentOf(node);
  }
  return null;
}
function onWheel(event){
  if(!state.theme.pet.visible||isPanelEvent(event))return;
  if(!insideBox(event.clientX-box.x,event.clientY-box.y,box.size))return;
  try{
    const scroller=scrollUnder(event.clientX,event.clientY);
    if(!scroller)return;
    scroller.scrollTop+=event.deltaY;
    if(event.deltaX)scroller.scrollLeft+=event.deltaX;
    event.preventDefault();
  }catch(error){}
}

const blocked=['mousedown','mouseup','click','dblclick','auxclick','contextmenu','selectstart','dragstart'];
W.addEventListener('pointerdown',onPointerDown,true);
W.addEventListener('pointermove',onPointerMove,true);
W.addEventListener('pointerup',onPointerUp,true);
W.addEventListener('pointercancel',onPointerLost,true);
W.addEventListener('blur',onPointerLost);
D.addEventListener('mouseleave',onPointerLost,true);
for(const type of blocked)W.addEventListener(type,blocker,true);
W.addEventListener('wheel',onWheel,{capture:true,passive:false});
W.addEventListener('keydown',onKeyDown,true);
W.addEventListener('resize',layout);
panelRoot.addEventListener('input',touch,true);
panelRoot.addEventListener('change',touch,true);

// ---- public api ------------------------------------------------------------------------------
function destroy(){
  if(destroyed)return true;destroyed=true;
  if(saveTimer)clearTimeout(saveTimer);
  if(heartbeatTimer)clearInterval(heartbeatTimer);
  saveTimer=0;press=null;clearSuppress();
  W.removeEventListener('pointerdown',onPointerDown,true);
  W.removeEventListener('pointermove',onPointerMove,true);
  W.removeEventListener('pointerup',onPointerUp,true);
  W.removeEventListener('pointercancel',onPointerLost,true);
  W.removeEventListener('blur',onPointerLost);
  D.removeEventListener('mouseleave',onPointerLost,true);
  for(const type of blocked)W.removeEventListener(type,blocker,true);
  W.removeEventListener('wheel',onWheel,{capture:true});
  W.removeEventListener('keydown',onKeyDown,true);
  W.removeEventListener('resize',layout);
  panelRoot.removeEventListener('input',touch,true);
  panelRoot.removeEventListener('change',touch,true);
  layer.remove();panelLayer.remove();style.remove();
  D.documentElement.removeAttribute(K.ids.stateMarker);
  if(W[K.ids.global]===api)delete W[K.ids.global];
  try{if(typeof W.__prismdeskCleanup==='function')W.__prismdeskCleanup()}catch(error){}
  delete D.documentElement.dataset.prismdesk;
  if(W.__PRISMDESK__===publicApi)delete W.__PRISMDESK__;
  return true;
}
function applyState(next){
  if(!next||typeof next!=='object')return;
  // While the user is holding a panel control or dragging the pet, the page's own copy is the truth:
  // main only learns about the edit when the debounced save arrives, so adopting the pushed theme
  // here would snap the control back to the value the user just replaced.
  const editing=now()<=touchUntil||!!press;
  if(next.theme&&!editing)state.theme=next.theme;
  if(next.wallpaperEngine)state.wallpaperEngine=next.wallpaperEngine;
  if(next.notice)state.notice=next.notice;
  // A remembered position pins the pet for good: main only ever sends the placement it has stored,
  // so a pet the user has already moved is never pulled back to the default corner by a later push.
  if(!editing&&next.box&&Number.isFinite(next.box.x)&&Number.isFinite(next.box.y)&&Number.isFinite(next.box.size)){state.box={x:next.box.x,y:next.box.y,size:next.box.size};state.theme.pet.size=next.box.size;pinned=true}
  if(next.imageChanged){state.petImage=next.petImage||null;setArt(next.petImage)}
  if(state.box&&!editing){box=clampBox({x:state.box.x,y:state.box.y,size:state.box.size},view());state.theme.pet.size=box.size}
  layout();
  D.documentElement.setAttribute(K.ids.stateMarker,'applied');
  if(now()>touchUntil)updatePanel();
}
function counts(){return {pets:D.querySelectorAll('#'+K.ids.host).length,panels:D.querySelectorAll('#'+K.ids.panel).length,open:panelOpen}}
function styleOf(node){
    try{const cs=W.getComputedStyle(node);return {display:cs.display,visibility:cs.visibility,opacity:cs.opacity,zIndex:cs.zIndex,pointerEvents:cs.pointerEvents,clipPath:cs.clipPath}}
    catch(error){return null}
}
function rectOf(node){
  try{const r=node.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}}
  catch(error){return null}
}
// What the character is standing on, from the page point of view, with the character taken out of
// the hit test. These clients keep their top chrome in an OS window-drag region, so this is the band
// the pet has to stay in front of; reported so a log or a capture can prove it.
function underPet(){
  try{
    const previous=art.style.pointerEvents;
    art.style.pointerEvents='none';
    const node=D.elementFromPoint(box.x+Math.floor(box.size/2),box.y+Math.floor(box.size/2));
    art.style.pointerEvents=previous;
    if(!node)return null;
    const chain=[];
    let region='none';
    let dragBand=null;
    let current=node;
    while(current&&current!==D.documentElement&&chain.length<6){
      const cls=(typeof current.className==='string'&&current.className)?('.'+current.className.split(' ')[0]):'';
      const name=String(current.id||current.tagName||'').toLowerCase()+cls;
      chain.push(name);
      let here='none';
      try{here=W.getComputedStyle(current).getPropertyValue('-webkit-app-region')||'none'}catch(error){here='none'}
      if(region==='none'&&here!=='none')region=here;
      if(!dragBand&&here==='drag')dragBand=name;
      current=parentOf(current);
    }
    return {node:chain[0]||null,chain:chain,appRegion:region,dragBand:dragBand};
  }catch(error){return null}
}
// What main records after every injection: the payload's own answer to "is the pet really on
// screen", not just "do the nodes exist". A node that is laid out at zero size, hidden, or inside a
// stacking context that never paints is exactly the failure this has to make visible to the log.
function verify(){
  const hostRect=rectOf(layer),hostStyle=styleOf(layer);
  const onScreen=Boolean(hostRect&&hostRect.width>0&&hostRect.height>0)&&!layer.classList.contains('pd-hidden')&&(!hostStyle||(hostStyle.display!=='none'&&hostStyle.visibility!=='hidden'&&hostStyle.opacity!=='0'));
  return {
    host:Boolean(layer.parentNode),hostRect:hostRect,hostStyle:hostStyle,onScreen:onScreen,
    box:{x:box.x,y:box.y,size:box.size},chromeInset:Math.max(0,refreshChrome()),
    art:{local:Boolean(state.petImage),complete:art.complete===true,naturalWidth:art.naturalWidth||0,rect:rectOf(art),pointer:styleOf(art)?styleOf(art).pointerEvents:null,clip:styleOf(art)?styleOf(art).clipPath:null},
    under:underPet(),
    panel:{open:panelOpen,style:styleOf(panel),backdrop:styleOf(backdrop)},
    state:D.documentElement.getAttribute(K.ids.stateMarker)||null,
  };
}
const api={version:V,requests:requests,applyState:applyState,destroy:destroy,counts:counts,verify:verify};
W[K.ids.global]=api;
const publicApi={destroy:destroy,heartbeat:function(){lastHeartbeat=Date.now();return true}};
W.__PRISMDESK__=publicApi;
heartbeatTimer=setInterval(()=>{if(Date.now()-lastHeartbeat>12000)destroy()},2000);

setArt(state.petImage);
applyState({theme:state.theme,box:state.box,petImage:state.petImage,imageChanged:true});
(D.body||D.documentElement).appendChild(layer);
(D.body||D.documentElement).appendChild(panelLayer);
return {ok:true,pets:counts().pets,panels:counts().panels,visible:state.theme.pet.visible,verify:verify()};
`;

export function buildInAppScript(config:InAppConfig):string {
  return `(()=>{const C=${configJson(config,true)};const K=${JSON.stringify({ ...constants, css:inAppPetCss, wallpaper:wallpaperEngineFeature })};const V=${inAppPetPayloadVersion};${inlinedRuntime()}${body}})()`;
}

// The periodic sync doubles as the presence probe: a page that reloaded or navigated has no
// instance, so the main process re-injects the full payload on the next tick.
export function buildInAppSyncScript(config:InAppConfig, imageChanged:boolean):string {
  return `(()=>{const api=window[${JSON.stringify(inAppPetIds.global)}];if(!api||api.version!==${inAppPetPayloadVersion})return {present:false};if(window.__PRISMDESK__&&typeof window.__PRISMDESK__.heartbeat==='function')window.__PRISMDESK__.heartbeat();const drained=api.requests.splice(0,api.requests.length);api.applyState(${configJson(config,imageChanged)});const counts=api.counts();return {present:true,requests:drained,pets:counts.pets,panels:counts.panels,open:counts.open,verify:api.verify()}})()`;
}

export function buildInAppStatusScript():string {
  return `(()=>{const api=window[${JSON.stringify(inAppPetIds.global)}];const counts=api&&typeof api.counts==='function'?api.counts():null;const verify=api&&typeof api.verify==='function'?api.verify():null;return {present:Boolean(api),pets:counts?counts.pets:0,panels:counts?counts.panels:0,open:counts?counts.open:false,onScreen:Boolean(verify&&verify.onScreen),box:verify?verify.box:null}})()`;
}

// Removing the pet must remove the panel, the style element, every listener and the shared marker;
// the background layer and its own cleanup belong to src/main/injection.ts.
export function buildRemovePetScript():string {
  return `(()=>{try{const api=window[${JSON.stringify(inAppPetIds.global)}];if(api&&typeof api.destroy==='function')api.destroy()}catch(error){}
for(const node of document.querySelectorAll('['+${JSON.stringify(inAppPetIds.marker)}+']'))node.remove();
document.documentElement.removeAttribute(${JSON.stringify(inAppPetIds.stateMarker)});
return {pets:document.querySelectorAll('#'+${JSON.stringify(inAppPetIds.host)}).length,panels:document.querySelectorAll('#'+${JSON.stringify(inAppPetIds.panel)}).length,present:Boolean(window[${JSON.stringify(inAppPetIds.global)}])}})()`;
}

// Restore default: pet, panel, background, styles and listeners all go, in one call.
export function buildRemoveAllScript():string {
  return `(()=>{try{const api=window.__PRISMDESK__;if(api&&typeof api.destroy==='function')api.destroy()}catch(error){}
try{const api=window[${JSON.stringify(inAppPetIds.global)}];if(api&&typeof api.destroy==='function')api.destroy()}catch(error){}
try{if(typeof window.__prismdeskCleanup==='function')window.__prismdeskCleanup()}catch(error){}
for(const node of document.querySelectorAll('['+${JSON.stringify(inAppPetIds.marker)}+']'))node.remove();
for(const id of ${JSON.stringify([inAppPetIds.host, inAppPetIds.panel, inAppPetIds.style, 'prismdesk-background', 'prismdesk-style'])}){
  const node=document.getElementById(id);if(node)node.remove();
}
document.documentElement.removeAttribute(${JSON.stringify(inAppPetIds.stateMarker)});
delete document.documentElement.dataset.prismdesk;
return {restored:!document.getElementById('prismdesk-background')&&!document.getElementById(${JSON.stringify(inAppPetIds.host)})&&!window[${JSON.stringify(inAppPetIds.global)}]}})()`;
}

export { parseInAppRequests, type InAppRequest };
