---
type: decision
title: A failed link ends the QuickJS runtime it happened in
description: after a SyntaxError the remaining schema files load in a new runtime, because linking a half-linked module again aborts the process
tags: [inspector-rust, schemas, zod, quickjs]
---

# A failed link ends the QuickJS runtime it happened in

QuickJS links a module's imports one at a time. When one is missing, the ones
already bound stay behind. A second module that reaches the same half-linked
module links it again and leaks them, and `JS_FreeRuntime` then fails
`list_empty(&rt->gc_obj_list)` and aborts the whole inspector. The CLI can only
report that as the engine dying.

So the entry script stops after a `SyntaxError`, and `zodjs.rs` runs the files it
did not reach in a new runtime.

```decision
chosen: Stop loading after a SyntaxError and continue in a new QuickJS runtime.
rules-out:
  - Going on to load further schema files in a runtime where a link failed
  - Leaking the runtime to skip the assertion
because: The abort takes every schema and the whole analysis with it, and a new
  runtime costs only reloading the modules the remaining files share.
```

A `SyntaxError` thrown by a module's own code also ends the runtime. That costs
time and changes no result.
