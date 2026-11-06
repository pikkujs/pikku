---
type: decision
title: code-edit's compiler-API work runs in the pikku-inspect binary
description: Source scans, JSX and pikku-call edits and type-checking call helpers in the Go binary behind @pikku/inspector-go, so code-edit depends on no typescript package
tags: [code-edit, inspector-go, typescript]
---

# code-edit's compiler-API work runs in the pikku-inspect binary

`@pikku/code-edit` has no `typescript` dependency. Everything that parsed or
checked TypeScript calls a helper exported by `@pikku/inspector-go`, which runs
it in the `pikku-inspect` binary:

- `scanMessageUsage` for `i18n-usage.ts`
- `readJsxProps`, `writeJsxProp`, `writeJsxStyle` for `jsx-props.ts`
- `findPikkuCall`, `readImports` for `code-edit.service.ts`
- `scanAsI18nArguments`, `scanAsI18nStubs`, `scanSepArguments`,
  `scanJsxLiteralText`, `scanJsxLiteralProps`, `scanStringLiteralCopy` for
  `verify/source-checks.ts`
- `typeDiagnostics`, through a long-lived `pikku-inspect serve` session
  (`InspectorSession`), for `TypeScriptService`

```decision
chosen: Port each compiler-API function to Go and keep its TypeScript signature,
  option defaults and doc comments. String splicing, git, filesystem and
  workspace-path checks stay in TypeScript; only what needs a parse tree or a
  checker crosses to the binary, and offsets cross as UTF-16.
rules-out:
  - Waiting for a TypeScript 7 compiler API that has createSourceFile
  - Keeping a TypeScript 6 dependency in code-edit behind the root alias
  - A second Go binary for code-edit
  - Approximating a JavaScript behaviour in Go; where the two differ the Go
    side matches JavaScript (UTF-16 offsets and slicing, \s and ., /i without
    /u, invalid UTF-8 decoding, ECMAScript line breaks)
because: One binary is already distributed per platform, already holds the
  parser, and already answers helpers over serve. Each port was proven against
  the TypeScript 6 implementation it replaced on real repository code plus a
  fixture that hits every branch, and the fixtures and their expected output
  are committed under packages/inspector-go/testdata/ so the Go tests keep
  pinning them.
```

**What changed for callers:** `TypeScriptService.diagnostics()` is async and the
service has `dispose()`, which stops the type-checking process. Each call
rebuilds the program from a parsed-file cache; TypeScript 6 kept live language
service projects (an LRU of four). The answer is the same; the cost on a large
project has not been measured.

**What is not matched:** syntax-error recovery beyond a few hand-written broken
files, and a lone surrogate inside an `allowed` string passed from JavaScript.
