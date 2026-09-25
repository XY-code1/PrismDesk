# PrismDesk

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

PrismDesk is an open-source Windows 11 appearance tool that applies the same local image or original aurora animation independently to Codex desktop and WorkBuddy. It works locally and has no account, cloud service, paid feature, or theme marketplace.

> PrismDesk is an independent community project and is not affiliated with, authorized by, or endorsed by OpenAI or Tencent.

![PrismDesk pet and settings](docs/screenshots/pet-and-settings.png)

## Status

Current version: **`0.1.0-alpha.1`**, targeting Windows 11 x64.

| Client | Tested version | Result |
|---|---:|---|
| Codex desktop | 26.917.9434.0 | Image, aurora, repeated apply, and restore verified |
| WorkBuddy | 5.5.3.0 | Image, aurora, repeated apply, pause, and restore verified |

See [compatibility](docs/COMPATIBILITY.md) and the [test record](docs/TEST_RECORD.md) for exact scope.

## Features

- Detects installation, version, process, connection, and adapter status.
- Imports local PNG/JPEG/WebP files and includes a remote-asset-free Canvas aurora.
- Controls brightness, opacity, blur, speed, and 15/30/60 FPS.
- Applies per client, pauses motion, and restores the default appearance.
- Idempotent injection and cleanup limited to PrismDesk-owned resources.
- Strict declarative theme validation; theme scripts are never executed.
- Local settings and managed asset storage.
- Original transparent Prism desktop pet: click to open, drag to move, click-through transparent pixels, and persisted position.
- System-tray lifecycle when the settings window is closed.

## Security boundary

PrismDesk does not modify installation files, `app.asar`, signatures, or integrity metadata. It connects only to loopback CDP endpoints owned by the expected executable and validates the main renderer: Codex uses `127.0.0.1:9222` with exact target `app://-/index.html`; WorkBuddy uses `127.0.0.1:9223` with `renderer/index.html`. It does not read chat bodies or credentials, and logs do not record page content.

## Requirements and stack

Windows 11 x64, Node.js 22+, Electron 38, TypeScript 5, native HTML/CSS/DOM, esbuild, and electron-builder. React and Vite are not used.

## Develop and package

```powershell
git clone https://github.com/XY-code1/PrismDesk.git
cd PrismDesk
npm install
npm run check
npm test
npm run dev
npm run package:win
```

Packaging retains type-checking, tests, build, NSIS, and portable targets. Outputs are `release/PrismDesk-Setup-0.1.0-alpha.1-x64.exe` and `release/PrismDesk-Portable-0.1.0-alpha.1-x64.exe`. Electron mirrors and retries are configured without changing lockfile versions. `release/` is ignored by Git.

## Use

Open PrismDesk, connect a stopped client, choose Aurora or import an image, adjust parameters, then apply it to either card. If a running client needs CDP, save work and exit it manually first. Codex may also be started with `Start-Codex-for-PrismDesk.cmd`. Restore default removes PrismDesk's session injection.

## Desktop pet

![Prism desktop pet](docs/screenshots/pet-character.png)

Click Prism to open or focus settings, drag to reposition it, and use the tray menu to reopen settings or exit. Position is stored in Electron `userData/pet.json`; transparent pixels pass mouse input through.

## Known limits

Injection is session-scoped. Client updates require revalidation. Text input, code copying, long scrolling, every modal, and clean-machine upgrade/uninstall remain manual release checks. Test builds are not commercially code-signed and currently use Electron's default icon.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Compatibility](docs/COMPATIBILITY.md) · [Tests](docs/TEST_RECORD.md) · [Research](docs/RESEARCH.md) · [Demo](docs/DEMO.md) · [Contributing](CONTRIBUTING.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

## License

Original code is licensed under [MIT](LICENSE). Third-party terms remain under their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
