---
'@pikku/cli': patch
---

Stop the CLI entrypoint-guard tests failing whenever colour is forced.

The two assertions ran the emitted guard in a child process and compared its
stdout against `'true'` / `'false'`. The fixture logged the bare boolean, so
`console.log` sent it through `util.inspect`, which wraps a boolean in ANSI
yellow as soon as colour is forced. `yarn` forces it — so the tests passed when
run by hand and failed inside the pre-push hook, comparing
`'\x1B[33mfalse\x1B[39m'` against `'false'`, which left `main` unpushable
without `--no-verify`.

The fixture now logs `String(isDirectExecution)`. Strings are not colourised,
and the assertions are about what the guard resolved to, never about how Node
formats it.
