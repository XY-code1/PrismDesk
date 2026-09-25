import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { clampToDisplays, defaultPetPosition, isPetHit, petWindowSize } from '../shared/pet.js';
import type { PetStateStore } from './pet-state.js';

const channels = ['pet:drag-start','pet:drag-end','pet:activate'] as const;
const dragTick = 16;
// Windows delivers no pointer events at all to a click-through window, so the renderer cannot be
// the one to notice that the cursor came back. The cursor is polled instead.
const pointerTick = 32;
// Safety net: a release event that never arrives must not leave the pet glued to the cursor.
const dragTimeout = 30_000;
// A release that ended a move is not an activation, even if the two messages arrive together.
const activationGrace = 250;

export class PetWindow {
  private win:BrowserWindow | null = null;
  private dragTimer:ReturnType<typeof setInterval> | null = null;
  private dragOffset:{ x:number; y:number } | null = null;
  private dragStartedAt = 0;
  private dragEndedAt = 0;
  private ignoring = false;
  private guardTimer:ReturnType<typeof setInterval> | null = null;
  private readonly onDisplayChange = () => this.reposition();
  constructor(private readonly store:PetStateStore, private readonly onActivate:() => void){}

  async show(){
    if (this.win) return;
    const bounds = { ...(await this.restorePosition()), ...petWindowSize };
    const win = new BrowserWindow({
      ...bounds, frame:false, transparent:true, show:false, hasShadow:false, alwaysOnTop:true,
      resizable:false, maximizable:false, minimizable:false, fullscreenable:false,
      skipTaskbar:true, focusable:false, backgroundColor:'#00000000',
      webPreferences:{ preload:join(app.getAppPath(),'dist/preload-pet.cjs'), contextIsolation:true, nodeIntegration:false },
    });
    this.win = win;
    win.setMenu(null);
    win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.on('closed', () => { if (this.win === win) this.win = null; });
    this.registerChannels(win);
    screen.on('display-added', this.onDisplayChange);
    screen.on('display-removed', this.onDisplayChange);
    screen.on('display-metrics-changed', this.onDisplayChange);
    await win.loadFile(join(app.getAppPath(),'dist/pet/index.html'));
    if (this.win !== win) return;
    // showInactive keeps a click on the pet from stealing the foreground from the user's work.
    win.showInactive();
    this.guardTimer = setInterval(() => this.syncPointer(win), pointerTick);
  }

  destroy(){
    this.stopDrag(false);
    if (this.guardTimer) { clearInterval(this.guardTimer); this.guardTimer = null; }
    channels.forEach(channel => ipcMain.removeAllListeners(channel));
    screen.removeListener('display-added', this.onDisplayChange);
    screen.removeListener('display-removed', this.onDisplayChange);
    screen.removeListener('display-metrics-changed', this.onDisplayChange);
    const win = this.win;
    this.win = null;
    if (win && !win.isDestroyed()) {
      this.persistSync(win);
      win.destroy();
    }
  }

  private async restorePosition() {
    const saved = await this.store.load();
    const workAreas = () => screen.getAllDisplays().map(display => display.workArea);
    const fallback = defaultPetPosition(screen.getPrimaryDisplay().workArea);
    const target = saved ?? fallback;
    return clampToDisplays({ x:target.x, y:target.y, ...petWindowSize }, workAreas());
  }

  private reposition(){
    const win = this.win;
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    const target = clampToDisplays(bounds, screen.getAllDisplays().map(display => display.workArea));
    if (target.x === bounds.x && target.y === bounds.y) return;
    win.setBounds({ x:target.x, y:target.y, ...petWindowSize });
    void this.persist(win);
  }

  // Scaled transparent windows drift in size when they are only moved, so every move writes the
  // intended size back as well and the character can never grow or shrink while it is dragged.
  private move(x:number, y:number){
    this.win?.setBounds({ x, y, ...petWindowSize });
  }

  private registerChannels(win:BrowserWindow){
    ipcMain.on('pet:drag-start', (event, offset) => {
      if (event.sender !== win.webContents) return;
      const point = readOffset(offset);
      if (point) this.startDrag(win, point);
    });
    ipcMain.on('pet:drag-end', event => { if (event.sender === win.webContents) this.stopDrag(true); });
    ipcMain.on('pet:activate', event => { if (event.sender === win.webContents) this.activate(); });
  }

  // Only the character silhouette may take the pointer; the transparent margin of the window hands
  // it back to the desktop, so the pet never blocks a click meant for something behind it.
  private syncPointer(win:BrowserWindow){
    if (this.win !== win || win.isDestroyed() || this.dragOffset) return;
    const content = win.getContentBounds();
    const cursor = screen.getCursorScreenPoint();
    const x = cursor.x-content.x, y = cursor.y-content.y;
    const inside = x >= 0 && y >= 0 && x < content.width && y < content.height;
    this.setIgnoreMouse(win, !inside || !isPetHit(x, y, content.width, content.height));
  }

  private startDrag(win:BrowserWindow, offset:{ x:number; y:number }){
    this.stopDrag(true);
    this.dragOffset = offset;
    this.dragStartedAt = Date.now();
    this.setIgnoreMouse(win, false);
    // The cursor is polled in screen space rather than following renderer pointer events, so the
    // pet keeps up even when the pointer leaves the small window during a fast move.
    this.dragTimer = setInterval(() => {
      if (!this.win || !this.dragOffset || Date.now()-this.dragStartedAt > dragTimeout) { this.stopDrag(true); return; }
      const cursor = screen.getCursorScreenPoint();
      this.move(Math.round(cursor.x-this.dragOffset.x), Math.round(cursor.y-this.dragOffset.y));
    }, dragTick);
  }

  private stopDrag(persist:boolean){
    if (this.dragTimer) { clearInterval(this.dragTimer); this.dragTimer = null; }
    if (!this.dragOffset) return;
    this.dragOffset = null;
    this.dragEndedAt = Date.now();
    if (persist && this.win) void this.persist(this.win);
  }

  private activate(){
    if (this.dragOffset || Date.now()-this.dragEndedAt < activationGrace) return;
    this.onActivate();
  }

  private setIgnoreMouse(win:BrowserWindow, ignore:boolean){
    if (this.dragOffset || ignore === this.ignoring) return;
    this.ignoring = ignore;
    win.setIgnoreMouseEvents(ignore);
  }

  private persist(win:BrowserWindow){ const bounds = win.getBounds(); return this.store.save({ x:bounds.x, y:bounds.y }); }
  private persistSync(win:BrowserWindow){ if (win.isDestroyed()) return; const bounds = win.getBounds(); this.store.saveSync({ x:bounds.x, y:bounds.y }); }
}

function readOffset(value:unknown){
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string,unknown>;
  if (typeof v.x !== 'number' || typeof v.y !== 'number' || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
  return { x:v.x, y:v.y };
}
