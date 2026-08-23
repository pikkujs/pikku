---
'@pikku/cli': patch
'@pikku/skills': patch
---

Fail `pikku fabric validate` when a scenario step hardcodes a string the message catalogue already owns.

A browser step that says `getByLabel('Full Name')` passes only while the app happens to render the base locale, and any copy edit turns it into a selector timeout that points at the wizard rather than at the rename that caused it. Validate now reads each `apps/<app>/messages/<baseLocale>.json` and errors on any string in a `*.steps.ts` / `*.scenario.ts` that is verbatim a catalogue value, naming the key to use.

It scans every literal rather than only the ones sitting in a `getBy*` call, because copy passed to a project helper — `pick('Where would you like to work?', …)` — reaches the DOM just the same. Comments are stripped first, since the prose around a step quotes the copy it is explaining. A project with no inlang app is not scanned, and a string the catalogue does not own (a test id, a fixture filename) is left alone.

The `pikku-scenario` skill gains the corresponding rule, including typing the lookup off the catalogue JSON rather than the generated Paraglide output, so a renamed key is a compile error instead of a run-time timeout.
