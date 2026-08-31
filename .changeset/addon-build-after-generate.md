---
'@pikku/cli': patch
---

`pikku new addon` now installs and builds the addon it generates.

The generated package exports `./dist/...`, which is what an installed consumer
resolves and what the app's own `pikku-bootstrap.gen.ts` imports. Until `build`
had run, that path did not exist: the app failed at boot with PKU340 and an
ERR_MODULE_NOT_FOUND on a dist file nobody had written, and every
`ref('<addon>:…')` resolved to nothing. Nothing about the generated files showed
the problem, so a generated addon looked complete and was dead at runtime.

Pass `--no-build` to keep the previous write-only behaviour.
