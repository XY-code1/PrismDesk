# Compatibility

| Client | Version observed | Install | Adapter | Status |
|---|---:|---|---|---|
| Codex desktop | 26.917.9434.0 | Microsoft Store package `OpenAI.Codex` | loopback CDP, target URL prefix `app://` | Detected; live apply pending because the active task must not be restarted |
| WorkBuddy | 5.5.3 | per-user Electron install | loopback CDP, `renderer/index.html` target | Windows validation recorded in `docs/TEST_RECORD.md` |

## Known limits

- CDP must be enabled at client launch. PrismDesk refuses to restart an already-running client, because that could interrupt active work.
- A client update may change renderer URLs or layering. The adapter then stops rather than injecting into an unknown target.
- Backgrounds are session-scoped and must be re-applied after a client restart.
- Background pausing uses the renderer `visibilitychange` signal; if a client does not propagate minimization visibility, reliable minimization pause cannot be claimed.
- Codex real-client interaction checks remain unverified until an explicit restart window is available.
