---
type: decision
title: A pikkuPermission that never reads its data is PKU586, and only certain cases are reported
description: The visitor records dataUnused only when it is certain, finalize reports it as a warning or a critical under strictMeta, and a passing check for anonymous callers cannot move to pikkuAuth
tags: [inspector, permissions]
---

# A pikkuPermission that never reads its data is PKU586, and only certain cases are reported

`pikkuPermission` gets the input, and `pikkuAuth` gets only the services and the
session, so it can be evaluated before the input exists. A permission with no use
for its data should be a `pikkuAuth`, and the compiler says so instead of a skill.

**Strict.** There is no general strict mode in the inspector. `strictMeta`
(`pikku all --strict-meta`) is the only strict option that reaches both engines,
so PKU586 is a warning without it and a critical with it. `pikku validate --strict --codegen`
passes `--strict-meta` to codegen.

**Where it is reported.** The visitor records `dataUnused` on the definition, and
`validatePermissionDataUsed` reports it during finalize, inside the validation
pass. A visitor would report it once for each inspection of a run.

**What is reported.** Only an inline handler whose data parameter is absent, is
`_`-prefixed, or is named and never referenced. A false negative is preferred to
a false positive, so these are left alone: a handler passed by identifier, a rest
or destructured parameter, `arguments`, an inner name that shadows the parameter,
and the permission inside a `pikkuPermissionFactory`, which the visitor does not
read. A check that reads a wire other than `session` is also left alone, because
`pikkuAuth` has no wire to read.

**What this does not solve:** `pikkuAuth` refuses a caller with no session without
running the check. A session-only check that passes for anonymous callers, such
as a global permission on an app with public routes, is still reported but cannot
be switched without closing those routes. The online-shop global permission and
the function-addon recipe's `addonPermission` are in this position.
