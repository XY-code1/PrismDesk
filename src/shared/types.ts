export type TargetId = 'codex' | 'workbuddy';
export type BackgroundKind = 'aurora' | 'image';
export type Theme = {
  schemaVersion: 1;
  name: string;
  kind: BackgroundKind;
  imagePath?: string;
  brightness: number;
  opacity: number;
  blur: number;
  speed: number;
  fps: 15 | 30 | 60;
  motion: boolean;
};
export type TargetStatus = {
  id: TargetId; name: string; installed: boolean; running: boolean; connected: boolean;
  version?: string; installPath?: string; status: 'not_installed'|'not_running'|'needs_restart'|'connected'|'applied'|'incompatible'|'failed'; detail: string;
};

const keys = new Set(['schemaVersion','name','kind','imagePath','brightness','opacity','blur','speed','fps','motion']);
export function validateTheme(value: unknown): Theme {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('主题配置必须是对象');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !keys.has(k))) throw new Error('主题包含未知字段');
  if (v.schemaVersion !== 1 || typeof v.name !== 'string' || !v.name.trim()) throw new Error('主题版本或名称无效');
  if (v.kind !== 'aurora' && v.kind !== 'image') throw new Error('背景类型无效');
  if (v.kind === 'image' && typeof v.imagePath !== 'string') throw new Error('图片主题缺少资源');
  for (const [key, min, max] of [['brightness',0.2,1.5],['opacity',0,1],['blur',0,40],['speed',0.1,3]] as const) {
    if (typeof v[key] !== 'number' || v[key] < min || v[key] > max) throw new Error(`${key} 超出范围`);
  }
  if (![15,30,60].includes(v.fps as number) || typeof v.motion !== 'boolean') throw new Error('动画设置无效');
  return { schemaVersion:1, name:v.name.trim(), kind:v.kind, imagePath:v.imagePath as string|undefined, brightness:v.brightness as number, opacity:v.opacity as number, blur:v.blur as number, speed:v.speed as number, fps:v.fps as 15|30|60, motion:v.motion as boolean };
}
