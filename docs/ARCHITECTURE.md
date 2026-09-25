# Architecture and adapter development

## Choice of framework

PrismDesk uses Electron rather than Tauri for the first release. Both target clients are Chromium/Electron-family applications and the adapter needs CDP, data-URL transfer, DOM lifecycle cleanup, and Windows packaging. TypeScript and Electron keep UI, CDP and renderer payloads in one language and avoid adding a Rust toolchain. The cost is a larger installer; reconsider Tauri only if measured package or memory goals justify a second runtime stack.

## Modules

- `src/renderer`: sandboxed management UI and preview; no Node access.
- `src/main/injection.ts`: generic image/aurora background engine.
- `src/main/adapters.ts`: independent Codex and WorkBuddy discovery/identity rules.
- `src/main/store.ts`: local validated configuration and managed image copies.
- `src/main/cdp.ts`: loopback-only CDP discovery and commands.
- `src/main/pet.ts`: the desktop-pet window, its hit test, drag loop and display-change handling.
- `src/main/pet-state.ts`: `pet.json` reader/writer for the remembered pet position.
- `src/shared/pet.ts`: pure pet geometry and gesture rules, shared by the main process and the pet renderer and covered by `npm test`.
- `src/pet`, `src/preload-pet.ts`: the transparent pet renderer and its narrow two-message IPC bridge.

The preload exposes a narrow IPC API. Background layers use a fixed ID, `pointer-events:none`, an extreme back z-index and transparent native roots. Re-apply invokes the previous cleanup before creating one new node and one animation loop. Cleanup removes only PrismDesk IDs, its resize/visibility listeners, and its animation frame.

## Desktop pet and tray lifecycle

The pet is a separate `BrowserWindow` in its own process tree: 168x168, `frame:false`,
`transparent:true`, `alwaysOnTop`, `skipTaskbar`, `focusable:false`, shown with `showInactive()` so a
click on the character never steals the foreground from the user's work. It loads a self-contained
SVG character, so no third-party artwork or remote asset is involved.

Mouse handling is split between the two processes on purpose:

- The **main process owns the hit test**. Every 32 ms it compares `screen.getCursorScreenPoint()`
  with the window's content bounds and toggles `setIgnoreMouseEvents()` from `isPetHit()`, so the
  transparent margin hands the pointer back to the desktop and only the character silhouette can be
  clicked or grabbed.
- The **renderer classifies the gesture**. A press that travels more than `petDragThreshold` (4 px)
  is a move, never an activation, so dragging the character cannot open the settings window. The
  drag offset is captured where the gesture becomes a move, so the character never jumps.
- The **main process drives the move** by polling the cursor at 16 ms in screen space, which keeps the
  pet under the pointer even when the pointer leaves the small window during a fast drag. Every move
  writes the full intended size with `setBounds()`, because a per-monitor-DPI transparent window
  drifts larger when it is only moved.

The position is stored in `userData/pet.json` (schema-versioned, validated, unknown fields rejected)
on drag end, on display change and synchronously while quitting. `clampToDisplays()` measures the
exact uncovered area of the window against the union of all work areas, so a pet straddling two
displays is left alone while one stranded by a removed or resized display is pulled back inside.

Closing the settings window hides it instead of destroying it, so an unfinished form survives, and
the app keeps running with the tray icon as its only entry point. A `parked` flag makes that state
authoritative: any later minimise or stray show of a parked window is undone, so a window the user
believes is closed can never reappear as a taskbar button. A minimise that arrives within a few
seconds of `show()` is treated as stray (see `docs/TEST_RECORD.md` for the observed desktop
behaviour) and is reverted; a minimise after that is the user's own and is respected.

## Adapter contract

An adapter must: locate a signed/installed executable without editing it; bind to a fixed loopback port; require an app-specific renderer URL hint; reject any non-loopback WebSocket URL; verify basic DOM structure; stop on mismatch; support status/apply/restore; and never log page contents. New versions enter the compatibility table only after real-client apply, interaction checks, and restoration.
