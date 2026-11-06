# @pikku/inspector-go

Native inspector for Pikku. It runs analysis and finalize in a binary and hands
`@pikku/cli` a plain-data state. Two engines speak the same protocol and are
shipped in this package under `prebuilt/<platform>-<arch>/`:

- `pikku-inspect` (Go, on typescript-go): the reference.
- `pikku-inspect-rs` (Rust, on tsrs; `packages/inspector-rust`): selectable, for
  linux-x64, linux-arm64 and darwin-arm64.

Select with `PIKKU_INSPECTOR=go|rs`, `pikku ... --inspector rs`, or
`"inspector"` in `pikku.config.json`; the default is `rs` (`DEFAULT_ENGINE` in
`src/binary.ts`). Point `PIKKU_INSPECTOR_GO_BIN` / `PIKKU_INSPECTOR_RS_BIN` at a
binary you built to override the packaged one. Lookup per engine: its variable,
`prebuilt/<platform>-<arch>/`, `bin/`, then beside the running executable.
