---
'@pikku/cli': patch
---

Pin the CLI bootstrap's whole dependency tree by resolution date

`build.sh` pinned `PIKKU_CLI_VERSION` but not the published CLI's own `@pikku/*`
dependencies, which are declared with carets and float forward. After #972
published `@pikku/inspector@0.12.43` (which dropped `http.routePermissions`),
the pinned CLI 0.12.35 resolved that newer inspector at bootstrap time and the
build died with `TypeError: Cannot read properties of undefined (reading 'size')`.

The bootstrap install now uses `npm install --before="$PIKKU_BOOTSTRAP_BEFORE"`,
resolving every dependency to what was current at the CLI pin's publish date.
