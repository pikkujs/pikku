---
'@pikku/knowledge': patch
---

Look a planned function up by its name rather than its built version. Codegen
keys a versioned function as `name@vN`, so bumping a version made the gate
report built, wired, scenario-covered functions as MISSING. The newest revision
is now also reachable under its bare name.
