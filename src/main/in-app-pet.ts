import {
  characterDataUrl, inAppPetCss, inAppPetIds, inlinedRuntime, parseInAppRequests,
  petAlphaThreshold, petDragThreshold, petResizeHandle, petSizeRange,
  type InAppConfig, type InAppRequest,
} from '../shared/in-app-pet.js';

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
let state={theme:C.theme,petImage:C.petImage,box:C.box};
let box=(state.box&&Number.isFinite(state.box.x)&&Number.isFinite(state.box.y))
  ?clampBox({x:state.box.x,y:state.box.y,size:state.theme.pet.size},view())
  :defaultBox(view(),state.theme.pet.size);
let press=null,suppress=false,panelOpen=false,touchUntil=0,saveTimer=0,currentArt='';

function view(){return {width:W.innerWidth,height:W.innerHeight}}
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
const panel=el('aside','pd-panel');
panelRoot.appendChild(panel);

const head=el('div','pd-head');
const headText=el('div');
headText.appendChild(el('strong',null,'PrismDesk'));
headText.appendChild(el('small',null,'客户端内悬浮宠物'));
const closeButton=el('button','pd-close','\u00d7');
closeButton.type='button';closeButton.setAttribute('aria-label','关闭设置面板');
head.appendChild(headText);head.appendChild(closeButton);
panel.appendChild(head);

function section(title){
  const node=el('section','pd-section');
  if(title)node.appendChild(el('b',null,title));
  panel.appendChild(node);
  return node;
}
function slider(parent,label,min,max,step,format,read,write){
  const wrap=el('label','pd-field');
  const row=el('span','pd-row');
  row.appendChild(el('span',null,label));
  const out=el('output');row.appendChild(out);
  const input=D.createElement('input');
  input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);
  wrap.appendChild(row);wrap.appendChild(input);parent.appendChild(wrap);
  const refresh=()=>{out.textContent=format(read())};
  input.addEventListener('input',()=>{const value=Number(input.value);write(value);touch();refresh();previewBackground();queueSave()});
  return {input:input,read:read,refresh:refresh};
}
function toggle(parent,label,read,write){
  const wrap=el('label','pd-check');
  const input=D.createElement('input');input.type='checkbox';
  wrap.appendChild(input);wrap.appendChild(el('span',null,label));parent.appendChild(wrap);
  input.addEventListener('change',()=>{write(input.checked);touch();queueSave()});
  return {input:input,read:read};
}

const background=section('背景');
const kindRow=el('div','pd-seg');
const kindAurora=el('button','pd-btn','极光');kindAurora.type='button';
const kindImage=el('button','pd-btn','图片');kindImage.type='button';
const pickBackground=el('button','pd-btn','导入背景图片');pickBackground.type='button';
kindRow.appendChild(kindAurora);kindRow.appendChild(kindImage);kindRow.appendChild(pickBackground);
background.appendChild(kindRow);
const backgroundHint=el('small','pd-hint');
background.appendChild(backgroundHint);

const tuning=section('背景参数');
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

const petSection=section('宠物形象');
const petPreview=D.createElement('img');
petPreview.className='pd-preview';petPreview.alt='';
petSection.appendChild(petPreview);
const petPicker=el('button','pd-btn','导入宠物图片');petPicker.type='button';
const petReset=el('button','pd-btn','恢复默认宠物');petReset.type='button';
const petButtons=el('div','pd-seg');petButtons.appendChild(petPicker);petButtons.appendChild(petReset);
petSection.appendChild(petButtons);
const petHint=el('small','pd-hint');petSection.appendChild(petHint);
const size=slider(petSection,'尺寸',K.min,K.max,K.step,value=>value+'px',()=>state.theme.pet.size,v=>{state.theme.pet.size=clampSize(v,K.min,K.max);layout()});
const petRow=el('div','pd-row');
const mirror=toggle(petRow,'水平镜像',()=>state.theme.pet.mirror,v=>{state.theme.pet.mirror=v;layout()});
const visible=toggle(petRow,'显示宠物',()=>state.theme.pet.visible,v=>{state.theme.pet.visible=v;layout()});
petSection.appendChild(petRow);

const footer=section(null);
const footerRow=el('div','pd-seg');
const apply=el('button','pd-btn pd-primary','保存并应用');apply.type='button';
const restoreAll=el('button','pd-btn pd-danger','恢复默认');restoreAll.type='button';
footerRow.appendChild(apply);footerRow.appendChild(restoreAll);
footer.appendChild(footerRow);
footer.appendChild(el('small','pd-hint','拖动宠物移动位置，右下角手柄缩放；位置按客户端分别记忆。'));

// ---- geometry and hit testing ----------------------------------------------------------------
function artUrl(){return state.petImage||K.character}
function layout(){
  // The theme owns the size, so deriving it here keeps every control (panel slider, resize handle,
  // a push from main) in sync without a second source of truth that could fall behind.
  box=clampBox({x:box.x,y:box.y,size:state.theme.pet.size},view());
  layer.classList.toggle('pd-hidden',!state.theme.pet.visible);
  anchor.style.transform='translate3d('+box.x+'px,'+box.y+'px,0)';
  flip.style.width=box.size+'px';flip.style.height=box.size+'px';
  art.style.width=box.size+'px';art.style.height=box.size+'px';
  flip.classList.toggle('pd-mirror',!!state.theme.pet.mirror);
  layer.classList.toggle('pd-paused',!state.theme.motion);
  grip.style.left=(box.x+box.size-K.handle)+'px';
  grip.style.top=(box.y+box.size-K.handle)+'px';
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
  return isResizeHandle(clientX-box.x,clientY-box.y,box.size,K.handle);
}
function isOurs(node){return node===layer||node===panelLayer||node===style||node===art}

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
  size.refresh();
  mirror.input.checked=state.theme.pet.mirror;
  visible.input.checked=state.theme.pet.visible;
  petPreview.src=artUrl();
  petHint.textContent=state.petImage?'本地素材，仅保存在本机':'内置角色 Prism（MIT）';
}
function openPanel(next){
  panelOpen=!!next;
  panel.classList.toggle('pd-open',panelOpen);
}

closeButton.addEventListener('click',()=>openPanel(false));
kindAurora.addEventListener('click',()=>{if(state.theme.kind!=='aurora'){state.theme.kind='aurora';updatePanel();queueSave()}});
kindImage.addEventListener('click',()=>{if(state.theme.kind!=='image'){state.theme.kind='image';updatePanel();queueSave()}});
pickBackground.addEventListener('click',()=>{requests.push({type:'import-background'})});
petPicker.addEventListener('click',()=>{requests.push({type:'import-pet'})});
petReset.addEventListener('click',()=>{requests.push({type:'restore-pet'})});
restoreAll.addEventListener('click',()=>{requests.push({type:'restore'})});
apply.addEventListener('click',()=>{requests.push({type:'save',theme:snapshot()})});

// ---- gestures --------------------------------------------------------------------------------
function clearSuppress(){suppress=false}
function onPointerDown(event){
  if(event.button!==0||press||!event.isPrimary)return;
  if(isOurs(event.target))return;
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
    if(current.mode==='drag'){state.box={x:box.x,y:box.y};requests.push({type:'move',x:box.x,y:box.y})}
    else{state.theme.pet.size=box.size;requests.push({type:'resize',size:box.size})}
  }
  if(!current.moved&&commit&&current.mode==='drag')openPanel(!panelOpen);
  setTimeout(clearSuppress,250);
}
function onPointerUp(event){
  if(!press)return;
  const blocking=!isOurs(event.target);
  endPress(true);
  if(blocking){event.preventDefault();event.stopPropagation();if(event.stopImmediatePropagation)event.stopImmediatePropagation()}
}
function onPointerLost(){endPress(true)}
function blocker(event){
  if(!suppress||isOurs(event.target))return;
  event.preventDefault();event.stopPropagation();
  if(event.stopImmediatePropagation)event.stopImmediatePropagation();
}

const blocked=['mousedown','mouseup','click','dblclick','auxclick','contextmenu','selectstart','dragstart'];
W.addEventListener('pointerdown',onPointerDown,true);
W.addEventListener('pointermove',onPointerMove,true);
W.addEventListener('pointerup',onPointerUp,true);
W.addEventListener('pointercancel',onPointerLost,true);
W.addEventListener('blur',onPointerLost);
D.addEventListener('mouseleave',onPointerLost,true);
for(const type of blocked)W.addEventListener(type,blocker,true);
W.addEventListener('resize',layout);
panelRoot.addEventListener('input',touch,true);
panelRoot.addEventListener('change',touch,true);

// ---- public api ------------------------------------------------------------------------------
function destroy(){
  if(saveTimer)clearTimeout(saveTimer);
  saveTimer=0;press=null;clearSuppress();
  W.removeEventListener('pointerdown',onPointerDown,true);
  W.removeEventListener('pointermove',onPointerMove,true);
  W.removeEventListener('pointerup',onPointerUp,true);
  W.removeEventListener('pointercancel',onPointerLost,true);
  W.removeEventListener('blur',onPointerLost);
  D.removeEventListener('mouseleave',onPointerLost,true);
  for(const type of blocked)W.removeEventListener(type,blocker,true);
  W.removeEventListener('resize',layout);
  panelRoot.removeEventListener('input',touch,true);
  panelRoot.removeEventListener('change',touch,true);
  layer.remove();panelLayer.remove();style.remove();
  D.documentElement.removeAttribute(K.ids.stateMarker);
  if(W[K.ids.global]===api)delete W[K.ids.global];
}
function applyState(next){
  if(!next||typeof next!=='object')return;
  // While the user is holding a panel control or dragging the pet, the page's own copy is the truth:
  // main only learns about the edit when the debounced save arrives, so adopting the pushed theme
  // here would snap the control back to the value the user just replaced.
  const editing=now()<=touchUntil||!!press;
  if(next.theme&&!editing)state.theme=next.theme;
  if(next.box&&Number.isFinite(next.box.x)&&Number.isFinite(next.box.y))state.box={x:next.box.x,y:next.box.y};
  if(next.imageChanged){state.petImage=next.petImage||null;setArt(next.petImage)}
  if(state.box&&!editing){box=clampBox({x:state.box.x,y:state.box.y,size:state.theme.pet.size},view())}
  layout();
  D.documentElement.setAttribute(K.ids.stateMarker,'applied');
  if(now()>touchUntil)updatePanel();
}
function counts(){return {pets:D.querySelectorAll('#'+K.ids.host).length,panels:D.querySelectorAll('#'+K.ids.panel).length,open:panelOpen}}
const api={version:1,requests:requests,applyState:applyState,destroy:destroy,counts:counts};
W[K.ids.global]=api;

setArt(state.petImage);
applyState({theme:state.theme,box:state.box,petImage:state.petImage,imageChanged:true});
(D.body||D.documentElement).appendChild(layer);
(D.body||D.documentElement).appendChild(panelLayer);
return {ok:true,pets:counts().pets,panels:counts().panels,visible:state.theme.pet.visible};
`;

export function buildInAppScript(config:InAppConfig):string {
  return `(()=>{const C=${configJson(config,true)};const K=${JSON.stringify({ ...constants, css:inAppPetCss })};${inlinedRuntime()}${body}})()`;
}

// The periodic sync doubles as the presence probe: a page that reloaded or navigated has no
// instance, so the main process re-injects the full payload on the next tick.
export function buildInAppSyncScript(config:InAppConfig, imageChanged:boolean):string {
  return `(()=>{const api=window[${JSON.stringify(inAppPetIds.global)}];if(!api||api.version!==1)return {present:false};const drained=api.requests.splice(0,api.requests.length);api.applyState(${configJson(config,imageChanged)});const counts=api.counts();return {present:true,requests:drained,pets:counts.pets,panels:counts.panels,open:counts.open}})()`;
}

export function buildInAppStatusScript():string {
  return `(()=>{const api=window[${JSON.stringify(inAppPetIds.global)}];const counts=api&&typeof api.counts==='function'?api.counts():null;return {present:Boolean(api),pets:counts?counts.pets:0,panels:counts?counts.panels:0,open:counts?counts.open:false}})()`;
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
  return `(()=>{try{const api=window[${JSON.stringify(inAppPetIds.global)}];if(api&&typeof api.destroy==='function')api.destroy()}catch(error){}
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
