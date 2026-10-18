---
'@pikku/inspector-go': patch
---

Ship `pikku-inspect` prebuilt inside `@pikku/inspector-go`: the static binaries for darwin-arm64, darwin-x64, linux-x64, linux-arm64 and win32-x64 sit under `prebuilt/<platform>-<arch>/`, and the host's is picked at runtime. There are no per-platform packages or optional dependencies, so a lockfile from any platform installs it everywhere. A missing binary fails with the platform and `PIKKU_INSPECTOR_GO_BIN` named.
