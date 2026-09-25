# Architecture and adapter development

## Choice of framework

PrismDesk uses Electron rather than Tauri for the first release. Both target clients are Chromium/Electron-family applications and the adapter needs CDP, data-URL transfer, DOM lifecycle cleanup, and Windows packaging. TypeScript and Electron keep UI, CDP and renderer payloads in one language and avoid adding a Rust toolchain. The cost is a larger installer; reconsider Tauri only if measured package or memory goals justify a second runtime stack.

## Modules

- `src/renderer`: sandboxed management UI and preview; no Node access.
- `src/main/injection.ts`: generic image/aurora background engine.
- `src/main/adapters.ts`: independent Codex and WorkBuddy discovery/identity rules.
- `src/main/store.ts`: local validated configuration and managed image copies.
- `src/main/cdp.ts`: loopback-only CDP discovery and commands.

The preload exposes a narrow IPC API. Background layers use a fixed ID, `pointer-events:none`, an extreme back z-index and transparent native roots. Re-apply invokes the previous cleanup before creating one new node and one animation loop. Cleanup removes only PrismDesk IDs, its resize/visibility listeners, and its animation frame.

## Adapter contract

An adapter must: locate a signed/installed executable without editing it; bind to a fixed loopback port; require an app-specific renderer URL hint; reject any non-loopback WebSocket URL; verify basic DOM structure; stop on mismatch; support status/apply/restore; and never log page contents. New versions enter the compatibility table only after real-client apply, interaction checks, and restoration.
