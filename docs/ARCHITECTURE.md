# Architecture and adapter development

## Choice of framework

PrismDesk uses Electron rather than Tauri for the first release. Both target clients are Chromium/Electron-family applications and the adapter needs CDP, data-URL transfer, DOM lifecycle cleanup, and Windows packaging. TypeScript and Electron keep UI, CDP and renderer payloads in one language and avoid adding a Rust toolchain. The cost is a larger installer; reconsider Tauri only if measured package or memory goals justify a second runtime stack.

## Product shape

The floating pet has two shapes, and the user picks one in the settings window:

- **In-client floating pet (default).** The pet is a small widget injected into the Codex and
  WorkBuddy main renderer pages, so it lives strictly inside the client window. It can be dragged and
  scaled, it remembers one position per client, and a click opens a PrismDesk side panel inside that
  client.
- **Windows desktop pet (optional).** The original separate always-on-top window (`src/main/pet.ts`),
  which floats over the desktop instead of a client window.

The background layer, the in-client pet and the panel are all part of one *apply* per client. Restore
default removes the background, the pet, the panel, their styles and their listeners in one call.

## Modules

- `src/renderer`: sandboxed management UI and preview; no Node access.
- `src/main/injection.ts`: generic image/aurora background engine.
- `src/main/in-app-pet.ts`: builders for the injected pet/panel payload, the periodic sync probe, the
  pet-only removal script and the full restore script.
- `src/main/in-app-state.ts`: `in-app-pet.json` reader/writer for the per-client pet positions.
- `src/shared/in-app-pet.ts`: pure geometry, hit testing, gesture, artwork validation and request
  validation rules. The same functions are pasted into the page payload, so the code covered by
  `npm test` is the code that runs inside the clients (`inlinedRuntime()`, guarded by a test).
- `src/main/adapters.ts`: independent Codex and WorkBuddy discovery/identity rules plus the in-client
  pet control loop.
- `src/main/store.ts`: local validated configuration and managed image copies (background and pet).
- `src/main/cdp.ts`: loopback-only CDP discovery, one-shot `evaluate`/`command`, and the long-lived
  `CdpSession` the control loop keeps open.
- `src/main/pet.ts`: the optional desktop-pet window, its hit test, drag loop and display-change
  handling.
- `src/main/pet-state.ts`: `pet.json` reader/writer for the remembered desktop-pet position.
- `src/shared/pet.ts`: pure desktop-pet geometry and gesture rules.
- `src/pet`, `src/preload-pet.ts`: the transparent desktop-pet renderer and its narrow IPC bridge.

The preload exposes a narrow IPC API. Background layers use a fixed ID, `pointer-events:none`, an extreme back z-index and transparent native roots. Re-apply invokes the previous cleanup before creating one new node and one animation loop. Cleanup removes only PrismDesk IDs, its resize/visibility listeners, and its animation frame.

## In-client floating pet

### One payload, three parts

`buildInAppScript()` writes a single self-contained IIFE into a main renderer page:

1. a page-level `<style id="prismdesk-pet-style">` that pins two full-viewport host elements with
   `!important` and resets inherited geometry (`zoom`, `transform`, `filter`, `visibility`);
2. `#prismdesk-pet-host`: a click-through layer whose shadow root holds the character and the resize
   grip;
3. `#prismdesk-panel-host`: a click-through layer whose shadow root holds the side panel.

Both hosts carry `data-prismdesk-pet="host|panel|style"`. A payload always starts by calling the
previous instance's `destroy()` and by removing every node that carries that marker, so applying four
times in a row still leaves exactly one pet, one panel and one style element. Shadow roots are used
in both directions: client CSS cannot leak into the panel, and the panel cannot leak out.

### Why the pet does not use DOM hit testing

A `<img>` node receives pointer events over its whole box, including fully transparent pixels, so a
DOM-based pet would swallow clicks meant for the page underneath. Instead:

- every node inside the pet layer keeps `pointer-events:none`, and
- the payload hit-tests the pointer itself in a `window` capture listener on `pointerdown`.

The hit test uses the tested pure rules: the built-in character uses its ellipse silhouette, an
imported PNG/WebP/GIF is sampled through a size×size canvas (`drawImage` + a 1-pixel `getImageData`)
so alpha decides, and the mirrored case is undone in `sampleCoords()`. A press that lands outside the
silhouette is not consumed at all and reaches the page unchanged.

### Input safety

While a gesture belongs to the pet, the payload sets a suppression flag and blocks
`mousedown`/`mouseup`/`click`/`dblclick`/`auxclick`/`contextmenu`/`selectstart`/`dragstart` in the
same window-capture listener, clearing the flag on the next press and shortly after the release. That
is what keeps a pet click from moving the caret, from selecting text, or from closing a client popup
through an outside-click handler. `wheel` is never intercepted, so scrolling always reaches the page;
keyboard input is never touched, and the payload adds no listener to any page node at all.
A press that travels past the 5 px threshold is a move and can never become an activation, so dragging
the pet cannot open the panel by accident.

### Panel and request protocol

The panel provides the existing background controls (aurora/image, import, brightness, opacity, blur,
speed, motion, fps, restore default) plus the pet appearance controls (import PNG/WebP/GIF, size,
mirror, show/hide, restore default pet). Sliders preview locally by writing the filter/opacity of the
already-injected background node, and every change is debounced into a `save` request.

A page cannot call the main process, so the main process polls: one `Runtime.evaluate` per client per
900 ms drains `window.__prismdeskInApp.requests`, pushes the current state back, and reports whether an
instance exists. The page only ever puts declarative data in that queue, and main validates all of it
(`parseInAppRequests`, `validateTheme`, `validatePetAppearance`) before it reaches the store. Requests
are `save`, `move`, `resize`, `import-pet`, `import-background`, `restore-pet` and `restore`.
A tick that drained a request stores it and pushes the reconciled state straight back, so a control the
user just released never flashes the value it replaced. While a control is still held - or the pet is
being dragged - the page keeps its own copy of the theme and geometry instead of adopting that push.

### Recovery and cleanup

The same tick is the recovery mechanism: a page that was reloaded, navigated or recreated has no
instance, so the probe returns `present:false` and the full payload is written again on that tick. The
page list is re-read from `/json/list` every tick, so a client that switches pages or adds a renderer
window converges on the same state without a manual re-apply. The pet image data URL is only sent when
it changed, so the steady-state payload stays small.

`buildRemovePetScript()` removes only the pet, the panel, its style and its listeners (used when the
user switches to the Windows desktop pet). `buildRemoveAllScript()` additionally calls the
background's own `__prismdeskCleanup`, removes `#prismdesk-background` and `#prismdesk-style`, and
clears the document marker - that is what "restore default" means, for both the settings window and
the in-client panel.

### Per-client memory

Positions are stored per client in `userData/in-app-pet.json` (`{schemaVersion:1, clients:{codex:{x,y},
workbuddy:{x,y}}}`) with the same strict validation as every other PrismDesk file: unknown fields,
non-integer coordinates and unknown client ids discard the whole file instead of being trusted. The
pet size is part of the theme, because size is a look rather than a placement.

### Artwork

The default character is the same MIT character as the optional desktop pet, embedded as an
`data:image/svg+xml` URL so it needs no third-party asset and no network. Imported artwork is
validated by content and by size before it is copied into `userData/themes/pet-assets/`: the file
signature must match the extension (PNG `89 50 4E 47`, WebP `RIFF…WEBP`, GIF `GIF87a`/`GIF89a`), it
must be at most 4 MB, and PNG/WebP are additionally checked for a real alpha channel. Only the managed
copy is ever transferred, as a `data:` URL, into a `img.src` - never into markup.

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

The desktop pet window is created only when the theme says `petMode: 'desktop'`, and switching back to
`'in-app'` destroys it immediately. Closing the settings window hides it instead of destroying it, so
an unfinished form survives, and the app keeps running with the tray icon as its only entry point. A
`parked` flag makes that state authoritative: any later minimise or stray show of a parked window is
undone, so a window the user believes is closed can never reappear as a taskbar button. A minimise
that arrives within a few seconds of `show()` is treated as stray (see `docs/TEST_RECORD.md` for the
observed desktop behaviour) and is reverted; a minimise after that is the user's own and is respected.

## Adapter contract

An adapter must: locate a signed/installed executable without editing it; bind to a fixed loopback port; require an app-specific renderer URL hint; reject any non-loopback WebSocket URL; verify basic DOM structure; stop on mismatch; support status/apply/restore; and never log page contents. New versions enter the compatibility table only after real-client apply, interaction checks, and restoration.

The in-client pet adds two rules to that contract: status must be honest about whether a pet instance
is currently present (`buildInAppStatusScript`), and apply must be idempotent for the pet and the panel
exactly as it already is for the background layer.

## Phase 2

Wallpaper Engine stays an investigation item; see `docs/RESEARCH-WALLPAPER-ENGINE.md` for the public
integration surfaces, the detectable paths and the explicit non-goals (no Workshop scraping, no
bundled third-party wallpapers).
