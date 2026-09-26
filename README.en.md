# PrismDesk

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

PrismDesk is an open-source Windows 11 appearance tool that applies the same local image or original aurora animation independently to Codex desktop and WorkBuddy, and injects one original pet inside the client window. Everything runs locally: no account, cloud service, paid feature, or theme marketplace.

> PrismDesk is an independent community project and is not affiliated with, authorized by, or endorsed by OpenAI or Tencent.

![PrismDesk pet and settings](docs/screenshots/pet-and-settings.png)

## Status

Current version: **`0.1.0-alpha.1`**, targeting Windows 11 x64.

| Client | Tested version | Result |
|---|---:|---|
| Codex desktop | 26.917.9434.0 | Image, aurora, repeated apply, and restore verified |
| WorkBuddy | 5.5.3.0 | Image, aurora, repeated apply, pause, and restore verified |

The in-client floating pet passes the automated suite (49/49). Its manual matrix in the [test record](docs/TEST_RECORD.md) still has to be executed on a real desktop before that mode may be called verified there. Exact scope and open items are in the [compatibility list](docs/COMPATIBILITY.md).

## Features

- Detects installation, version, process, connection, and adapter status for Codex and WorkBuddy.
- Imports local PNG/JPEG/WebP files and includes a remote-asset-free Canvas aurora.
- Controls brightness, opacity, blur, speed, and 15/30/60 FPS.
- Applies the same theme per client, pauses motion, and restores the default appearance.
- **In-client floating pet (default)**: injects one original pet into the Codex and WorkBuddy main renderers. It can only exist inside the client window, can be dragged and scaled, and remembers one position per client.
- A single click opens the PrismDesk side panel inside that client, and a second click closes it. The panel carries the background, the parameters, the motion pause, and the pet appearance.
- The pet appearance accepts a transparent PNG, WebP, or GIF, with size, horizontal mirror, show/hide, and restore default. Artwork is stored on this machine only.
- Transparent pixels never intercept the page: only the opaque character silhouette receives the pointer, so scrolling, typing, copying, selection, and popups are unaffected.
- Idempotent injection: applying again never stacks a second pet, panel, background node, or loop, and a page switch or reload restores the pet automatically.
- **Windows desktop pet (optional)**: the original always-on-top transparent window, switchable from settings.
- Restore default removes the injected pet, panel, background, styles, and listeners in one step.
- Strict declarative theme validation; theme scripts are never executed; settings and assets stay local.
- The settings window parks in the system tray when closed, and can be reopened or fully exited.

## How it works and the security boundary

PrismDesk does not modify installation files, `app.asar`, signatures, or integrity metadata. An adapter connects only to the loopback CDP port owned by the expected client and validates its dedicated main renderer:

- Codex: `127.0.0.1:9222`, exact target `app://-/index.html`.
- WorkBuddy: `127.0.0.1:9223`, target containing `renderer/index.html`.

The pet and the panel live in the client renderer process as two host elements with fixed ids and two shadow roots; they never register a listener on a page node. PrismDesk hit-tests the transparent area itself, which is what leaves the page's own scrolling, typing, and popups alone. The injected page's request queue is drained by the main process every 900 ms, and every entry passes the same strict validation as the configuration file.

When a client is running without CDP, PrismDesk never restarts it, so an ongoing task is not interrupted. Connecting and diagnosing never read chat bodies or account credentials, and logs do not record page content.

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

Packaging runs type-checking, tests, build, NSIS, and portable targets in that order. Outputs are `release/PrismDesk-Setup-0.1.0-alpha.1-x64.exe` and `release/PrismDesk-Portable-0.1.0-alpha.1-x64.exe`. Electron mirrors and retries are configured without changing lockfile versions, and `release/` is ignored by Git.

## Use

1. Start PrismDesk and read the detection status of both clients.
2. If a target client is not running, press 连接 (Connect).
3. If it runs but asks for a restart, save your work, exit the client manually, then press 连接 again. Codex can also be started with `Start-Codex-for-PrismDesk.cmd`.
4. Choose 极光 (aurora) or import a local image, adjust the parameters, then press 应用 (Apply) on the client card. Apply injects the background, the floating pet, and the side panel together.
5. In 宠物形态 (pet form) choose 客户端内悬浮宠物 (in-client) or Windows 桌面宠物 (desktop); the desktop form removes the injected pet and panel and shows the separate window instead.
6. Press 恢复默认 (Restore default) to clean up the current PrismDesk injection.

## Pet forms

![Prism pet](docs/screenshots/pet-character.png)

**In-client floating pet (default)**

- The pet is a widget inside the client window: it never leaves the window and never becomes a separate window or taskbar button.
- Drag the character to move it and drag the bottom-right grip to scale it (48-256 px). The position is stored per client in Electron `userData/in-app-pet.json`.
- A single click opens the PrismDesk side panel and a second click closes it; the panel tunes the background and the parameters, pauses motion, and imports pet artwork.
- Only the opaque pixels of the character receive the pointer; everything else is click-through, and the pet's own gestures never reach the page.
- Pet artwork accepts a transparent PNG, WebP, or GIF (up to 4 MB per file, validated by content) and is copied into `userData/themes/pet-assets` for local use only.

**Windows desktop pet (optional)**

- A separate always-on-top transparent window that can float anywhere on the desktop; its position is stored in `userData/pet.json`.
- Click Prism to open or focus the settings window; transparent pixels pass the mouse through, and the pet is pulled back into view when the displays change.

Both forms share one theme. Closing the settings window only hides it; choose 退出 PrismDesk (Exit) in the tray menu to quit.

## Configuration and uninstall

The theme lives in Electron `userData/themes/config.json`, imported backgrounds are copied into `assets/` next to it, and pet artwork into `pet-assets/`. Run Restore default for every connected client before uninstalling. To drop the retained configuration, delete `%APPDATA%\PrismDesk`.

## Known limits

- The background and the in-client pet are session-scoped; a client restart requires applying again.
- A client update can change the DOM; PrismDesk stops adapting unknown structures instead of injecting blindly.
- Typing, code copying, long scrolling, every modal, and upgrade/uninstall on a clean machine remain manual release checks; the matrix is in the test record.
- The pet size, mirror, and visibility are shared by both clients; only the position is remembered per client.
- A GIF imported in a client keeps playing: the motion pause applies to the background, the built-in character, and the panel, not to third-party animated frames.
- Wallpaper Engine is phase two: only the study of its public integration surface and detectable paths exists so far, see [the research note](docs/RESEARCH-WALLPAPER-ENGINE.md). PrismDesk does not scrape Steam Workshop resources and never bundles someone else's wallpaper.
- Test builds are not commercially code-signed and currently use Electron's default icon.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Compatibility](docs/COMPATIBILITY.md) · [Tests](docs/TEST_RECORD.md) · [Adapter research](docs/RESEARCH.md) · [Wallpaper Engine study](docs/RESEARCH-WALLPAPER-ENGINE.md) · [Demo](docs/DEMO.md) · [Contributing](CONTRIBUTING.md) · [Third-party notices](THIRD_PARTY_NOTICES.md)

## Languages and contributions

The README is available in Simplified Chinese, English, Japanese, Korean, and Spanish. Translations must follow the actual features and must not describe unverified compatibility as supported. Corrections and new languages are welcome through [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Original code is licensed under [MIT](LICENSE). Third-party terms remain under their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).