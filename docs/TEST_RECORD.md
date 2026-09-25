# Test record — Windows 11 — 2026-09-25

## Automated

Commands:

```text
npm run check  -> PASS
npm test       -> PASS (7/7)
npm run build  -> PASS
```

Covered: strict theme validation (unknown script field and ranges rejected), closed/invalid CDP ports, declarative injection generation, scoped cleanup, and settings reload from a new Store instance.

## WorkBuddy 5.5.3.0 — real client

Executable detected at the standard per-user install location. It was not running, so PrismDesk launched it with `--remote-debugging-address=127.0.0.1 --remote-debugging-port=9223`. The discovered target was a WorkBuddy `renderer/index.html` page on the loopback WebSocket endpoint.

| Check | Result |
|---|---|
| Aurora apply | PASS — one renderer acknowledged `prismdesk-background` |
| Re-apply | PASS — exactly 1 background, 1 style, 1 canvas |
| Image apply | PASS — one managed `data:image/png;base64` image node |
| Motion off | PASS — static frame retained; no repeating RAF is started by payload branch |
| Restore | PASS — renderer reported restored; follow-up status was connected/not applied |
| Visual readability | PASS — privacy-safe screenshot below |
| Input, copy, scroll, modal | NOT YET MANUALLY EXECUTED; no claim of verification |

![WorkBuddy 5.5.3 aurora validation](screenshots/workbuddy-5.5.3-aurora.png)

The screenshot masks the entire sidebar before capture and contains no chat list, account identifier, credential, or user background. The temporary mask was removed before restoration.

## Codex 26.917.9434.0 — real client

The validated Microsoft Store package was launched with loopback CDP. Port ownership was checked against the exact Store executable and only the exact main renderer URL `app://-/index.html` was selected; avatar, detached-window, browser, and sandbox targets were excluded.

| Check | Result |
|---|---|
| Aurora apply | PASS — one exact main renderer acknowledged the layer |
| Image apply | PASS — one local PNG data URL image node |
| Re-apply | PASS — exactly 1 background, 1 style and 1 canvas |
| Restore | PASS — renderer reported restored and follow-up status was connected/not applied |
| Visual background | PASS — privacy-blurred screenshot below |
| Input, copy, scroll, modal | NOT YET MANUALLY EXECUTED; no claim of verification |

![Codex 26.917.9434 aurora validation](screenshots/codex-26.917.9434-aurora.png)

## Packaging

Renderer/main bundles and Windows packages were produced. `release/PrismDesk-Setup-0.1.0-x64.exe` and `release/PrismDesk-Portable-0.1.0-x64.exe` were generated; the unpacked executable remained running for the six-second smoke window. The binaries are unsigned community builds.

## Packaging and network fix - 2026-09-25 (0.1.0-alpha.1)

Failing symptom: `npm run package:win` aborted with `connect ETIMEDOUT 20.205.243.166:443`.

Root cause: the Electron runtime artifact was requested directly from
`https://github.com/electron/electron/releases/download/v38.8.6/electron-v38.8.6-win32-x64.zip`
(that host resolves to 20.205.243.166). The npmmirror endpoints were only injected by
`scripts/package-win.mjs`, so `npm install` (electron postinstall) and a direct `electron-builder`
invocation fell back to GitHub. The `installing native dependencies` stage itself performs no network
request: the only production dependency is `ws` and the tree contains no `binding.gyp`, so
`@electron/rebuild` finds zero modules.

Fix: `electron_mirror` and `electron_builder_binaries_mirror` in `.npmrc`. npm exports both to every
lifecycle script as `npm_config_electron_mirror` / `npm_config_electron_builder_binaries_mirror`, and
`@electron/get` prefers those over `ELECTRON_MIRROR`. No dependency version was changed and no build
step was removed.

Second defect found by running the packaged build: `release/PrismDesk-Portable-0.1.0-x64.exe` opened
an Electron error window - `A JavaScript error occurred in the main process / Error: Dynamic require
of "events" is not supported`. `scripts/build.mjs` bundled the CommonJS `ws` package into the ESM
main bundle, so the esbuild dynamic-require shim threw during load. Fixed with a `createRequire`
banner on the main bundle; the packaged app then rendered its window (Codex card showed the detected
26.917.9434.0 client, WorkBuddy card 5.5.3.0).

## Client verification - 2026-09-25 (machine-assisted pass)

Clients: Codex desktop `26.917.9434.0` (Store package `OpenAI.Codex`, loopback CDP, main target
`app://-/index.html`) and WorkBuddy `5.5.3.0` (per-user Electron install, loopback CDP,
`renderer/index.html`). Injection used the shipped `src/main/injection.ts` payloads; no client
install file was modified and every check ended with a restore.

| Check | Codex 26.917.9434.0 | WorkBuddy 5.5.3.0 |
|---|---|---|
| Aurora apply, one `prismdesk-background`, one `prismdesk-style` | PASS | PASS |
| Layer is `pointer-events:none`, z-index 0, `#root` z-index 1 | PASS | PASS |
| 40-point `elementFromPoint` occlusion sweep | PASS, 0/40 blocked | PASS, 0/40 blocked |
| Composer not covered (hit test at input centre) | PASS | PASS |
| Input accepts a 7-character probe, then cleared; nothing sent | PASS | PASS |
| Scroll of the largest real scroll container | PASS (0 -> 1, 5127 px of range) | NOT VERIFIED, no scroll container existed in the state tested |
| Ctrl+C with the background applied | PASS once (36-character selection, OS clipboard length matched); later repeats inconclusive because the window was hidden and no selection could be made | Copy event fired with a 164-character selection; OS clipboard payload not readable from the automation context |
| Synthetic top-layer element wins over the background | PASS | PASS |
| Motion animation advances | NOT VERIFIED, the window reported `document.hidden=true` throughout and a control rAF loop also received 0 ticks | PASS, canvas content changed across 1.6 s (490 control frames) |
| Paused when the client is hidden/minimized | PASS, frames static, rAF suspended | PASS |
| Re-apply is idempotent (1 background, 1 style, 1 canvas) | PASS | PASS |
| Image apply from a generated 320x180 PNG | PASS, one `data:image/png` node | PASS, one `data:image/png` node |
| Restore, then computed baseline equality | PASS | PASS |

Still unverified and to be confirmed by hand: client-native modal/dialog interaction (the modal check
above only proves layer ordering), paste-level copy output, Codex motion animation with the window
visible, and WorkBuddy scrolling. No new screenshots were taken in this pass, so the privacy-masked
images above remain the only published evidence.

Packaging ran again after the fix: `npm run package:win` exited 0 with every artifact download served
by npmmirror and no `github.com` request. The `release/` installers are unsigned community builds
(`signHook=false cscInfo=null`).
