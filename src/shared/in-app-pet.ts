import type { PetAppearance, TargetId, Theme } from './types.js';
import { inAppSettingsCss } from './in-app-settings.js';

// ---------------------------------------------------------------------------
// Shared rules for the in-client floating pet.
//
// Two consumers must never drift apart:
//   1. the unit tests under `npm test`, which import these functions directly;
//   2. the payload CDP writes into the Codex / WorkBuddy renderer, which pastes the *source text*
//      of `RUNTIME` (see `inlinedRuntime()`) into the page.
// Because of (2) every function listed in `RUNTIME` must stay self-contained: no reference to
// module scope, no default parameter that reads a module constant, no helper it does not declare
// itself. Anything else would throw inside the client page. `tests/in-app-pet.test.ts` executes
// `inlinedRuntime()` in a fresh scope and compares it against the imported functions, so a
// violation fails the suite instead of the client.
// ---------------------------------------------------------------------------

export type Point = { x:number; y:number };
export type Size = { width:number; height:number };
export type Box = { x:number; y:number; size:number };

export const inAppPetIds = {
  host:'prismdesk-pet-host',
  panel:'prismdesk-panel-host',
  style:'prismdesk-pet-style',
  marker:'data-prismdesk-pet',
  // A separate attribute on purpose: the document root must never match the node cleanup selector.
  stateMarker:'data-prismdesk-pet-state',
  global:'__prismdeskInApp',
} as const;

// The pet stays small on purpose: it is an in-window widget, not a second window. The default sits
// inside the 40-60 px band the in-client widget is designed for; the range only leaves room for a
// user who wants a bigger character, and the step keeps the slider landing on whole pixels.
export const petSizeRange = { min:40, max:160, step:4, default:48 } as const;
export const petResizeHandle = 18;
export const petDragThreshold = 5;
export const petAlphaThreshold = 12;
export const petImageLimit = 4 * 1024 * 1024;

// The built-in character is painted inside an ellipse, and the payload hit-tests the pointer against
// the same ellipse (isDefaultCharacterHit). Handing that exact shape to CSS (clip-path) keeps the two
// honest: the browser then routes a press on a transparent pixel past the character instead of to it,
// so the margin falls through to the page exactly where the hit test says it is not the pet. The two
// are tied together by a test rather than by a shared constant, because every function in RUNTIME has
// to stay self-contained enough to be inlined into the page on its own.
export const characterEllipse = { radiusX:0.33, radiusY:0.37 } as const;
export const characterClip = `ellipse(${characterEllipse.radiusX * 100}% ${characterEllipse.radiusY * 100}% at 50% 50%)`;

// The payload's protocol version. Main replaces a page's payload when this does not match, so a
// client that is still running the previous build picks up a payload change without being restarted.
// v8: the character is clipped to its silhouette, so the transparent margin falls through to the page
// again while a press on the silhouette still never reaches a client window-drag region; the pet host
// also stacks above the panel host, so the pet can reopen and close the drawer it lives on top of.
// v7 made the character a real hit target (pointer-events:auto + -webkit-app-region:no-drag) and made
// a drag end only when the pointer leaves the page, not when it leaves the character. v1-v3 were
// click-through, which let a press on the pet fall through to a client whose top chrome is an OS
// window-drag region: the first mouse move then dragged the window and the gesture never reached the
// payload, so the pet could not be dragged at all in its default corner.
export const inAppPetPayloadVersion = 10;

export const defaultPetAppearance:PetAppearance = { size:petSizeRange.default, opacity:1, mirror:false, visible:true };

const appearanceKeys = new Set(['size','opacity','mirror','visible','imagePath']);

export function validatePetAppearance(value:unknown):PetAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('宠物形象配置必须是对象');
  const v = value as Record<string,unknown>;
  if (Object.keys(v).some(key => !appearanceKeys.has(key))) throw new Error('宠物形象包含未知字段');
  if (typeof v.size !== 'number' || !Number.isInteger(v.size) || v.size < petSizeRange.min || v.size > petSizeRange.max) throw new Error('宠物尺寸超出范围');
  const opacity=v.opacity===undefined?1:v.opacity;
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0.2 || opacity > 1) throw new Error('宠物透明度超出范围');
  if (typeof v.mirror !== 'boolean' || typeof v.visible !== 'boolean') throw new Error('宠物镜像或显示设置无效');
  if (v.imagePath !== undefined && (typeof v.imagePath !== 'string' || !v.imagePath.trim() || /[\r\n]/.test(v.imagePath as string))) throw new Error('宠物图片路径无效');
  return { size:v.size, opacity, mirror:v.mirror, visible:v.visible, imagePath:v.imagePath as string|undefined };
}

// ---------------------------------------------------------------------------
// Inlined runtime
// ---------------------------------------------------------------------------

export function clampBox(box:Box, viewport:Size):Box {
  const size = Math.round(Math.min(Math.max(box.size, 1), 4096));
  const limitX = Math.max(0, Math.round(viewport.width) - size);
  const limitY = Math.max(0, Math.round(viewport.height) - size);
  return { size, x: Math.round(Math.min(Math.max(box.x, 0), limitX)), y: Math.round(Math.min(Math.max(box.y, 0), limitY)) };
}

// The default placement is the top-right corner of the client's content area, because that is the
// corner a client's own chrome is least likely to own: the pet is a small widget, not a second
// window, and it must not sit on the window controls. `topInset` is the height of whatever band the
// payload found in that corner (see `topChromeInset`), so a client with a titlebar pushes the pet
// below it while a client without chrome keeps the pet in the corner.
export function defaultBox(viewport:Size, size:number, topInset=0):Box {
  const margin = 12;
  const limitX = Math.max(0, Math.round(viewport.width) - size);
  const limitY = Math.max(0, Math.round(viewport.height) - size);
  const inset = Math.max(0, Math.round(Number.isFinite(topInset) ? topInset : 0));
  return { size, x: Math.round(Math.min(Math.max(limitX - margin, 0), limitX)), y: Math.round(Math.min(Math.max(inset + margin, 0), limitY)) };
}

// The payload hit-tests the top-right corner and hands the measurement to this rule. A band only
// counts as chrome when it is anchored at the very top and is a small part of the window: the client
// root also starts at the top, and treating that as a titlebar would push the pet to the bottom of
// the window, which is the placement this rule exists to move away from.
export function topChromeInset(hitTop:number, hitHeight:number, viewportHeight:number):number {
  if (!Number.isFinite(hitTop) || !Number.isFinite(hitHeight)) return 0;
  const top = Math.round(hitTop);
  const height = Math.round(hitHeight);
  if (height <= 0 || top < 0 || top > 8) return 0;
  if (height > Math.max(24, Math.round(viewportHeight * 0.25))) return 0;
  return Math.max(0, top + height);
}

// The resize grip is a square in the bottom-right corner of the box. A fixed 18 px grip is most of a
// 40 px pet, so it is capped by both the theme's handle size and a third of the character.
export function resizeHandleSize(size:number, max:number):number {
  return Math.max(8, Math.min(Math.round(max), Math.round(size / 3)));
}

// Same silhouette as the Windows desktop pet: the character is painted inside an ellipse slightly
// larger than its body, so the transparent margin of the artwork never takes the pointer.
export function isDefaultCharacterHit(localX:number, localY:number, size:number):boolean {
  const dx = (localX - size / 2) / (size * 0.33);
  const dy = (localY - size / 2) / (size * 0.37);
  return dx * dx + dy * dy <= 1;
}

export function insideBox(localX:number, localY:number, size:number):boolean {
  return localX >= 0 && localY >= 0 && localX < size && localY < size;
}

// The imported artwork is sampled through a size x size canvas, so the sample coordinate is the
// local coordinate; mirroring flips the artwork, not the box, and is undone here.
export function sampleCoords(localX:number, localY:number, size:number, mirror:boolean):Point {
  const limit = Math.max(0, size - 1);
  const x = Math.min(Math.max(Math.round(localX), 0), limit);
  const y = Math.min(Math.max(Math.round(localY), 0), limit);
  return { x: mirror ? limit - x : x, y };
}

export function isResizeHandle(localX:number, localY:number, size:number, handle:number):boolean {
  return insideBox(localX, localY, size) && localX >= size - handle && localY >= size - handle;
}

export function resizeDelta(startX:number, startY:number, currentX:number, currentY:number):number {
  return (currentX - startX + (currentY - startY)) / 2;
}

export function clampSize(size:number, min:number, max:number):number {
  return Math.round(Math.min(Math.max(size, min), max));
}

export function isDragGesture(startX:number, startY:number, endX:number, endY:number, threshold:number):boolean {
  return Math.hypot(endX - startX, endY - startY) > threshold;
}

export function alphaHit(alpha:number, threshold:number):boolean {
  return alpha > threshold;
}

export const RUNTIME:ReadonlyArray<readonly [string, (...args:any[]) => any]> = [
  ['clampBox', clampBox],
  ['defaultBox', defaultBox],
  ['topChromeInset', topChromeInset],
  ['resizeHandleSize', resizeHandleSize],
  ['isDefaultCharacterHit', isDefaultCharacterHit],
  ['insideBox', insideBox],
  ['sampleCoords', sampleCoords],
  ['isResizeHandle', isResizeHandle],
  ['resizeDelta', resizeDelta],
  ['clampSize', clampSize],
  ['isDragGesture', isDragGesture],
  ['alphaHit', alphaHit],
];

export function inlinedRuntime():string {
  return RUNTIME.map(([name, fn]) => `const ${name}=${fn.toString()};`).join('\n');
}

// ---------------------------------------------------------------------------
// Default character artwork (MIT, authored for this repository - the same character as the
// optional Windows desktop pet in src/pet/index.html, without the per-part animation hooks that
// only that renderer uses).
// ---------------------------------------------------------------------------

export const defaultCharacterSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="168" height="168" viewBox="0 0 168 168">'
  + '<defs>'
  + '<linearGradient id="pdc-body" x1="30" y1="24" x2="140" y2="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a78bfa"/><stop offset="0.45" stop-color="#7c6cff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient>'
  + '<linearGradient id="pdc-crown" x1="40" y1="28" x2="130" y2="86" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="1" stop-color="#ffffff" stop-opacity="0.04"/></linearGradient>'
  + '<radialGradient id="pdc-shine" cx="0.38" cy="0.26" r="0.62"><stop offset="0" stop-color="#ffffff" stop-opacity="0.6"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>'
  + '<radialGradient id="pdc-halo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#8b7cff" stop-opacity="0.45"/><stop offset="1" stop-color="#8b7cff" stop-opacity="0"/></radialGradient>'
  + '</defs>'
  + '<ellipse cx="84" cy="88" rx="62" ry="66" fill="url(#pdc-halo)"/>'
  + '<ellipse cx="84" cy="147" rx="33" ry="6.5" fill="#05070f" opacity="0.26"/>'
  + '<path d="M84 30c17 0 33 12 39 27 6 15 6 33 2 50-4 17-19 32-41 32s-37-15-41-32c-4-17-4-35 2-50 6-15 22-27 39-27Z" fill="url(#pdc-body)"/>'
  + '<path d="M84 30c17 0 33 12 39 27l-21 16-18-9-18 9-21-16c6-15 22-27 39-27Z" fill="url(#pdc-crown)"/>'
  + '<ellipse cx="84" cy="88" rx="44" ry="48" fill="url(#pdc-shine)"/>'
  + '<ellipse cx="67" cy="92" rx="7.5" ry="10" fill="#141a2e"/><ellipse cx="101" cy="92" rx="7.5" ry="10" fill="#141a2e"/>'
  + '<circle cx="64.4" cy="87.6" r="2.6" fill="#ffffff" opacity="0.92"/><circle cx="98.4" cy="87.6" r="2.6" fill="#ffffff" opacity="0.92"/>'
  + '<ellipse cx="55" cy="105" rx="7" ry="4.4" fill="#ff9ec4" opacity="0.45"/><ellipse cx="113" cy="105" rx="7" ry="4.4" fill="#ff9ec4" opacity="0.45"/>'
  + '<path d="M76 109q8 8 16 0" fill="none" stroke="#141a2e" stroke-width="3.2" stroke-linecap="round"/>'
  + '<path d="M118 36l3 7.6 7.6 3-7.6 3-3 7.6-3-7.6-7.6-3 7.6-3z" fill="#dbe4ff" opacity="0.9"/>'
  + '</svg>';

export function characterDataUrl():string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(defaultCharacterSvg);
}

// ---------------------------------------------------------------------------
// Injected styles. Three parts, because a document <style> cannot reach into a shadow root: the
// page part carries the two hosts, and each host gets its own stylesheet inside its shadow root.
//
// The hosts are pinned with !important because client CSS must not reflow them, and every property
// that could be inherited from the page (zoom, transform, filter, visibility) is reset on the host.
// The pet itself never takes pointer events: the payload hit-tests the pointer against the artwork,
// which is what lets a transparent pixel fall through to the page underneath.
// ---------------------------------------------------------------------------

const pageCss = '#prismdesk-pet-host{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;background:none!important;pointer-events:none!important;z-index:2147483001!important;display:block!important;visibility:visible!important;opacity:1!important;filter:none!important;transform:none!important;zoom:1!important}'
  + '#prismdesk-pet-host.pd-hidden{display:none!important}'
  + '#prismdesk-panel-host{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;background:none!important;pointer-events:none!important;z-index:2147483000!important;display:block!important;visibility:visible!important;opacity:1!important;filter:none!important;transform:none!important;zoom:1!important}';

// The character itself is a hit target (pointer-events:auto). A fully click-through layer is not an
// option for it: these clients put their own chrome behind the pet, that chrome is often an OS
// window-drag region (Electron's -webkit-app-region), and a press which falls through to it turns
// the first mouse move into a window drag, so the gesture never reaches the payload. The built-in
// character is therefore clipped to the same ellipse the hit test uses: the browser routes the
// silhouette to the pet and the transparent margin past it to the page. Imported artwork keeps the
// whole box as its hit area (see pd-solid below), and no-drag keeps the pet usable even if a client
// later nests its overlay inside a drag region.
const petCss = ':host{display:block}'
  + '.pd-anchor{position:absolute;left:0;top:0;will-change:transform}'
  + '.pd-flip{display:block;transform-origin:50% 60%}'
  + '.pd-flip.pd-mirror{transform:scaleX(-1)}'
  + '.pd-art{display:block;max-width:none;max-height:none;border:0;background:none;animation:pd-bob 3.4s ease-in-out infinite;transform-origin:50% 60%;pointer-events:auto;-webkit-app-region:no-drag;user-select:none;-webkit-user-drag:none}'
  + '.pd-art{clip-path:' + characterClip + '}'
  + '.pd-art.pd-solid{clip-path:none}'
  + ':host(.pd-panel-open) .pd-art{pointer-events:none}'
  + ':host(.pd-paused) .pd-art{animation-play-state:paused}'
  + ':host(.pd-dragging) .pd-art{animation-play-state:paused}'
  + '.pd-grip{position:absolute;width:18px;height:18px;border-radius:5px;background:rgba(124,108,255,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.65);opacity:0;transition:opacity .12s ease;pointer-events:none}'
  + '.pd-grip.pd-on{opacity:1}'
  + '@keyframes pd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}'
  + '@media (prefers-reduced-motion:reduce){.pd-art{animation:none!important}}';

export const inAppPetCss = { page:pageCss, pet:petCss, panel:inAppSettingsCss };

// ---------------------------------------------------------------------------
// Local artwork validation. Only the file type and the size are checked; the file never leaves
// this machine and is copied into the PrismDesk configuration directory.
// ---------------------------------------------------------------------------

export type PetImageMime = 'image/png' | 'image/webp' | 'image/gif';

export type PetImageInfo = { extension:string; mime:PetImageMime; bytes:number; hasAlpha:boolean };

const signatures:Array<{ extension:string; mime:PetImageMime; test:(b:Uint8Array) => boolean }> = [
  { extension:'.png', mime:'image/png', test: b => b.length > 32 && b[0]===0x89 && b[1]===0x50 && b[2]===0x4e && b[3]===0x47 && b[4]===0x0d && b[5]===0x0a && b[6]===0x1a && b[7]===0x0a },
  { extension:'.webp', mime:'image/webp', test: b => b.length > 16 && b[0]===0x52 && b[1]===0x49 && b[2]===0x46 && b[3]===0x46 && b[8]===0x57 && b[9]===0x45 && b[10]===0x42 && b[11]===0x50 },
  { extension:'.gif', mime:'image/gif', test: b => b.length > 14 && b[0]===0x47 && b[1]===0x49 && b[2]===0x46 && b[3]===0x38 && (b[4]===0x37||b[4]===0x39) && b[5]===0x61 },
];

function pngHasAlpha(bytes:Uint8Array):boolean {
  // 8 byte signature, 4 byte chunk length, "IHDR", width, height, bit depth, colour type.
  const colourType = bytes[25];
  return colourType === 3 || colourType === 4 || colourType === 6;
}

function webpHasAlpha(bytes:Uint8Array):boolean {
  const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (chunk === 'VP8X') return (bytes[20] & 0x10) !== 0;
  if (chunk === 'VP8L') return (bytes[24] & 0x10) !== 0;
  if (chunk === 'VP8 ') return false;
  return chunk === 'ALPH';
}

export function validatePetImage(input:{ name:string; bytes:Uint8Array }):PetImageInfo {
  const bytes = input.bytes;
  if (!bytes || typeof bytes.length !== 'number' || bytes.length === 0) throw new Error('宠物图片为空');
  if (bytes.length > petImageLimit) throw new Error(`宠物图片超过 ${Math.round(petImageLimit / 1024 / 1024)} MB 上限`);
  const match = signatures.find(candidate => candidate.test(bytes));
  if (!match) throw new Error('仅支持透明 PNG、WebP、GIF');
  const extension = (input.name.toLowerCase().match(/\.[a-z0-9]+$/) ?? [''])[0];
  if (extension !== match.extension) throw new Error(`宠物图片扩展名与文件内容不一致（应为 ${match.extension}）`);
  const hasAlpha = match.mime === 'image/png' ? pngHasAlpha(bytes) : match.mime === 'image/webp' ? webpHasAlpha(bytes) : true;
  return { extension, mime:match.mime, bytes:bytes.length, hasAlpha };
}

// ---------------------------------------------------------------------------
// Payload-facing configuration and request protocol (types only - validated in main).
// ---------------------------------------------------------------------------

export type InAppConfig = {
  target:TargetId;
  theme:Theme;
  // Managed local artwork as a data URL, or null for the built-in character.
  petImage:string|null;
  // Remembered position of this client's pet, or null on the first run.
  box:Box | null;
  wallpaperEngine:{ installed:boolean; running:boolean; experimental:true; path?:string|null };
  notice?:{ kind:'info'|'error'; text:string; nonce:number }|null;
};

export type InAppRequest =
  | { type:'save'; theme:unknown }
  | { type:'move'; x:number; y:number }
  | { type:'resize'; x:number; y:number; size:number }
  | { type:'import-background' }
  | { type:'import-pet' }
  | { type:'restore-pet' }
  | { type:'restore-background' }
  | { type:'wallpaper-open' }
  | { type:'wallpaper-folder' }
  | { type:'quit-app' }
  | { type:'restore' };

export type InAppRequestType = InAppRequest['type'];

const requestTypes = new Set<string>(['save','move','resize','import-pet','import-background','restore-pet','restore-background','wallpaper-open','wallpaper-folder','quit-app','restore']);

// The page is not trusted more than the rest of the renderer: every drained request is validated
// here, before it reaches the store or the memory file.
export function parseInAppRequests(value:unknown):InAppRequest[] {
  if (!Array.isArray(value)) return [];
  const out:InAppRequest[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const v = entry as Record<string,unknown>;
    const type = v.type;
    if (typeof type !== 'string' || !requestTypes.has(type)) continue;
    if (type === 'save') { out.push({ type:'save', theme:v.theme }); continue; }
    if (type === 'move') {
      if (!Number.isInteger(v.x) || !Number.isInteger(v.y) || Math.abs(v.x as number) > 100_000 || Math.abs(v.y as number) > 100_000) continue;
      out.push({ type:'move', x:v.x as number, y:v.y as number }); continue;
    }
    if (type === 'resize') {
      if (!Number.isInteger(v.x) || !Number.isInteger(v.y) || typeof v.size !== 'number' || !Number.isFinite(v.size)) continue;
      out.push({ type:'resize', x:v.x as number, y:v.y as number, size:clampSize(v.size as number, petSizeRange.min, petSizeRange.max) }); continue;
    }
    out.push({ type:type as InAppRequestType } as InAppRequest);
  }
  return out;
}
