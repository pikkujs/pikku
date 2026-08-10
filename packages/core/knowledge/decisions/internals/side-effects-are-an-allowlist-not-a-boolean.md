---
type: decision
title: sideEffects is an allowlist, because core genuinely has some
description: The error registry is built by addError calls that run on import, so claiming sideEffects:false would let a bundler drop it and leave getErrorResponse unable to find any error
tags: core, packaging
---

# `sideEffects` is an allowlist, not `false`

Without a `sideEffects` field a bundler must assume every module in the package
does something merely by being imported, so it cannot drop any of them. That is
the state core shipped in, and it costs every bundled consumer the whole package.

The reflex fix — `"sideEffects": false` — would be untrue. Five modules run code
at import, 59 top-level calls between them, and every one is `addError(...)`
registering an error class in the runtime registry:

- `errors/errors.js` (44)
- `wirings/workflow/pikku-scenario-service.js` (6)
- `wirings/workflow/workflow-errors.js` (5)
- `wirings/rpc/rpc-runner.js` (3)
- `wirings/rpc/remote-addon-auth.js` (1)

A bundler that dropped `errors/errors.js` because nothing imported a binding
from it would leave `getErrorResponse` unable to map any error to a status. The
app would build, and every error would come back as a generic 500.

So the field names those five exactly. Everything else can be tree-shaken.

**What this rules out:** flipping this to `false` as a performance change, and
adding a module-level `addError` (or any other registration) without adding the
module here. `side-effects-are-declared.test.ts` walks the source for top-level
calls and fails in both directions — a module with side effects missing from the
list, and a listed module that no longer has any.
