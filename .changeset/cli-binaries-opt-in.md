---
'@pikku/cli': patch
---

A normal CLI build no longer compiles the native binaries, which came to about 400 MB in every checkout. Set `PIKKU_CLI_BINARIES=host` for this machine's binary or `PIKKU_CLI_BINARIES=all` for every released target; `bun run release` and the Full Suite set `all`, so releases still ship all four.
