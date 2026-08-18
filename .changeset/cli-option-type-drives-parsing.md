---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

A CLI option's type now drives how it is parsed, and it comes from the command function's input schema rather than a second hand-written declaration.

`CLIOption` gains `type?: 'string' | 'number' | 'boolean' | 'string[]'` (replacing the never-honoured `array` flag). Declared, it wins over whatever the schema says; left unset, the parser reads the type off the command function's input schema — the same schema the function is validated against — falling back to `default` and then to `'string'`. A `'string[]'` option consumes one token and splits it on commas; every other non-boolean option consumes the next token verbatim, so values that begin with `-` (base64url tokens, negative numbers, dash-leading name patterns) parse correctly. A boolean option is a flag: it consumes the next token only when that token is an explicit literal (`true`/`false`/`1`/`0`/`yes`/`no`), so `--watch false` still turns a default-on flag off instead of leaving `false` behind as a positional.

Because the schema is now what types an option, `pikku serve --console --port 4077` no longer reads `--port` as the value of `--console`, and a numeric option arrives as a number instead of a string. An explicit `type` is mostly needed for options that belong to no function input — the `pikku all` filters, which the config factory reads straight off the CLI data, are declared `string[]`, and the CLI's ad-hoc `parseCommaSeparated` normalisation is gone.

An array option takes either one comma list or the flag repeated. It never consumes more than one token, because `--tags alpha beta` cannot be told apart from an option followed by a positional; the stray token is reported as an unexpected argument rather than dropped.
