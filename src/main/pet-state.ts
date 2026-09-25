import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validatePetState, type PetState, type Point } from '../shared/pet.js';

export class PetStateStore {
  constructor(readonly root:string){}
  get path(){return join(this.root,'pet.json')}
  async load():Promise<PetState | null>{try{return validatePetState(JSON.parse(await readFile(this.path,'utf8')))}catch{return null}}
  async save(position:Point){const state:PetState={schemaVersion:1,x:Math.round(position.x),y:Math.round(position.y)};await mkdir(this.root,{recursive:true});await writeFile(this.path,JSON.stringify(state,null,2));return state}
  // Called while the app is quitting, where an async write would not finish before exit.
  saveSync(position:Point){const state:PetState={schemaVersion:1,x:Math.round(position.x),y:Math.round(position.y)};mkdirSync(this.root,{recursive:true});writeFileSync(this.path,JSON.stringify(state,null,2));return state}
}
