# Compatibility

| Client | Version observed | Install | Adapter | Status |
|---|---:|---|---|---|
| Codex desktop | 26.917.9434.0 | Microsoft Store package `OpenAI.Codex` | loopback CDP, exact main target `app://-/index.html` | Aurora, image, idempotency, restoration and interaction checks verified |
| WorkBuddy | 5.5.3 | per-user Electron install | loopback CDP, `renderer/index.html` target | Windows validation recorded in `docs/TEST_RECORD.md` |

## Interaction safety

The background is one `#prismdesk-background` node rendered at `z-index:-1` with `pointer-events:none`,
and the payload leaves the client's own `#root` stacking untouched, so the layer always paints behind
every client node and cannot cover or intercept input, selection, copy, scroll, popups or shortcuts.
Re-applying invokes the previous cleanup before creating one new node and one animation loop, and
restore removes only PrismDesk nodes, its style element, its listeners and its animation frame. The
first frame is painted synchronously during apply, so the background still appears when PrismDesk
itself was in the foreground at that moment; only the animation loop reacts to `visibilitychange`.

Verified live on 2026-09-26 (details and the full matrix in `docs/TEST_RECORD.md`): layer hit-testing
sweep, composer focus and typing, selection plus Ctrl+C, re-apply, kind switching, motion advance
(Codex), pause while the client is hidden, restore, and the post-restart state in both clients.

## Known limits

- CDP must be enabled at client launch. PrismDesk refuses to restart an already-running client, because that could interrupt active work.
- A client update may change renderer URLs or layering. The adapter then stops rather than injecting into an unknown target.
- Backgrounds are session-scoped and must be re-applied after a client restart.
- Background pausing uses the renderer `visibilitychange` signal; if a client does not propagate minimization visibility, reliable minimization pause cannot be claimed.
- Wheel-driven scrolling and client-native modal/window-manager behaviour still need a manual pass on an interactive desktop; hit testing, pointer-event transparency and programmatic scrolling are verified.
