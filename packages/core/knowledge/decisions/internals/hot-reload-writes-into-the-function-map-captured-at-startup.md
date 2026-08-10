---
type: decision
title: Hot reload writes into the function map captured at startup, not pikkuState's current one
description: A dev-server watcher may have swapped in a codegen-scoped map whose writes are discarded on restore, and schemas are deliberately left alone
tags: core, dev
---

# Hot reload writes into the function map captured at startup

`reloadGeneratedMeta` registers every function-config export it finds, replacing
known functions and adding new ones. It writes into the map captured when the
reloader started, **not** into whatever `pikkuState` currently returns.

A dev-server watcher may have temporarily swapped in a codegen-scoped map while
regenerating. Writes into that map are discarded when it restores the real one,
so a reload that used the current map would appear to succeed and silently lose
every function it registered.

Schemas are deliberately not touched on this path. A function config's
`input`/`output` hold raw schema objects as the author wrote them, while the
schema map carries the JSON Schema that codegen produced. They are different
representations of the same thing, and mixing them crashed reloads.

**What this rules out:** "simplifying" the reloader to call `pikkuState(...)` at
write time, and extending it to keep `input`/`output` and the schema map in sync
without first converting between the two representations.
