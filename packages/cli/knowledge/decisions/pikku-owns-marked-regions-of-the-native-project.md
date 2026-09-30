---
type: decision
title: Pikku owns named files and marked regions of a native project, and nothing else
description: `src/pikku.rs`, `capabilities/pikku*.json`, the two marked plugin blocks in Cargo.toml and four tauri.conf.json keys are rewritten on every run; everything else in src-tauri/ is written once and then belongs to the user
tags: [native, tauri, codegen]
---

# Pikku owns named files and marked regions of a native project

The native project is committed and edited by people (see
[a native app belongs to a frontend](a-native-app-belongs-to-a-frontend.md)),
but `pikku app native add` still has to be able to add a plugin to it a month
later. Those two needs collide in any file both sides write.

The first generator solved it by hashing what it wrote and skipping any file
that no longer matched. That is safe and useless: once someone touched
`lib.rs`, adding a plugin could no longer initialise it.

So the project is split, and pikku and the user never write the same bytes:

| Pikku rewrites every run | The user owns after the first write |
| --- | --- |
| `src/pikku.rs` — `pub fn plugins(builder)`, every plugin initialiser, mobile-only ones behind `#[cfg(mobile)]`, and the shell plugin when the server is bundled | `src/lib.rs`, `src/main.rs` — `mod pikku;` and one call to `pikku::plugins(builder)` |
| `capabilities/pikku.json`; `capabilities/pikku-mobile.json` while a mobile-only plugin is configured (deleted with the last one) | any other `capabilities/*.json` — Tauri merges them all |
| two regions of `Cargo.toml`: `# pikku:plugins:start` … `end` under `[dependencies]`, and `# pikku:mobile-plugins:start` … `end` under the Android/iOS `[target.…dependencies]` table | the rest of `Cargo.toml` |
| `identifier`, `productName`, `build.frontendDist` and `bundle.externalBin` in `tauri.conf.json` | every other key in `tauri.conf.json`, the window list included |
| `ui/index.html`, the placeholder page, only when the server is bundled | |
| `@tauri-apps/*` entries in the frontend's `package.json` — added when missing, an existing version left alone | the rest of `package.json` |
| | icons, `Info.ios.plist` after the first write, `.gitignore`, `gen/android`, `gen/apple` |

`tauri.conf.json` and `package.json` are JSON, so pikku reads them, sets its own
keys, and writes the rest back untouched.

`build.frontendDist` carries all three modes. Bundled, it is the relative path
to the frontend's `dist`. In `url` mode it *is* the URL — Tauri 2 accepts one
there and loads it as the window's content, so pikku never needs to own a key in
the window list. With the server bundled it is `ui`, the placeholder page the
window shows until the sidecar reports its port.

Mobile-only plugins get their own region because a plain dependency on, say,
`tauri-plugin-biometric` breaks every desktop build of the same crate; the
target-gated table is the only place Cargo lets it sit. `Cargo.toml` is edited only between
the markers; a `Cargo.toml` whose markers were deleted is reported by
`pikku app native check` and refused by `add`, rather than patched by guessing
where dependencies go.

**What this rules out:** regenerating `lib.rs`, merging user edits into a
generated file, and a `--force` that overwrites the user's half. If pikku needs
to change something the user owns, `check` says what and why, and the user
makes the edit.
