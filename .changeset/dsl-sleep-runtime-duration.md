---
'@pikku/core': patch
'@pikku/inspector': patch
---

Keep a `workflow.sleep` whose duration is only known at runtime (a loop
variable, a field off the input). The closure evaluates it, so it is legal DSL;
its source text is recorded as an `expression` and emitted raw when regenerating
code, as a set step already does.
