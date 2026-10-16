import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { petSizeRange, type Box } from '../shared/in-app-pet.js';
import type { TargetId } from '../shared/types.js';

// The floating pet remembers one position per client, because the two clients have different window
// sizes and layouts. The pet size is part of the theme (it is a look, not a placement).
export type InAppPetMemory = { schemaVersion:2; clients:Partial<Record<TargetId,Box>> };

const targetIds:TargetId[]=['codex','workbuddy'];
const keys=new Set(['schemaVersion','clients']);
const coordinateLimit=100_000;
export const emptyInAppPetMemory:InAppPetMemory={schemaVersion:2,clients:{}};

function validateBox(value:unknown):Box|null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v=value as Record<string,unknown>;
  if (Object.keys(v).some(key => key!=='x' && key!=='y' && key!=='size')) return null;
  if (!Number.isInteger(v.x) || !Number.isInteger(v.y)) return null;
  if (Math.abs(v.x as number)>coordinateLimit||Math.abs(v.y as number)>coordinateLimit) return null;
  const size=v.size===undefined?petSizeRange.default:v.size;
  if (!Number.isInteger(size) || (size as number)<petSizeRange.min || (size as number)>petSizeRange.max) return null;
  return { x:v.x as number, y:v.y as number, size:size as number };
}

// Same strictness as the other stored files: a file with unknown fields is corrupt or tampered
// with, never a newer format, so it is discarded instead of being trusted.
export function validateInAppPetMemory(value:unknown):InAppPetMemory|null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v=value as Record<string,unknown>;
  if (Object.keys(v).some(key => !keys.has(key))) return null;
  if (v.schemaVersion!==1 && v.schemaVersion!==2) return null;
  if (!v.clients || typeof v.clients !== 'object' || Array.isArray(v.clients)) return null;
  const clients=(v.clients as Record<string,unknown>);
  if (Object.keys(clients).some(key => !targetIds.includes(key as TargetId))) return null;
  const out:InAppPetMemory={schemaVersion:2,clients:{}};
  for (const id of targetIds) {
    if (clients[id]===undefined) continue;
    const box=validateBox(clients[id]);
    if (!box) return null;
    out.clients[id]=box;
  }
  return out;
}

export class InAppPetMemoryStore {
  constructor(readonly root:string){}
  get path(){return join(this.root,'in-app-pet.json')}
  async load():Promise<InAppPetMemory>{try{return validateInAppPetMemory(JSON.parse(await readFile(this.path,'utf8')))??emptyInAppPetMemory}catch{return emptyInAppPetMemory}}
  async save(memory:InAppPetMemory){await mkdir(this.root,{recursive:true});await writeFile(this.path,JSON.stringify(memory,null,2));return memory}
  // Called while the app is quitting, where an async write would not finish before exit.
  saveSync(memory:InAppPetMemory){mkdirSync(this.root,{recursive:true});writeFileSync(this.path,JSON.stringify(memory,null,2));return memory}
}
