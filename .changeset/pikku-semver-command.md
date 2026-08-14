---
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `pikku semver`, which derives a release's semver from a diff against a deployed surface and writes `.pikku/changes.gen.json`

A function or client-facing wiring that disappeared is major, an addition is minor, and a surface that did not move is patch. Where the generated JSON Schemas are available the verdict goes below the id level: a removed field or a newly required input field is breaking, an added optional one is not — direction-aware, so an output field going optional counts even though the same change on an input does not. `versions.pikku.json` is consumed, so a `@v2` bump does not read as a removal while v1 is still published.

The baseline is `--against <path|url>`: another `.pikku` directory, a snapshot file, or a snapshot published by `pikku semver --emit`. `--fail-on <level>` turns the verdict into a CI gate.
