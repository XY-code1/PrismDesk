// Styles and static copy for the settings surface injected into a client renderer.
// Keeping this separate from the pet gesture runtime lets both clients share one panel without
// coupling the advanced PrismDesk window to the in-client interaction.
export const wallpaperEngineFeature = {
  title:'Wallpaper Engine',
  badge:'实验性功能',
  note:'当前仅检测安装与运行状态，尚未连接 Wallpaper Engine 壁纸。',
} as const;

export const inAppSettingsCss = ':host{display:block}'
  + '.pd-backdrop{position:absolute;inset:0;display:none;place-items:center;padding:40px;pointer-events:auto;background:rgba(3,6,14,.48);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);-webkit-app-region:no-drag}'
  + '.pd-backdrop.pd-open{display:grid}'
  + '.pd-panel{width:78vw;height:82vh;min-width:680px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;pointer-events:auto;background:linear-gradient(145deg,rgba(39,49,68,.86),rgba(15,23,39,.84));backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(220,235,255,.25);border-radius:26px;box-shadow:0 28px 90px rgba(0,0,0,.55),inset 0 1px rgba(255,255,255,.1);color:#eef1f8;font:400 13px/1.45 Segoe UI,system-ui,sans-serif;text-align:left;direction:ltr;overflow:hidden;-webkit-app-region:no-drag}'
  + '.pd-panel *{box-sizing:border-box;font:inherit;color:inherit;letter-spacing:normal;text-transform:none;max-width:none}'
  + '.pd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:18px 22px 14px;background:rgba(14,18,31,.42);border-bottom:1px solid rgba(255,255,255,.08)}'
  + '.pd-head strong{font-size:18px;font-weight:700;letter-spacing:.02em}.pd-head small{display:block;margin-top:2px;color:#9aa4bb;font-size:11px}'
  + '.pd-close{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);border-radius:10px;color:inherit;padding:5px 11px;cursor:pointer;font:inherit}'
  + '.pd-section{display:flex;flex-direction:column;gap:9px;border:1px solid rgba(255,255,255,.09);border-radius:15px;padding:14px;background:rgba(255,255,255,.035)}'
  + '.pd-main{display:grid;grid-template-columns:190px minmax(0,1fr);min-height:0}.pd-nav{padding:16px;border-right:1px solid rgba(255,255,255,.09);display:flex;flex-direction:column;gap:7px}.pd-nav button{text-align:left}.pd-content{padding:18px;overflow:auto}.pd-view{display:none;flex-direction:column;gap:14px}.pd-view.pd-active{display:flex}.pd-footer{padding:14px 22px;border-top:1px solid rgba(255,255,255,.09);background:rgba(10,16,28,.36)}.pd-notice{min-height:20px;color:#9ee6c8}.pd-notice.pd-error{color:#fca5a5}'
  + '.pd-section>b{font-size:11px;letter-spacing:.16em;color:#b0a7ff}.pd-row{display:flex;align-items:center;justify-content:space-between;gap:9px}.pd-seg{display:flex;flex-wrap:wrap;gap:7px}'
  + '.pd-btn{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:inherit;padding:8px 11px;cursor:pointer;font:inherit}.pd-btn:hover{background:rgba(255,255,255,.12)}'
  + '.pd-btn.pd-on{background:#413878;border-color:#7c6cff;color:#f0edff}.pd-btn.pd-primary{background:#7c6cff;border-color:transparent;font-weight:650}.pd-btn.pd-danger{background:rgba(248,113,113,.12);border-color:rgba(248,113,113,.4);color:#fecaca}.pd-btn:disabled{opacity:.45;cursor:not-allowed}'
  + '.pd-field{display:flex;flex-direction:column;gap:6px;color:#b6bfd1}.pd-field output{float:right;color:#8994ab}.pd-field input[type=range]{width:100%;accent-color:#8b7cff}.pd-check{display:flex;align-items:center;gap:7px}.pd-panel select{background:#1b1f2c;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px 8px;font:inherit;color:inherit}'
  + '.pd-panel img.pd-preview{align-self:center;width:104px;height:104px;object-fit:contain;border-radius:12px;background-color:#141824;background-image:linear-gradient(45deg,rgba(255,255,255,.07) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.07) 75%),linear-gradient(45deg,rgba(255,255,255,.07) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.07) 75%);background-size:16px 16px;background-position:0 0,8px 8px}'
  + '.pd-hint{color:#919bb0;font-size:11px;line-height:1.5;word-break:break-word}.pd-experimental{display:inline-flex;width:max-content;padding:3px 8px;border-radius:999px;background:rgba(251,191,36,.13);border:1px solid rgba(251,191,36,.35);color:#fcd34d;font-size:10px;font-weight:700}.pd-status{font-weight:600;color:#d8dded}'
  + '@media(max-width:760px){.pd-backdrop{padding:14px}.pd-panel{width:calc(100vw - 28px);height:calc(100vh - 28px);min-width:0;border-radius:20px}.pd-main{grid-template-columns:130px minmax(0,1fr)}}';
