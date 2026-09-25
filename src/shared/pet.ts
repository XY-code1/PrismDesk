// Pure desktop-pet geometry and gesture rules, shared by the main process and the pet renderer.
// Nothing here touches Electron, so every rule below is unit-tested under `npm test`.

export type Point = { x:number; y:number };
export type Rect = { x:number; y:number; width:number; height:number };
export type PetState = { schemaVersion:1; x:number; y:number };
export type PointerGesture = 'click' | 'drag';

export const petWindowSize = { width:168, height:168 } as const;
export const petDragThreshold = 4;
const coordinateLimit = 100_000;
// Same strictness as the theme schema: a stored file with unknown fields is a corrupt or tampered
// file, not a newer format, so it is discarded instead of being trusted.
const stateKeys = new Set(['schemaVersion','x','y']);

export function validatePetState(value:unknown):PetState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string,unknown>;
  if (Object.keys(v).some(key => !stateKeys.has(key))) return null;
  if (v.schemaVersion !== 1) return null;
  if (!Number.isInteger(v.x) || !Number.isInteger(v.y)) return null;
  if (Math.abs(v.x as number) > coordinateLimit || Math.abs(v.y as number) > coordinateLimit) return null;
  return { schemaVersion:1, x:v.x as number, y:v.y as number };
}

// The character is painted inside an ellipse slightly larger than its silhouette. Everything
// outside that ellipse is transparent and must stay click-through, so this single ellipse decides
// both the renderer hit test and the occlusion assertions in the tests.
export function petHitArea(width:number, height:number) {
  return { cx:width/2, cy:height/2, rx:width*0.33, ry:height*0.37 };
}

export function isPetHit(x:number, y:number, width:number, height:number) {
  const area = petHitArea(width, height);
  const dx = (x-area.cx)/area.rx, dy = (y-area.cy)/area.ry;
  return dx*dx+dy*dy <= 1;
}

// A press that travels further than the threshold is a window move and never an activation, so
// dragging the character cannot open the settings window by accident.
export function classifyPointerGesture(start:Point, end:Point, threshold = petDragThreshold):PointerGesture {
  return Math.hypot(end.x-start.x, end.y-start.y) <= threshold ? 'click' : 'drag';
}

function clampWithin(value:number, min:number, max:number) {
  return max < min ? min : Math.min(Math.max(value, min), max);
}

function intersectionArea(a:Rect, b:Rect) {
  const width = Math.min(a.x+a.width, b.x+b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y+a.height, b.y+b.height) - Math.max(a.y, b.y);
  return width <= 0 || height <= 0 ? 0 : width*height;
}

function subtract(rect:Rect, cut:Rect):Rect[] {
  const left = Math.max(rect.x, cut.x), right = Math.min(rect.x+rect.width, cut.x+cut.width);
  const top = Math.max(rect.y, cut.y), bottom = Math.min(rect.y+rect.height, cut.y+cut.height);
  if (right <= left || bottom <= top) return [rect];
  const parts:Rect[] = [];
  if (rect.y < top) parts.push({ x:rect.x, y:rect.y, width:rect.width, height:top-rect.y });
  if (bottom < rect.y+rect.height) parts.push({ x:rect.x, y:bottom, width:rect.width, height:rect.y+rect.height-bottom });
  if (rect.x < left) parts.push({ x:rect.x, y:top, width:left-rect.x, height:bottom-top });
  if (right < rect.x+rect.width) parts.push({ x:right, y:top, width:rect.x+rect.width-right, height:bottom-top });
  return parts;
}

// Exact coverage of the pet by the union of the work areas. Only a pet with real off-screen
// pixels is moved: one straddling two displays is left alone, while a pet stranded by a removed
// or resized display is always pulled back inside.
function uncoveredArea(bounds:Rect, workAreas:Rect[]):number {
  let remaining:Rect[] = [bounds];
  for (const area of workAreas) {
    const next:Rect[] = [];
    for (const rect of remaining) next.push(...subtract(rect, area));
    remaining = next;
    if (!remaining.length) return 0;
  }
  return remaining.reduce((sum, rect) => sum + rect.width*rect.height, 0);
}

export function clampToDisplays(bounds:Rect, workAreas:Rect[]):Point {
  const current = { x:Math.round(bounds.x), y:Math.round(bounds.y) };
  if (!workAreas.length || uncoveredArea(bounds, workAreas) === 0) return current;
  let best = workAreas[0], bestArea = -1, bestDistance = Infinity;
  for (const area of workAreas) {
    const overlap = intersectionArea(bounds, area);
    const distance = Math.hypot(bounds.x+bounds.width/2-(area.x+area.width/2), bounds.y+bounds.height/2-(area.y+area.height/2));
    if (overlap > bestArea || (overlap === bestArea && distance < bestDistance)) { best = area; bestArea = overlap; bestDistance = distance; }
  }
  return {
    x:Math.round(clampWithin(bounds.x, best.x, best.x+best.width-bounds.width)),
    y:Math.round(clampWithin(bounds.y, best.y, best.y+best.height-bounds.height)),
  };
}

export function defaultPetPosition(workArea:Rect, width = petWindowSize.width, height = petWindowSize.height):Point {
  const margin = 24;
  return {
    x:Math.round(clampWithin(workArea.x+workArea.width-width-margin, workArea.x, workArea.x+workArea.width-width)),
    y:Math.round(clampWithin(workArea.y+workArea.height-height-margin, workArea.y, workArea.y+workArea.height-height)),
  };
}
