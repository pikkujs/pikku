---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/cli': patch
---

CLI options now declare their type, and the parser follows it instead of guessing.

`CLIOption` gains `type?: 'string' | 'number' | 'boolean' | 'string[]'` (replacing the never-honoured `array` flag), inferred from `default` when unset. A `'string[]'` option consumes one token and splits it on commas; every other non-boolean option consumes the next token verbatim, so values that begin with `-` (base64url tokens, negative numbers, dash-leading name patterns) parse correctly. A boolean option is a flag: it consumes the next token only when that token is an explicit literal (`true`/`false`/`1`/`0`/`yes`/`no`), so `--watch false` still turns a default-on flag off instead of leaving `false` behind as a positional.

The `pikku all` filter options are declared as `string[]`, so the CLI's ad-hoc `parseCommaSeparated` normalisation is gone.
