import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { defaultPetAppearance, validatePetImage, type PetImageInfo } from '../shared/in-app-pet.js';
import { validateTheme, type Theme } from '../shared/types.js';

export const defaultTheme:Theme={schemaVersion:2,name:'Prism Aurora',kind:'aurora',brightness:.72,opacity:.82,blur:2,speed:1,fps:30,motion:true,petMode:'in-app',pet:{...defaultPetAppearance}};
export const backgroundImageLimit=12*1024*1024;
const backgroundExtensions=['.png','.jpg','.jpeg','.webp'];
const petExtensions=['.png','.webp','.gif'];
export type PetImport={ path:string; info:PetImageInfo };
export class Store {
  constructor(readonly root:string){}
  get path(){return join(this.root,'config.json')}
  async load(){try{return validateTheme(JSON.parse(await readFile(this.path,'utf8')))}catch{return defaultTheme}}
  async save(value:unknown){const theme=validateTheme(value);await mkdir(this.root,{recursive:true});await writeFile(this.path,JSON.stringify(theme,null,2));return theme}
  async importImage(source:string){
    const ext=extname(source).toLowerCase();if(!backgroundExtensions.includes(ext))throw new Error('背景仅支持 PNG、JPG、JPEG、WebP');
    let bytes:Buffer;try{bytes=await readFile(source)}catch{throw new Error('所选背景文件不存在或无法读取')}
    if(!bytes.length)throw new Error('所选背景文件为空');if(bytes.length>backgroundImageLimit)throw new Error('背景图片超过 12 MB 上限');
    const png=bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    const jpg=bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9;
    const webp=bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if((ext==='.png'&&!png)||((ext==='.jpg'||ext==='.jpeg')&&!jpg)||(ext==='.webp'&&!webp))throw new Error('背景图片扩展名与文件内容不一致');
    const dir=join(this.root,'assets');await mkdir(dir,{recursive:true});for(const other of backgroundExtensions)if(other!==ext)await rm(join(dir,`background${other}`),{force:true});
    const dest=join(dir,`background${ext}`);await writeFile(dest,bytes);return dest
  }
  async removeBackgroundImage(){await rm(join(this.root,'assets'),{recursive:true,force:true})}
  // The pet artwork is validated by content, not by the file name alone, and lives in its own
  // directory so resetting the pet can always delete exactly one file.
  async importPetImage(source:string):Promise<PetImport>{const bytes=await readFile(source);const info=validatePetImage({name:source,bytes});const dir=join(this.root,'pet-assets');await mkdir(dir,{recursive:true});for(const other of petExtensions){if(other!==info.extension)await rm(join(dir,`pet${other}`),{force:true})}const dest=join(dir,`pet${info.extension}`);await writeFile(dest,bytes);return { path:dest, info }}
  async removePetImage(){await rm(join(this.root,'pet-assets'),{recursive:true,force:true})}
  async petImageData(path?:string):Promise<string|null>{if(!path)return null;try{const bytes=await readFile(path);const info=validatePetImage({name:path,bytes});return `data:${info.mime};base64,${bytes.toString('base64')}`}catch{return null}}
  async importTheme(source:string){return this.save(JSON.parse(await readFile(source,'utf8')))}
}
