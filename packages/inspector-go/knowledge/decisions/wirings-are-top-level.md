---
type: decision
title: A wire* call inside a function is a build error (PKU367)
description: One setup-sweep visitor refuses every Pikku wire* call that has an enclosing function, instead of each wire visitor checking for itself
tags: [inspector-go, inspector-rust, wiring, diagnostics]
---

# A wire* call inside a function is a build error (PKU367)

Decided 2026-11-17. The wire visitors read a call's argument as a static
declaration wherever the call sits, so a `wireHTTP` inside `main()` was
registered in meta although it only runs if `main` does, and a `wireRemoteAddon`
inside a helper registers at runtime while the build counted it as static.

`checkWiringsTopLevel` (`internal/visit/check_wiring_top_level.go`, mirrored in
`inspector-rust/src/visit/check_wiring_top_level.rs`) runs in the setup sweep.
For every call whose callee resolves, through `callsImportedDefiner`, to one of
the wire functions, it walks up the parents; an arrow function, function
expression or declaration, method, constructor or accessor is a refusal. A call
in module scope is fine, and so is one inside a module-scope `if` or block: the
rule stops at function boundaries on purpose. The message names the function and
where the enclosing one is: `wireContributors must be called at the top level of
a file, not inside a function (inside optInToJobs, a.ts:8)`.

```decision
chosen: One shared visitor with a list of wire names, not a check in each wire visitor.
rules-out:
  - Per-wire checks that drift apart (the Go and Rust sides would each need fourteen)
  - Extending the rule to blocks and conditionals at module scope
because: The rule is about the callee, not about what any one wiring reads. A
  new wire function is covered by adding its name to the list, and the Go and
  Rust lists are the same one.
```

> [!WARNING]
> Files the CLI ignores (`ignoreFiles`, `**/*.test.ts`) and files outside
> Source directories are never read, so a wrapped call there is not refused. That
> is why a recipe that must be a function lives outside `src/`.
