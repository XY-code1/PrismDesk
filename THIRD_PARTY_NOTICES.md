# Third-party notices

PrismDesk is an independent community project and is not affiliated with or endorsed by OpenAI or Tencent. Product names are used only to identify compatible applications.

Runtime dependencies are distributed under their own licenses:

- Electron — MIT
- ws — MIT
- esbuild — MIT
- TypeScript — Apache-2.0
- tsx — MIT
- electron-builder — MIT

Research references (no source files, brands, images, or marketing copy were copied):

- CodeDrobe/desktop — MPL-2.0. Consulted for product-level adapter separation and packaging patterns.
- CodeDrobe/core (documented by the desktop repository) — Apache-2.0. Consulted for local CDP adapter concepts.
- CCDawn/Codex-Dynamic-Skin — repository-specific licenses; Windows CDP workflow and reversible renderer-layer approach were studied.
- cdredfox/workbuddy-skin-studio — MIT. Consulted for WorkBuddy renderer URL discovery and loopback CDP workflow.

See `docs/RESEARCH.md` for exact observations. User-imported backgrounds are not part of PrismDesk and remain subject to their original rights.

## Project artwork

The desktop-pet character "Prism" is original artwork created for this repository and authored as
inline SVG in `src/pet/index.html`, with its animation authored in `src/pet/pet.css`. The tray gem in
`scripts/tray-icon.mjs` is generated geometry rendered to a PNG at build time. Both are covered by
this project's MIT license. No third-party character, sprite, screenshot, or downloaded image asset is
used by the desktop pet or the tray icon.
