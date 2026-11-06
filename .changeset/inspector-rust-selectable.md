---
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/code-edit': patch
---

The Rust inspector (`pikku-inspect-rs`) can now be selected beside the Go one with `PIKKU_INSPECTOR=go|rs`, `--inspector` or the `inspector` key of `pikku.config.json`, with `PIKKU_INSPECTOR_RS_BIN` to point at a binary; `@pikku/inspector-go` ships it for linux-x64, linux-arm64 and darwin-arm64. The default is unchanged (Go).
