---
type: decision
title: Pikku owns named files and marked regions of a native project, and nothing else
description: `src/pikku.rs`, `capabilities/pikku*.json` and the plugin blocks in Cargo.toml are rewritten on every run; everything else in src-tauri/ is written once and then belongs to the user
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
| `src/pikku.rs` — `pub fn plugins(builder)`, every plugin initialiser and its `#[cfg]` gate | `src/lib.rs`, `src/main.rs` — call `pikku::plugins(builder)` once |
| `capabilities/pikku.json`, `capabilities/pikku-mobile.json` | any other `capabilities/*.json` — Tauri merges them all |
| the regions between `# pikku:plugins:start` / `# pikku:plugins:end` in `Cargo.toml` | the rest of `Cargo.toml` |
| `identifier`, `productName`, `build.frontendDist`, and in `url` mode `app.windows[main].url`, in `tauri.conf.json` | every other key in `tauri.conf.json` |
| `@tauri-apps/*` entries in the frontend's `package.json` | the rest of `package.json` |
| | icons, `Info.ios.plist` after the first write, `gen/android`, `gen/apple` |

`tauri.conf.json` and `package.json` are JSON, so pikku reads them, sets its own
keys, and writes the rest back untouched. `Cargo.toml` is edited only between
the markers; a `Cargo.toml` whose markers were deleted is reported by
`pikku app native check` and refused by `add`, rather than patched by guessing
where dependencies go.

**What this rules out:** regenerating `lib.rs`, merging user edits into a
generated file, and a `--force` that overwrites the user's half. If pikku needs
to change something the user owns, `check` says what and why, and the user
makes the edit.
