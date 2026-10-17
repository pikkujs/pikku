---
type: decision
title: A pikku helper is identified by what its callee resolves to, not how it is spelled
description: Middleware, permission, auth and pikkuFunc calls are matched through import aliases, namespace imports, re-exports and const bindings, and a gate helper used as a value is reported as PKU577
tags: [inspector, middleware, permissions, auth, security]
---

# A pikku helper is identified by what its callee resolves to, not how it is spelled

`resolveCalleeName` in `src/utils/resolve-callee-name.ts` collects every name a
callee answers to — its spelling, the exported name of the import or re-export
it goes through, the member of a namespace import, the declaration it resolves
to, and the initializer of a `const` bound to it — and matches the deepest one
against the helper names. `addMiddleware`, `addPermission`, `addAuth`
(`pikkuBetterAuth`, `betterAuth`), `addFunctions` and
`ensureInlineWiringFunction` all identify their calls through it (#1461).

Matching the identifier text meant `import { addTagMiddleware as guard }`
registered nothing, with no error: the meta came out without the tag group, the
generated code never imported the file, and the gate never ran. For `pikkuFunc`
it was worse in one direction: `sessionless` was `text !== 'pikkuFunc'`, so
`pikkuFunc as pikkuOpenFunc` produced a function that required no session.

The deepest name wins because it is the declaration's own; an alias that looks
like another helper is still the helper it imports. An unresolvable module (a
`#pikku` import before codegen has run) still yields the specifier's exported
name. A call inside the declaration of a helper of the same name — the
generated `#pikku` wrappers forwarding to `@pikku/core` — keeps the meaning its
literal spelling gives it, since it is the helper's implementation rather than a
use of it. The declaration is not required to live in `@pikku/core`: the
wrappers in the generated `#pikku` modules are the declarations user code
actually reaches.

A middleware or permission helper referenced in a value position (an argument,
an array element, a ternary branch, an object property) is reported as
`PKU577 REGISTRATION_NOT_A_DIRECT_CALL` at `error` severity, because whatever it
registers there is invisible to codegen.

**What this rules out:** matching any of these helpers by identifier text;
requiring the resolved declaration to be in `@pikku/core`; and silently
skipping a gate helper the inspector cannot follow.
