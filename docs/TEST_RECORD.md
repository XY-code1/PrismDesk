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
