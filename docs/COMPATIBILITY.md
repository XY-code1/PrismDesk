# Compatibility

| Client | Version observed | Install | Adapter | Status |
|---|---:|---|---|---|
| Codex desktop | 26.917.9434.0 | Microsoft Store package `OpenAI.Codex` | loopback CDP, exact main target `app://-/index.html` | Aurora, image, idempotency and restoration verified |
| WorkBuddy | 5.5.3 | per-user Electron install | loopback CDP, `renderer/index.html` target | Windows validation recorded in `docs/TEST_RECORD.md` |

## Known limits

- CDP must be enabled at client launch. PrismDesk refuses to restart an already-running client, because that could interrupt active work.
- A client update may change renderer URLs or layering. The adapter then stops rather than injecting into an unknown target.
- Backgrounds are session-scoped and must be re-applied after a client restart.
- Background pausing uses the renderer `visibilitychange` signal; if a client does not propagate minimization visibility, reliable minimization pause cannot be claimed.
- Text input, copy, scrolling and modal interaction remain manual release-check items for both clients; background nodes are pointer-event transparent but this is not reported as fully verified yet.
