# PrismDesk

PrismDesk is an open-source Windows 11 background manager for applying one local image or an original Canvas aurora to Codex desktop and WorkBuddy independently. It is an independent community project, not affiliated with or endorsed by OpenAI or Tencent.

## Highlights

- Detects installation, version, process, connection, application, and incompatibility state.
- Imports local PNG/JPEG/WebP files; includes a remote-asset-free aurora.
- Brightness, opacity, blur, speed, 15/30/60 FPS, and motion controls.
- Idempotent per-client apply and PrismDesk-scoped restoration.
- Declarative, validated theme JSON only; theme scripts are never executed.

## Develop and package

```powershell
npm install
npm test
npm run dev
npm run package:win
```

Installers are written to `release/`. See [README.md](README.md) for full Chinese usage instructions, [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md) for verified support, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for adapter development.

Original PrismDesk code is MIT licensed. Third-party terms are listed in `THIRD_PARTY_NOTICES.md`.
