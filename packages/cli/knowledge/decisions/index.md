---
type: overview
title: Decisions
description: Rules chosen in the pikku CLI, and what each one rules out
---

# Decisions

A rule that was chosen, and what it rules out.

<!-- pikku:knowledge-index -->
- [A native app belongs to a frontend](a-native-app-belongs-to-a-frontend.md) — `frontends.<name>.native` makes a frontend installable; its Tauri project lives at `<cwd>/src-tauri`, is committed, and holds nothing specific to the machine that generated it
- [Every app command lives under `pikku app`](every-app-command-lives-under-pikku-app.md) — Creating, listing and packaging a frontend are all `pikku app …` subcommands — never `pikku new`, never a flag on `pikku deploy`
- [`frontends` in pikku.config.json is the one list of apps](frontends-is-the-one-list-of-apps.md) — The top-level `frontend` key is gone; every frontend — served by pikku, deployed by Fabric, or packaged as a native app — is a named `frontends` entry in pikku.config.json
- [One identifier per app, on every platform, unique across apps](one-identifier-per-app-on-every-platform.md) — `native.identifier` is the macOS/iOS bundle id and the Android package name at once; it must be Android-safe and no two frontends may share one
- [Pikku owns named files and marked regions of a native project, and nothing else](pikku-owns-marked-regions-of-the-native-project.md) — `src/pikku.rs`, `capabilities/pikku*.json` and the plugin blocks in Cargo.toml are rewritten on every run; everything else in src-tauri/ is written once and then belongs to the user
<!-- /pikku:knowledge-index -->
