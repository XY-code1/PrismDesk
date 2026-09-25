import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';
import { Store } from './store.js';
import { PetStateStore } from './pet-state.js';
import { PetWindow } from './pet.js';
import * as adapters from './adapters.js';
import { validateTheme, type TargetId } from '../shared/types.js';
let win:BrowserWindow|undefined; let store:Store; let pet:PetWindow|undefined; let tray:Tray|undefined; let quitting=false; let parked=false;
// A freshly shown window can be minimised for us a moment after the show request on this desktop
// (reproduced with a bare Electron window that has nothing to do with PrismDesk, about two seconds
// after `show()`). A minimise that arrives while the window is still settling is not a user action,
// so it is reverted, while a minimise after that window is left alone as the user's own choice.
const strayMinimizeWindow=6_000;
let strayMinimizeUntil=0;
// A parked window must stay parked: whatever makes it visible again - a minimise from the shell, a
// stray show - is undone, so the tray entry stays the only way back to a window the user closed.
function manageMinimize(target:BrowserWindow){if(quitting)return;if(parked){target.hide();return}if(Date.now()>strayMinimizeUntil)return;target.restore();target.focus()}
function manageShow(target:BrowserWindow){if(parked&&!quitting)target.hide()}
function settingsWindow(){if(win&&!win.isDestroyed())return win;const created=new BrowserWindow({width:1120,height:760,minWidth:900,minHeight:640,backgroundColor:'#090b12',show:false,webPreferences:{preload:join(app.getAppPath(),'dist/preload.cjs'),contextIsolation:true,nodeIntegration:false}});created.on('close',event=>{if(quitting)return;event.preventDefault();hideSettings()});created.on('closed',()=>{if(win===created)win=undefined});created.on('minimize',()=>manageMinimize(created));created.on('show',()=>manageShow(created));created.webContents.setWindowOpenHandler(()=>({action:'deny'}));created.webContents.on('will-navigate',event=>event.preventDefault());void created.loadFile(join(app.getAppPath(),'dist/renderer/index.html'));win=created;return created}
// Closing the settings window parks it in the tray. The window is hidden rather than destroyed so
// that an unfinished form survives, and the parked state is asserted again on the next tick in case
// the close raced the shell. A hidden window is never re-iconified here: `restore()` would flash it
// back on screen, and an iconic window that is also hidden cannot show a taskbar button anyway.
function hideSettings(){const target=win;if(!target||target.isDestroyed())return;parked=true;target.hide();setTimeout(()=>{if(quitting||!win||win.isDestroyed())return;win.hide()},150)}
// One entry point for the tray item, the pet click and a second instance: never create a second
// settings window, always restore a minimised one, and focus an already open one.
async function showSettings(){const created=settingsWindow();parked=false;if(created.isMinimized())created.restore();if(created.webContents.isLoading())await new Promise<void>(resolve=>created.webContents.once('did-finish-load',()=>resolve()));strayMinimizeUntil=Date.now()+strayMinimizeWindow;created.show();created.focus()}
function createTray(){const icon=nativeImage.createFromPath(join(app.getAppPath(),'dist/assets/tray.png'));if(icon.isEmpty())throw new Error('缺少托盘图标，请先执行 npm run build');tray=new Tray(icon);tray.setToolTip('PrismDesk 桌宠');tray.setContextMenu(Menu.buildFromTemplate([{label:'打开设置',click:()=>{void showSettings()}},{type:'separator'},{label:'退出 PrismDesk',click:()=>quitApp()}]));tray.on('double-click',()=>{void showSettings()})}
function quitApp(){if(quitting)return;quitting=true;pet?.destroy();pet=undefined;tray?.destroy();tray=undefined;app.quit()}
async function start(){store=new Store(join(app.getPath('userData'),'themes'));pet=new PetWindow(new PetStateStore(app.getPath('userData')),()=>{void showSettings()});await pet.show();createTray();await showSettings()}
if(!app.requestSingleInstanceLock())app.quit();else{app.on('second-instance',()=>{void showSettings()});app.whenReady().then(start).catch(error=>{dialog.showErrorBox('PrismDesk 启动失败',String((error as Error)?.message??error))})}
// The settings window hides to the tray instead of closing, so the app outlives its windows.
app.on('before-quit',()=>{quitting=true;pet?.destroy();pet=undefined;tray?.destroy();tray=undefined});
ipcMain.handle('theme:load',()=>store.load());
ipcMain.handle('theme:save',(_,v)=>store.save(v));
ipcMain.handle('theme:image',async()=>{const r=await dialog.showOpenDialog(settingsWindow(),{properties:['openFile'],filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']}]});return r.canceled?null:store.importImage(r.filePaths[0])});
ipcMain.handle('theme:import',async()=>{const r=await dialog.showOpenDialog(settingsWindow(),{properties:['openFile'],filters:[{name:'PrismDesk theme',extensions:['json']}]});return r.canceled?null:store.importTheme(r.filePaths[0])});
ipcMain.handle('targets:status',()=>Promise.all((['codex','workbuddy'] as TargetId[]).map(adapters.status)));
ipcMain.handle('target:launch',(_,id:TargetId)=>adapters.launch(id));
ipcMain.handle('target:apply',async(_,id:TargetId,v:unknown)=>adapters.apply(id,await store.save(validateTheme(v))));
ipcMain.handle('target:restore',(_,id:TargetId)=>adapters.restore(id));
