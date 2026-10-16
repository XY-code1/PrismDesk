# Compatibility

| Client | Version observed | Install | Adapter | Status |
|---|---:|---|---|---|
| Codex desktop | 26.917.9434.0 | Microsoft Store package `OpenAI.Codex` | loopback CDP, exact main target `app://-/index.html` | Aurora, image, idempotency, restoration and interaction checks verified for the background layer; in-client pet automated suite passes (58/58), the remaining real-client matrix is pending (see `docs/TEST_RECORD.md`) |
| WorkBuddy | 5.5.3 | per-user Electron install | loopback CDP, `renderer/index.html` target | Windows validation recorded in `docs/TEST_RECORD.md`; one live in-client pet run also recorded |

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
| Scale | bottom-right corner grip, capped at 18 px and a third of the character, 40–160 px, reported to main on release | unit test |
| Per-client position memory | `userData/in-app-pet.json` | unit test |
| Single click opens / closes the side panel | toggle on a press under the 5 px drag threshold | unit test |
| Transparent pixels do not intercept the page | the built-in character is clipped to the same ellipse the hit test uses; imported artwork is alpha-sampled | unit test |
| Input, copy, scroll, popups, selection unaffected | window-capture suppression of mouse events only while the pet owns the gesture; a wheel over the character is forwarded to the scroll container underneath; keyboard never touched | unit test + manual matrix |
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

The in-client pet adds a second, independent layer at a high `z-index`. Only the character itself takes
the pointer: the artwork is a real hit target (`pointer-events:auto`) clipped to the same silhouette the
pure hit test uses (`clip-path` - an ellipse for the built-in character, the whole box for imported
artwork), and it carries `-webkit-app-region:no-drag`. A fully click-through layer was not an option:
these clients put their own chrome behind the pet and that chrome is often an OS window-drag region, so
a press that fell through could start a window drag before the payload ever saw a move. During a pet
gesture PrismDesk blocks the mouse events that would otherwise reach the page, and it clears that block
on the next press and shortly after the release. A wheel that lands on the character is forwarded to the
nearest scrollable ancestor underneath it, so the pet is not a dead spot for scrolling; typing,
shortcuts and paste are never on that path.

Verified live for the background layer on 2026-09-26 and for the injected pet payload in WorkBuddy
5.5.3.0 on 2026-09-27 (details and the full matrix in `docs/TEST_RECORD.md`). In that pet run the
payload was present, exactly one pet/panel/style existed, the pet was painted at 48 px and was a real
hit target; the interaction rows of the matrix were not completed and must be executed on a desktop
session with the clients running.

## Known limits

- CDP must be enabled at client launch. PrismDesk refuses to restart an already-running client, because that could interrupt active work.
- A client update may change renderer URLs or layering. The adapter then stops rather than injecting into an unknown target.
- Backgrounds, the in-client pet and its panel are session-scoped. When a client is started with its CDP port, PrismDesk re-injects about five seconds after the client reappears and restores the remembered position; otherwise press Apply again.
- The in-client pet cannot leave the client window, by design. Use the optional desktop pet mode when the pet should float over the desktop.
- The pet position is remembered per client, but the size, mirror and visibility settings are shared by both clients.
- An imported GIF keeps animating inside the client: the page pause switch governs the background, the built-in character and the panel, not the frames of a third-party animated image.
- Background pausing uses the renderer `visibilitychange` signal; if a client does not propagate minimization visibility, reliable minimization pause cannot be claimed.
- Wallpaper Engine integration is phase 2 and investigation-only; see `docs/RESEARCH-WALLPAPER-ENGINE.md`.
- The Windows packages are unsigned community builds.
