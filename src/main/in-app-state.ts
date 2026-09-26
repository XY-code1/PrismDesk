import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Point } from '../shared/in-app-pet.js';
import type { TargetId } from '../shared/types.js';

// The floating pet remembers one position per client, because the two clients have different window
// sizes and layouts. The pet size is part of the theme (it is a look, not a placement).
export type InAppPetMemory = { schemaVersion:1; clients:Partial<Record<TargetId,Point>> };

const targetIds:TargetId[]=['codex','workbuddy'];
const keys=new Set(['schemaVersion','clients']);
const coordinateLimit=100_000;
export const emptyInAppPetMemory:InAppPetMemory={schemaVersion:1,clients:{}};

function validatePoint(value:unknown):Point|null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v=value as Record<string,unknown>;
  if (Object.keys(v).some(key => key!=='x' && key!=='y')) return null;
  if (!Number.isInteger(v.x) || !Number.isInteger(v.y)) return null;
  if (Math.abs(v.x as number)>coordinateLimit||Math.abs(v.y as number)>coordinateLimit) return null;
  return { x:v.x as number, y:v.y as number };
}

// Same strictness as the other stored files: a file with unknown fields is corrupt or tampered
// with, never a newer format, so it is discarded instead of being trusted.
export function validateInAppPetMemory(value:unknown):InAppPetMemory|null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v=value as Record<string,unknown>;
  if (Object.keys(v).some(key => !keys.has(key))) return null;
  if (v.schemaVersion!==1) return null;
  if (!v.clients || typeof v.clients !== 'object' || Array.isArray(v.clients)) return null;
  const clients=(v.clients as Record<string,unknown>);
  if (Object.keys(clients).some(key => !targetIds.includes(key as TargetId))) return null;
  const out:InAppPetMemory={schemaVersion:1,clients:{}};
  for (const id of targetIds) {
    if (clients[id]===undefined) continue;
    const point=validatePoint(clients[id]);
    if (!point) return null;
    out.clients[id]=point;
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
