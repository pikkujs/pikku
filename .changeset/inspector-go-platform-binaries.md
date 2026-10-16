---
'@pikku/inspector-go': patch
---

Ship `pikku-inspect` prebuilt, esbuild style: `@pikku/inspector-go-{darwin-arm64,darwin-x64,linux-x64,linux-arm64,win32-x64}` each carry the static binary for one platform and are exact optional dependencies of `@pikku/inspector-go`, versioned in lockstep with it. A missing binary now fails with the platform, the package to install and `PIKKU_INSPECTOR_GO_BIN` named.
