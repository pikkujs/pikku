---
'@pikku/core': patch
---

warn instead of silently ignoring unknown long CLI options

An unknown long option (`--sektion functions` or `--sektion=functions`) was parsed
into the options object and then silently dropped by the command's input schema —
the command ran with the real option at its default and produced plausible-but-wrong
output. Unknown long options are still accepted (forward compatibility is preserved),
but the parser now records a warning that the runner prints to stderr, e.g.
`Warning: Unknown option: --sektion (ignored) Did you mean --section?`.
