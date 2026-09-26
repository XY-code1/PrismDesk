import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('prism',{
  load:()=>ipcRenderer.invoke('theme:load'),
  save:(v:unknown)=>ipcRenderer.invoke('theme:save',v),
  image:()=>ipcRenderer.invoke('theme:image'),
  importTheme:()=>ipcRenderer.invoke('theme:import'),
  statuses:()=>ipcRenderer.invoke('targets:status'),
  launch:(id:string)=>ipcRenderer.invoke('target:launch',id),
  apply:(id:string,v:unknown)=>ipcRenderer.invoke('target:apply',id,v),
  restore:(id:string)=>ipcRenderer.invoke('target:restore',id),
  // Pet artwork is imported through the same validated store as the background, so a file can
  // never reach a client page without passing the type and size checks.
  petImage:()=>ipcRenderer.invoke('pet:image'),
  petMode:(mode:string)=>ipcRenderer.invoke('pet:mode',mode),
  onThemeChanged:(handler:(theme:unknown)=>void)=>ipcRenderer.on('theme:changed',(_event,theme)=>handler(theme)),
});
