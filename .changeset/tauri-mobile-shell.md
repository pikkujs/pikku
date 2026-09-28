---
'@pikku/deploy-standalone': patch
---

The Tauri shell is a library crate a mobile build can link (`[lib]` target, program in `lib.rs`, single-instance gated to desktop), and takes a `desktopNative` list of Tauri's own plugins — crates, initialisers, per-origin capability grants and iOS consent strings generated together.
