---
'@pikku/cli': patch
---

Fix bundled skills that documented APIs and commands which do not exist, and rewrite pikku-testing onto scenarios (renamed pikku-scenario).

`getSecretJSON`/`setSecretJSON` were documented across 7 skills but defined in zero TypeScript files — `getSecret<T>`/`setSecret` already handle JSON. `pikku tsc`, `pikku prebuild`, `pikku auth` and `pikku create` are not commands. `pikku tests` was removed in #865; pikku-testing still documented it, along with Gherkin `.feature` files whose in-process world was deleted in the same PR.

Adds a verifier that parses the real command list from the wireCLI AST and the real method list from the SecretService interface, so a skill can no longer reference something that does not exist.
