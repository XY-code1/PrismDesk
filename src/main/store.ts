import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { validateTheme, type Theme } from '../shared/types.js';

export const defaultTheme:Theme={schemaVersion:1,name:'Prism Aurora',kind:'aurora',brightness:.72,opacity:.82,blur:2,speed:1,fps:30,motion:true};
export class Store {
  constructor(readonly root:string){}
  get path(){return join(this.root,'config.json')}
  async load(){try{return validateTheme(JSON.parse(await readFile(this.path,'utf8')))}catch{return defaultTheme}}
  async save(value:unknown){const theme=validateTheme(value);await mkdir(this.root,{recursive:true});await writeFile(this.path,JSON.stringify(theme,null,2));return theme}
  async importImage(source:string){const ext=extname(source).toLowerCase();if(!['.png','.jpg','.jpeg','.webp'].includes(ext))throw new Error('仅支持 PNG/JPG/WebP');await mkdir(join(this.root,'assets'),{recursive:true});const dest=join(this.root,'assets',`background${ext}`);await copyFile(source,dest);return dest}
  async importTheme(source:string){return this.save(JSON.parse(await readFile(source,'utf8')))}
}
