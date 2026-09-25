import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('pet',{
  dragStart:(offset:{ x:number; y:number })=>ipcRenderer.send('pet:drag-start',offset),
  dragEnd:()=>ipcRenderer.send('pet:drag-end'),
  activate:()=>ipcRenderer.send('pet:activate'),
});
