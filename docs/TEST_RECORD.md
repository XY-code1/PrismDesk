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

## Blocking-issue fix - 2026-09-26 (0.1.0-alpha.1 development build)

Reported blockers: in Codex the chat input was reported unusable after applying a background, and in
WorkBuddy re-apply, kind switching and restore-default behaved abnormally. Both clients were exercised
live before and after the change. No installer was produced from this change.

### Reproduction

Codex desktop `26.917.9434.0` (Store package, loopback CDP 9222, main target `app://-/index.html`; the
avatar window `app://-/index.html?initialRoute=%2Favatar-overlay` is a second page target and is
excluded by the exact-URL rule):

- The delivered payload (layer at `z-index:0`, plus `#root{position:relative;z-index:1}`) **painted
  nothing when the client window was hidden/occluded at apply time**. `draw()` returned immediately on
  `document.hidden` without rescheduling, and the `motion:false` branch skipped its single frame for
  the same reason, so a capture taken right after apply showed an empty background while a later
  capture showed the aurora.
- The canvas backing store used `innerWidth/devicePixelRatio`: 854x544 for a 1280x816 viewport at
  DPR 1.5, i.e. an undersized, soft background.
- An input-blocking mechanism could **not** be reproduced: the 49-point `elementFromPoint` sweep was
  identical before and after apply, the composer centre hit tested to `.ProseMirror`, click-to-focus,
  an 8-character `Input.insertText` and clearing all succeeded, and Ctrl+C produced the expected copy
  event. The one structural change the old payload made to the host app was forcing `#root` to
  `position:relative;z-index:1`, which turns the client root into a stacking context and can trap
  app-owned overlays and popups - a hard requirement here - so it was removed rather than left
  unproven.

WorkBuddy `5.5.3.0` (per-user install, loopback CDP 9223, `renderer/index.html`):

- The delivered CSS used `[data-view-id]`, `[data-view-id=sidebar]`, `[data-view-id=detail-panel]` and
  `[data-view-id=main-content]`. In WorkBuddy those attributes are **not** layout landmarks: they match
  four unrelated home-grid cards (`_gridViewItem_1ens7_14`), so applying a background restyled app cards
  with `backdrop-filter:blur(18px)`, a `color-mix` background and a `linear-gradient`. The effect
  appeared and disappeared as the user switched routes; this is the reproduced switching anomaly.
- Layer counts, `#root` state, cleanup handlers and the restored `.teams-container` background were
  already correct across apply/re-apply/switch/restore, so no idempotency defect was found.
- The status pill can lag one action behind because a single status call takes about 3.5 s per client
  (each call spawns several PowerShell processes). Observed, not a correctness defect.

### Change

- `src/main/injection.ts`: the layer is now `z-index:-1` with `pointer-events:none`, and the payload no
  longer touches the client's `#root` stacking, so the layer is behind every client node and cannot
  cover or intercept input, selection, copy, scroll, popups or shortcuts.
- The first frame is painted synchronously during apply, before any visibility test, so the background
  appears even when PrismDesk's own window was in front during apply. `document.hidden` now only pauses
  the animation loop, and `visibilitychange` repaints and resumes it.
- The canvas backing store is `innerWidth x devicePixelRatio` (clamped 1..4), so scaled displays get a
  correctly sized background.
- The coincidental `[data-view-id]` rules were dropped; only selectors verified on real client nodes
  remain.
- `statusScript` reports a painted flag (sampled canvas alpha), so an applied-but-never-painted layer is
  detectable, and cleanup uses `querySelectorAll('#prismdesk-...')`.

### Automated

```text
npm run check  -> PASS
npm test       -> PASS (13/13, 6 new regression assertions)
npm run build  -> PASS
```

The new assertions lock in: layer behind everything with no `#root` mutation, a synchronous first paint
for both `motion` values, a DPR-sized canvas, no `[data-view-id]` selectors, a data-URL-only image
payload, and the painted status field.

### Real-client matrix after the change

| Check | Codex 26.917.9434.0 | WorkBuddy 5.5.3.0 |
|---|---|---|
| Apply aurora, motion on | PASS - 1 layer/1 style, `painted:true` | PASS - 1/1, `painted:true` |
| Re-apply | PASS - still exactly 1/1/1 | PASS - 1/1/1 |
| Switch to image | PASS - 1 layer/1 img/0 canvas | PASS - 1 layer/1 img/0 canvas |
| Pause (motion off) | PASS - one static frame painted | PASS - one static frame painted |
| Restore default | PASS - 0 layers/0 styles, `#root` untouched | PASS - 0/0, `.teams-container` back to `rgb(242,242,242)` |
| After client restart | PASS - connected and not applied; a plain restart reports `needs_restart` | PASS - connected and not applied |
| Layer hit-testing | PASS - 49-point sweep identical to the pre-apply baseline | PASS - identical |
| Composer | PASS - click focuses `.ProseMirror`, 8-char insert, then cleared | PASS - click focuses `_editable_*`, insert, then cleared |
| Selection + Ctrl+C | PASS - 8-char selection, copy event fired with matching text | PASS - 8-char selection, copy event fired |
| Scroll | container hit tests to an app node and scrolls programmatically (0 -> 240 px) | container hit tests to `_title_914ll_23` and scrolls to its 158 px maximum |
| Motion animation | PASS - canvas pixels changed over 1.3 s with the window visible | NOT VERIFIED - no compositor frames while occluded |
| Paused while hidden | PASS - frames static, CPU at baseline | PASS - frames static |
| Unintended client styling | PASS - no `[data-view-id]` matches remain | PASS - `_gridViewItem_*` cards keep `backdrop-filter:none` |
| PrismDesk UI path | PASS - refresh, apply and restore each reported success in the UI | PASS - same |

### Not verified / limits of this pass

- Wheel events delivered through CDP were only acknowledged while a client window was visible; in the
  occluded state no compositor frames were produced and the dispatch timed out, so wheel-driven
  scrolling is still unconfirmed. Hit testing, pointer-event transparency and programmatic scrolling
  were confirmed instead.
- WorkBuddy produced no compositor frames while occluded, so no WorkBuddy screenshot or canvas
  time-series could be captured in this pass; its layer was verified with DOM/state probes and the
  painted flag. The privacy-masked screenshots above remain the only published images.
- Real keyboard and IME typing could not be exercised on the client windows because this session has no
  interactive desktop; text was injected through `Input.insertText` and key events were confirmed to
  reach the page.
- Codex CPU cost could not be attributed to the layer: the app's own start-up load dominated the
  sampling window and the window was hidden (animation paused) for most of it.
- Client-native modal and window-manager behaviour still needs a manual pass on an interactive desktop.
