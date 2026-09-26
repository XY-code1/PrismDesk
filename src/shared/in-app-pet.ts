import type { PetAppearance, TargetId, Theme } from './types.js';

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

// The pet stays small on purpose: it is an in-window widget, not a second window.
export const petSizeRange = { min:48, max:256, step:8, default:128 } as const;
export const petResizeHandle = 18;
export const petDragThreshold = 5;
export const petAlphaThreshold = 12;
export const petImageLimit = 4 * 1024 * 1024;

export const defaultPetAppearance:PetAppearance = { size:petSizeRange.default, mirror:false, visible:true };

const appearanceKeys = new Set(['size','mirror','visible','imagePath']);

export function validatePetAppearance(value:unknown):PetAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('宠物形象配置必须是对象');
  const v = value as Record<string,unknown>;
  if (Object.keys(v).some(key => !appearanceKeys.has(key))) throw new Error('宠物形象包含未知字段');
  if (typeof v.size !== 'number' || !Number.isInteger(v.size) || v.size < petSizeRange.min || v.size > petSizeRange.max) throw new Error('宠物尺寸超出范围');
  if (typeof v.mirror !== 'boolean' || typeof v.visible !== 'boolean') throw new Error('宠物镜像或显示设置无效');
  if (v.imagePath !== undefined && (typeof v.imagePath !== 'string' || !v.imagePath.trim() || /[\r\n]/.test(v.imagePath as string))) throw new Error('宠物图片路径无效');
  return { size:v.size, mirror:v.mirror, visible:v.visible, imagePath:v.imagePath as string|undefined };
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

export function defaultBox(viewport:Size, size:number):Box {
  const limitX = Math.max(0, Math.round(viewport.width) - size);
  const limitY = Math.max(0, Math.round(viewport.height) - size);
  return { size, x: Math.round(Math.min(Math.max(limitX - 24, 0), limitX)), y: Math.round(Math.min(Math.max(limitY - 24, 0), limitY)) };
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

const pageCss = '#prismdesk-pet-host{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;background:none!important;pointer-events:none!important;z-index:2147483000!important;display:block!important;visibility:visible!important;opacity:1!important;filter:none!important;transform:none!important;zoom:1!important}'
  + '#prismdesk-pet-host.pd-hidden{display:none!important}'
  + '#prismdesk-panel-host{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;background:none!important;pointer-events:none!important;z-index:2147483001!important;display:block!important;visibility:visible!important;opacity:1!important;filter:none!important;transform:none!important;zoom:1!important}';

const petCss = ':host{display:block}'
  + '.pd-anchor{position:absolute;left:0;top:0;will-change:transform}'
  + '.pd-flip{display:block;transform-origin:50% 60%}'
  + '.pd-flip.pd-mirror{transform:scaleX(-1)}'
  + '.pd-art{display:block;max-width:none;max-height:none;border:0;background:none;animation:pd-bob 3.4s ease-in-out infinite;transform-origin:50% 60%;pointer-events:none;user-select:none;-webkit-user-drag:none}'
  + ':host(.pd-paused) .pd-art{animation-play-state:paused}'
  + ':host(.pd-dragging) .pd-art{animation-play-state:paused}'
  + '.pd-grip{position:absolute;width:18px;height:18px;border-radius:5px;background:rgba(124,108,255,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.65);opacity:0;transition:opacity .12s ease;pointer-events:none}'
  + '.pd-grip.pd-on{opacity:1}'
  + '@keyframes pd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}'
  + '@media (prefers-reduced-motion:reduce){.pd-art{animation:none!important}}';

const panelCss = ':host{display:block}'
  + '.pd-panel{position:absolute;top:0;right:0;width:min(340px,100%);height:100%;display:none;flex-direction:column;gap:12px;padding:16px;overflow-y:auto;overflow-x:hidden;pointer-events:auto;background:rgba(9,11,18,.94);border-left:1px solid rgba(255,255,255,.08);box-shadow:-18px 0 44px rgba(0,0,0,.4);color:#eef1f8;font:400 13px/1.45 Segoe UI,system-ui,sans-serif;text-align:left;direction:ltr;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}'
  + '.pd-panel.pd-open{display:flex}'
  + '.pd-panel *{box-sizing:border-box;font:inherit;color:inherit;letter-spacing:normal;text-transform:none;max-width:none}'
  + '.pd-head{display:flex;align-items:center;justify-content:space-between;gap:10px}'
  + '.pd-head strong{font-size:15px;font-weight:700;letter-spacing:.02em}'
  + '.pd-head small{display:block;margin-top:2px;color:#8b93a8;font-size:11px}'
  + '.pd-close{background:transparent;border:1px solid rgba(255,255,255,.14);border-radius:8px;color:inherit;padding:4px 10px;cursor:pointer;font:inherit}'
  + '.pd-section{display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(255,255,255,.07);padding-top:12px}'
  + '.pd-section>b{font-size:11px;letter-spacing:.16em;color:#8d7cff}'
  + '.pd-row{display:flex;align-items:center;justify-content:space-between;gap:9px}'
  + '.pd-seg{display:flex;flex-wrap:wrap;gap:6px}'
  + '.pd-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:inherit;padding:7px 10px;cursor:pointer;font:inherit}'
  + '.pd-btn.pd-on{background:#3a3462;border-color:#5b4ede;color:#ded9ff}'
  + '.pd-btn.pd-primary{background:#7c6cff;border-color:transparent;font-weight:600}'
  + '.pd-btn.pd-danger{background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.4);color:#fca5a5}'
  + '.pd-field{display:flex;flex-direction:column;gap:6px;color:#a8afc0}'
  + '.pd-field output{float:right;color:#79839a}'
  + '.pd-field input[type=range]{width:100%;accent-color:#7c6cff}'
  + '.pd-check{display:flex;align-items:center;gap:7px}'
  + '.pd-panel select{background:#1b1f2c;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:5px 8px;font:inherit;color:inherit}'
  + '.pd-panel img.pd-preview{align-self:center;width:104px;height:104px;object-fit:contain;border-radius:10px;background-color:#141824;background-image:linear-gradient(45deg,rgba(255,255,255,.07) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.07) 75%),linear-gradient(45deg,rgba(255,255,255,.07) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.07) 75%);background-size:16px 16px;background-position:0 0,8px 8px}'
  + '.pd-hint{color:#7d8698;font-size:11px;line-height:1.5;word-break:break-all}';

export const inAppPetCss = { page:pageCss, pet:petCss, panel:panelCss };

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
  box:{ x:number; y:number } | null;
};

export type InAppRequest =
  | { type:'save'; theme:unknown }
  | { type:'move'; x:number; y:number }
  | { type:'resize'; size:number }
  | { type:'import-background' }
  | { type:'import-pet' }
  | { type:'restore-pet' }
  | { type:'restore' };

export type InAppRequestType = InAppRequest['type'];

const requestTypes = new Set<string>(['save','move','resize','import-pet','import-background','restore-pet','restore']);

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
      if (typeof v.size !== 'number' || !Number.isFinite(v.size)) continue;
      out.push({ type:'resize', size:clampSize(v.size as number, petSizeRange.min, petSizeRange.max) }); continue;
    }
    out.push({ type:type as InAppRequestType } as InAppRequest);
  }
  return out;
}
