import { defaultPetAppearance, validatePetAppearance } from './in-app-pet.js';

export type TargetId = 'codex' | 'workbuddy';
export type BackgroundKind = 'aurora' | 'image';
// The floating pet has two product shapes: injected into the client window (default) or a separate
// always-on-top Windows window (optional, see src/main/pet.ts).
export type PetMode = 'in-app' | 'desktop';
export type PetAppearance = {
  size: number;
  mirror: boolean;
  visible: boolean;
  imagePath?: string;
};
export type Theme = {
  schemaVersion: 2;
  name: string;
  kind: BackgroundKind;
  imagePath?: string;
  brightness: number;
  opacity: number;
  blur: number;
  speed: number;
  fps: 15 | 30 | 60;
  motion: boolean;
  petMode: PetMode;
  pet: PetAppearance;
};
export type TargetStatus = {
  id: TargetId; name: string; installed: boolean; running: boolean; connected: boolean;
  pet?: boolean;
  version?: string; installPath?: string; status: 'not_installed'|'not_running'|'needs_restart'|'connected'|'applied'|'incompatible'|'failed'; detail: string;
};

const keysV1 = new Set(['schemaVersion','name','kind','imagePath','brightness','opacity','blur','speed','fps','motion']);
const keysV2 = new Set([...keysV1, 'petMode', 'pet']);
// A version 1 file predates the in-client pet. It is migrated, not rejected, so an existing
// installation keeps its background instead of silently falling back to the default theme.
export function validateTheme(value: unknown): Theme {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('主题配置必须是对象');
  const v = value as Record<string, unknown>;
  const version = v.schemaVersion;
  if (version !== 1 && version !== 2) throw new Error('主题版本无效');
  const keys = version === 1 ? keysV1 : keysV2;
  if (Object.keys(v).some(k => !keys.has(k))) throw new Error('主题包含未知字段');
  if (typeof v.name !== 'string' || !v.name.trim()) throw new Error('主题版本或名称无效');
  if (v.kind !== 'aurora' && v.kind !== 'image') throw new Error('背景类型无效');
  if (v.kind === 'image' && typeof v.imagePath !== 'string') throw new Error('图片主题缺少资源');
  for (const [key, min, max] of [['brightness',0.2,1.5],['opacity',0,1],['blur',0,40],['speed',0.1,3]] as const) {
    if (typeof v[key] !== 'number' || v[key] < min || v[key] > max) throw new Error(`${key} 超出范围`);
  }
  if (![15,30,60].includes(v.fps as number) || typeof v.motion !== 'boolean') throw new Error('动画设置无效');
  const petMode = version === 1 ? 'in-app' : v.petMode;
  if (petMode !== 'in-app' && petMode !== 'desktop') throw new Error('宠物模式无效');
  const pet = version === 1 ? { ...defaultPetAppearance } : validatePetAppearance(v.pet);
  return { schemaVersion:2, name:v.name.trim(), kind:v.kind, imagePath:v.imagePath as string|undefined, brightness:v.brightness as number, opacity:v.opacity as number, blur:v.blur as number, speed:v.speed as number, fps:v.fps as 15|30|60, motion:v.motion as boolean, petMode, pet };
}
