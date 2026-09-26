# Wallpaper Engine integration research (phase 2)

Status: **investigation only**. No Wallpaper Engine code ships in this branch, no Workshop content is
read, copied, repacked or committed, and PrismDesk does not download anything from Steam.

Scope of this document: what Wallpaper Engine (Steam app `431960`) publicly exposes, which install
paths and registry keys can be detected locally, and which integration ideas are feasible for a later
phase. Everything below was gathered from local files and the vendor's public documentation; nothing
was installed, launched or modified while writing it.

## What this phase explicitly does not do

- No reading, copying or repacking of Steam Workshop items (`steamapps/workshop/content/431960/**`).
  Those files belong to their authors and are covered by Steam's and the authors' terms.
- No bundling of third-party wallpapers, thumbnails or previews into this repository or into any
  installer.
- No assumption that a user owns Wallpaper Engine: it stays an optional, user-supplied component.

## Feasibility of the ideas that were considered

| Idea | Public surface | Feasible? | Assessment |
|---|---|---|---|
| Detect that Wallpaper Engine is installed | Steam registry + Steam library manifests (see below) | Yes | Pure metadata: a registry read and one text file per Steam library. Lowest risk, no dependency on undocumented behaviour. |
| Detect that it is currently running | `Get-Process` on the vendor executable names | Yes | Used only to mirror the client cards' existing status logic. |
| Pause / play the active wallpaper from PrismDesk | Command line `-control pause`, `-control play`, `-control stop` | Probably | Community-documented, version-dependent, and it fights with Wallpaper Engine's own settings (the app restores its own state on resume). Would need an explicit opt-in per user and a documented version matrix before it could ship. |
| Render the user's own wallpaper inside the Codex / WorkBuddy window | `-control openWallpaper -file <path> -playInWindow <window title>` | Not planned | Undocumented, fragile across versions, and it takes over the desktop wallpaper state of the machine. It would also mean PrismDesk drives a third-party process with a path the user must own. |
| Use a Workshop wallpaper as a PrismDesk background image | Works only by reading `workshop/content/431960/<id>` | No | Directly against the non-goals above. Rejected. |
| Call a documented API / SDK from PrismDesk | None exists | No | Wallpaper Engine publishes authoring documentation (the web wallpaper API is for wallpapers, not for host applications) but no embedding API, no IPC channel, and no plugin API for other apps. |
| "Wallpaper Engine Web" (`wallpaperweb`) export used as a plain image/video | Vendor export feature, user-initiated | Maybe later | If a user exports their own wallpaper to a video/image file and imports it through the existing local image import, no new integration is needed at all - this is the recommended path today. |

## Detectable paths and keys (read-only)

Verified on the development machine while writing this document (Steam present, Wallpaper Engine not
installed). The commands below are exactly the ones used:

```powershell
(Get-ItemProperty 'HKCU:\Software\Valve\Steam').SteamPath        # -> d:/steam           (verified)
Get-Content 'D:\steam\steamapps\libraryfolders.vdf'              # -> one library: D:\steam (verified)
Test-Path 'D:\steam\steamapps\common\wallpaper_engine'           # -> False              (verified)
Test-Path 'D:\steam\steamapps\workshop\content\431960'           # -> False              (verified)
Test-Path "$env:APPDATA\Wallpaper Engine"                        # -> False              (verified)
```

| Candidate | Path / key | Notes |
|---|---|---|
| Steam root | `HKCU\Software\Valve\Steam\SteamPath` | Present on this machine; the only reliable starting point for library discovery. |
| Extra Steam libraries | `<steam>/steamapps/libraryfolders.vdf` | Plain text with a `path` field per library; must be enumerated, because the install can live in any library. |
| Wallpaper Engine install | `<library>/steamapps/common/wallpaper_engine` | Not present here. Expected contents: `wallpaper32.exe`, `wallpaper64.exe`, `config/`, `projects/`. |
| Wallpaper Engine app manifest | `<library>/steamapps/appmanifest_431960.acf` | Same metadata role as any Steam app manifest. |
| Workshop content (do not read) | `<library>/steamapps/workshop/content/431960/<publishedFileId>/` | Out of scope by design; listed here only so a future implementation knows what *not* to touch. |
| Per-user data | `%APPDATA%\Wallpaper Engine` | Not present here. Holds the user's own configuration; if a future phase needed the currently selected wallpaper, this is where the user's own selection lives. |

## Decision and phase-2 checklist

Phase 2 starts only if the in-client pet and background work is stable. When it does, the checklist
is:

1. Record the Wallpaper Engine version and the exact executable names from a real installation
   (the `wallpaper_engine` folder listing above is the expected shape, not yet an observation).
2. Test `-control pause`, `-control play`, `-control stop` against that version, including the case
   where the user has "pause on fullscreen" or a performance profile enabled, and record whether the
   wallpaper resumes by itself.
3. Confirm with the vendor documentation and the Steam Subscriber Agreement whether a read-only
   "which wallpaper is selected" detection is acceptable; keep the answer in this file.
4. Implement detection first (registry + library manifest + process), and expose it as a status line
   only. Any control feature must be opt-in, reversible, and must never be required for PrismDesk's
   own features to work.
5. Do not add Workshop paths to any code path that copies, packages or uploads files.

Recommended interim answer for users today: export your own wallpaper from Wallpaper Engine to a
video or image file and import that file as a PrismDesk background. It needs no integration, touches
no third-party content, and stays inside the existing local-only model.