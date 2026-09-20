---
'@pikku/cli': patch
---

`pikku fabric changes ask` takes `--option`.

The flag existed only on fabric's own websocket CLI. A checkout-based agent runs
this copy instead, where `--option "Reprice them" --option "Leave them"` printed
`Warning: Unknown option: --option (ignored)` four times and then asked the
question with its choices nowhere the filer could click them — so every question
came back needing typed prose, which is the thing the option list exists to
avoid. The API has accepted `option` since the panel learned to render the
buttons; only this command never passed it on.

Repeatable or comma-separated, up to six. `--question` now says to name the
choices with the flag rather than as "(a) … (b) …" inside the text, and the
render echoes what the filer can click.
