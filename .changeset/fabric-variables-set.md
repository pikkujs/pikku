---
'@pikku/cli': patch
'@pikku/skills': patch
---

Add `pikku fabric variables set` and `pikku fabric variables get`

`secrets` was the only stage-scoped store the CLI exposed, so a value declared
with `defineVariable` could be set locally through `.env` and not at all on a
deployed stage — `variables.get('NAME')` compiled, ran, and answered `undefined`
forever, with nothing saying why. The fabric API already had
`setStageConsoleVariable` and `getStageConsoleVariable`; only the CLI surface was
missing.

`set` stores the value the way `LocalVariablesService` reads one: `JSON.parse`,
falling back to the raw string. `--value true` is therefore the boolean on a
stage exactly as it is from `.env`, and `--value '"true"'` is the string. `get`
prints the stored value as JSON so the two are distinguishable, which is usually
why you are looking.

Variables are not sealed and are readable back — that is the difference from
`secrets`, and anything that would hurt to print belongs in `secrets set`.
