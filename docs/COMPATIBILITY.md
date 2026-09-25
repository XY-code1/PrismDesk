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

## Desktop pet — verified 2026-09-26

Windows 11, single display 2560x1600 at 150% scaling (Electron DIP 1707x1067, work area 1707x1019).

The pet window is created at the remembered position (`userData/pet.json`) and clamped into the
visible work area. Verified on the running build: 168x168 DIP window, transparent, always-on-top,
`skipTaskbar`, click-through while the cursor is off the character and interactive while it is on it,
drag ends with the position persisted and the window still at 168 DIP, character click opens and
focuses the settings window, closing the settings window parks it hidden while the pet stays on the
desktop, and a relaunch restores the stored position. Details in `docs/TEST_RECORD.md`.

Two environment-specific behaviours are worth knowing on this desktop:

- A freshly shown window can be minimised about two seconds after `show()` by something outside
  PrismDesk; it reproduces with a bare Electron window that has no PrismDesk code. The settings window
  reverts such a stray minimise, and a hidden parked window is always re-hidden, so the user never
  sees the settings window vanish into the taskbar.
- The tray icon was located through UI Automation in the Windows 11 notification-area flyout
  (`PrismDesk 桌宠`, 60x60 next to the taskbar), but that flyout is a XAML island that ignores
  synthetic right-clicks, so the two menu items themselves have to be clicked by hand. The icon's
  menu is built from the two labels in `src/main/main.ts`, and the pet window is not listed as a
  taskbar button (`skipTaskbar`).

## Known limits

- CDP must be enabled at client launch. PrismDesk refuses to restart an already-running client, because that could interrupt active work.
- A client update may change renderer URLs or layering. The adapter then stops rather than injecting into an unknown target.
- Backgrounds are session-scoped and must be re-applied after a client restart.
- Background pausing uses the renderer `visibilitychange` signal; if a client does not propagate minimization visibility, reliable minimization pause cannot be claimed.
- Wheel-driven scrolling and client-native modal/window-manager behaviour still need a manual pass on an interactive desktop; hit testing, pointer-event transparency and programmatic scrolling are verified.
