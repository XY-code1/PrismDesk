# Adapter research — 2026-09-25

Only installation metadata, process command lines, executable versions, package metadata, renderer target metadata and visual screenshots were inspected. No chat history, account credentials or page body text was read.

## Local observations

- Codex: Microsoft Store package `OpenAI.Codex_26.917.9434.0_x64__2p2nqsd0c76g0`, product version `26.917.9434.0`, Chromium renderer processes present. Installed below protected `WindowsApps`; PrismDesk does not modify it.
- WorkBuddy: `5.5.3`, executable `%LOCALAPPDATA%\Programs\WorkBuddy\WorkBuddy.exe`, Electron `app.asar` present. PrismDesk does not modify it.
- No documented public theme extension API was found in the inspected clients, so the implementation uses reversible local CDP injection.

## References

- `CodeDrobe/desktop` 2.1.0: MPL-2.0 desktop source, Electron packaging, depends on Apache-2.0 `@codedrobe/core` 0.6.0. Used as an architecture reference only.
- `CCDawn/Codex-Dynamic-Skin`: documents loopback CDP, non-modification of `WindowsApps`/`app.asar`, idempotent renderer injection, pause and restoration. Repository assets and branding were not reused.
- `cdredfox/workbuddy-skin-studio` 1.0.0: MIT; its source confirms WorkBuddy renderer URLs contain `renderer/index.html` and uses port 9223. No source or bundled images were copied.

PrismDesk's payload and UI are original. Dependency licenses are recorded in `THIRD_PARTY_NOTICES.md`.
## Phase 2 - Wallpaper Engine (investigation only)

`docs/RESEARCH-WALLPAPER-ENGINE.md` records what Wallpaper Engine publicly exposes, which local
paths and registry keys can be detected, and which ideas are feasible. Summary: detection is a
registry key plus the Steam library manifests; play/pause would go through the community-documented
`-control` command line and is version-fragile; there is no embedding API, so rendering a wallpaper
inside a client window is not planned. Verified locally on 2026-09-26 while writing that document:
Steam is installed at `D:\steam` with a single library, and app `431960` (Wallpaper Engine) is not
installed, so no `wallpaper_engine` folder or Workshop content was inspected. Non-goals, in writing:
no Workshop scraping, no redistribution or bundling of third-party wallpapers, and no code that reads
`steamapps/workshop/content/431960`.