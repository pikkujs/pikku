---
'@pikku/cli': patch
---

build(cli): publish a Windows binary on each release

The native binary build now compiles a `bun-windows-x64` target alongside the
existing linux/darwin x64+arm64 builds, producing `pikku-windows-x64.exe`. The
release job already globs `release/binaries/*` and uploads everything to the
GitHub release, so the Windows binary is attached to every CLI release with no
further CI changes.
