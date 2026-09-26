declare global { interface Window { prism:any } }
let theme:any; const $=(id:string)=>document.getElementById(id)!;
const fields=['brightness','opacity','blur','speed'] as const;
const petControls=['size'] as const;
function read(){
  for(const k of fields)theme[k]=Number(($(`${k}`) as HTMLInputElement).value);
  theme.motion=($('motion') as HTMLInputElement).checked;
  theme.fps=Number(($('fps') as HTMLSelectElement).value);
  theme.pet.size=Number(($('size') as HTMLInputElement).value);
  theme.pet.mirror=($('mirror') as HTMLInputElement).checked;
  theme.pet.visible=($('visible') as HTMLInputElement).checked;
  return theme;
}
function fileUrl(path:string){return `file:///${path.replaceAll('\\','/')}`}
function render(){
  for(const k of fields){const el=$(`${k}`) as HTMLInputElement;el.value=String(theme[k]);$(`${k}Out`).textContent=k==='blur'?`${theme[k]}px`:`${Math.round(theme[k]*100)}%`}
  ($('motion') as HTMLInputElement).checked=theme.motion;
  ($('fps') as HTMLSelectElement).value=String(theme.fps);
  $('themeName').textContent=theme.name;
  const p=$('preview');p.classList.toggle('image',theme.kind==='image');p.style.filter=`brightness(${theme.brightness}) blur(${theme.blur/8}px)`;p.style.opacity=String(theme.opacity);p.style.animationDuration=`${8/theme.speed}s`;p.style.animationPlayState=theme.motion?'running':'paused';if(theme.kind==='image'&&theme.imagePath)p.style.backgroundImage=`url(${fileUrl(theme.imagePath)})`;
  document.querySelectorAll('[data-kind]').forEach(x=>x.classList.toggle('active',(x as HTMLElement).dataset.kind===theme.kind));
  document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',(x as HTMLElement).dataset.mode===theme.petMode));
  const preview=$('petPreview') as HTMLImageElement;
  preview.src=theme.pet.imagePath?fileUrl(theme.pet.imagePath):'';
  preview.classList.toggle('empty',!theme.pet.imagePath);
  for(const k of petControls){const el=$(`${k}`) as HTMLInputElement;el.value=String(theme.pet[k]);$(`${k}Out`).textContent=k==='size'?`${theme.pet[k]}px`:`${theme.pet[k]}`}
  ($('mirror') as HTMLInputElement).checked=theme.pet.mirror;
  ($('visible') as HTMLInputElement).checked=theme.pet.visible;
  $('petHint').textContent=theme.pet.imagePath?'本地素材，仅保存在本机；已复制到 PrismDesk 配置目录':'内置角色 Prism（MIT 授权，随源码发布）';
  $('modeHint').textContent=theme.petMode==='desktop'?'当前使用独立的 Windows 桌面宠物窗口；客户端内不再注入宠物。':'当前把宠物注入客户端窗口内部，随客户端一起显示；重载后会自动恢复。';
}
function notify(s:string,error=false){$('notice').textContent=s;$('notice').style.color=error?'#fca5a5':'#8ee0c2'}
async function statuses(){const list=await window.prism.statuses();$('targets').innerHTML=list.map((s:any)=>`<article class="card"><div class="card-head"><div><h3>${s.name}</h3><div class="meta">${s.version||'—'} ${s.pet?'· 悬浮宠物':''} · ${s.installPath||s.detail}</div></div><span class="pill ${s.status}">${s.detail}</span></div><div class="actions"><button data-connect="${s.id}" ${!s.installed||s.connected?'disabled':''}>连接</button><button data-apply="${s.id}" ${!s.connected?'disabled':''}>应用</button><button data-restore="${s.id}" ${!s.connected?'disabled':''}>恢复默认</button></div></article>`).join('');document.querySelectorAll('[data-connect]').forEach(b=>(b as HTMLButtonElement).onclick=()=>act(()=>window.prism.launch((b as HTMLElement).dataset.connect),'已连接'));document.querySelectorAll('[data-apply]').forEach(b=>(b as HTMLButtonElement).onclick=()=>act(()=>window.prism.apply((b as HTMLElement).dataset.apply,read()),'已应用：背景与悬浮宠物'));document.querySelectorAll('[data-restore]').forEach(b=>(b as HTMLButtonElement).onclick=()=>act(()=>window.prism.restore((b as HTMLElement).dataset.restore),'已恢复默认（背景、宠物与面板）'))}
async function act(fn:()=>Promise<any>,ok:string){try{await fn();notify(ok);await statuses()}catch(e){notify((e as Error).message,true)}}
async function init(){
  theme=await window.prism.load();
  if(!theme.pet)theme.pet={size:128,mirror:false,visible:true};
  render();await statuses();
  for(const k of fields)$(`${k}`).addEventListener('input',()=>{read();render()});
  for(const k of petControls)$(`${k}`).addEventListener('input',()=>{read();render()});
  $('mirror').addEventListener('change',()=>{read();render()});
  $('visible').addEventListener('change',()=>{read();render()});
  $('motion').onchange=$('fps').onchange=()=>{read();render()};
  document.querySelectorAll('[data-kind]').forEach(b=>(b as HTMLButtonElement).onclick=()=>{theme.kind=(b as HTMLElement).dataset.kind;render()});
  document.querySelectorAll('[data-mode]').forEach(b=>(b as HTMLButtonElement).onclick=async()=>{const mode=(b as HTMLElement).dataset.mode;if(mode===theme.petMode)return;try{theme=await window.prism.petMode(mode);render();notify(mode==='desktop'?'已切换为 Windows 桌面宠物':'已切换为客户端内悬浮宠物')}catch(e){notify((e as Error).message,true)}});
  $('pick').onclick=async()=>{const p=await window.prism.image();if(p){theme.kind='image';theme.imagePath=p;render()}};
  $('petPick').onclick=async()=>{try{const imported=await window.prism.petImage();if(imported){theme.pet.imagePath=imported.path;render();notify(imported.info.hasAlpha?'宠物图片已导入（检测到透明通道）':'宠物图片已导入（未检测到透明通道）')}}catch(e){notify((e as Error).message,true)}};
  $('petReset').onclick=async()=>{theme.pet={size:128,mirror:false,visible:true};render();await act(()=>window.prism.save(read()),'宠物形象已恢复默认')};
  $('importTheme').onclick=async()=>{const t=await window.prism.importTheme();if(t){theme=t;render();notify('主题已校验并导入')}};
  $('save').onclick=()=>act(()=>window.prism.save(read()),'设置已保存');
  $('refresh').onclick=statuses;
  window.prism.onThemeChanged((next:any)=>{theme=next;render();notify('客户端内面板已更新设置')});
}
init().catch(e=>notify(e.message,true));