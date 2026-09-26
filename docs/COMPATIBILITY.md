# Compatibility

| Client | Version observed | Install | Adapter | Status |
|---|---:|---|---|---|
| Codex desktop | 26.917.9434.0 | Microsoft Store package `OpenAI.Codex` | loopback CDP, exact main target `app://-/index.html` | Aurora, image, idempotency, restoration and interaction checks verified for the background layer; in-client pet automated checks pass, real-client pass pending (see `docs/TEST_RECORD.md`) |
| WorkBuddy | 5.5.3 | per-user Electron install | loopback CDP, `renderer/index.html` target | Windows validation recorded in `docs/TEST_RECORD.md` |

## Product shape

Two pet modes share one saved theme:

| Mode | Where the pet lives | Default |
|---|---|---|
| In-client floating pet | Injected into the Codex / WorkBuddy main renderer, strictly inside the client window | Yes |
| Windows desktop pet | Separate always-on-top transparent window over the desktop | Optional |

Applying a theme injects the background, the pet and the side panel for that client. Switching to the
desktop pet removes the injected pet and panel from the clients and shows the desktop window instead.
Restore default removes the background, the pet, the panel, their styles and their listeners in one
call.

## In-client pet features

| Feature | Implementation | Covered by |
|---|---|---|
| Drag inside the client window | pointer capture in the page, clamped to the viewport | unit test (fake DOM) |
| Scale | 18 px corner grip, 48–256 px, reported to main on release | unit test |
| Per-client position memory | `userData/in-app-pet.json` | unit test |
| Single click opens / closes the side panel | toggle on a press under the 5 px drag threshold | unit test |
| Transparent pixels do not intercept the page | alpha sampling of the artwork, ellipse for the built-in character | unit test |
| Input, copy, scroll, popups, selection unaffected | window-capture suppression of mouse events only while the pet owns the gesture; `wheel` and keyboard never touched | unit test + manual matrix |
| Import PNG / WebP / GIF | signature + size + alpha check, copied into `themes/pet-assets` | unit test |
| Size, mirror, show/hide, restore default pet | stored in the theme, applied live | unit test |
| Idempotent re-apply, recovery after reload | payload destroys and rebuilds itself; the control loop re-injects a page that lost its instance | unit test |
| One pet and one panel per page | marker-scoped cleanup before every injection | unit test |

## Interaction safety

The background is one `#prismdesk-background` node rendered at `z-index:-1` with `pointer-events:none`,
and the payload leaves the client's own `#root` stacking untouched, so the layer always paints behind
every client node and cannot cover or intercept input, selection, copy, scroll, popups or shortcuts.
Re-applying invokes the previous cleanup before creating one new node and one animation loop, and
restore removes only PrismDesk nodes, its style element, its listeners and its animation frame. The
first frame is painted synchronously during apply, so the background still appears when PrismDesk
itself was in the foreground at that moment; only the animation loop reacts to `visibilitychange`.

The in-client pet adds a second, independent layer at a high `z-index`. It is click-through at the DOM
level (`pointer-events:none` everywhere, including the artwork), so the only thing that can consume an
event is the payload's own window-capture listener, and only when the pointer is over an opaque pixel
of the character or over the resize grip. During such a gesture PrismDesk blocks the mouse events that
would otherwise reach the page, and it clears that block on the next press and shortly after the
release. Scrolling, typing, shortcuts and paste are never on that path.

Verified live for the background layer on 2026-09-26 (details and the full matrix in
`docs/TEST_RECORD.md`). The in-client pet is covered by the automated suite; the equivalent manual
matrix for both clients is recorded in `docs/TEST_RECORD.md` and must be executed on a desktop session
with the clients running.

## Known limits

- CDP must be enabled at client launch. PrismDesk refuses to restart an already-running client, because that could interrupt active work.
- A client update may change renderer URLs or layering. The adapter then stops rather than injecting into an unknown target.
- Backgrounds, the in-client pet and its panel are session-scoped and must be re-applied after a client restart.
- The in-client pet cannot leave the client window, by design. Use the optional desktop pet mode when the pet should float over the desktop.
- The pet position is remembered per client, but the size, mirror and visibility settings are shared by both clients.
- An imported GIF keeps animating inside the client: the page pause switch governs the background, the built-in character and the panel, not the frames of a third-party animated image.
- Background pausing uses the renderer `visibilitychange` signal; if a client does not propagate minimization visibility, reliable minimization pause cannot be claimed.
- Wallpaper Engine integration is phase 2 and investigation-only; see `docs/RESEARCH-WALLPAPER-ENGINE.md`.
- The Windows packages are unsigned community builds.