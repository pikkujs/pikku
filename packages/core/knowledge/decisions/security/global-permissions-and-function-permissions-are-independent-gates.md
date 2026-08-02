---
type: decision
title: Global permissions and function permissions are independent gates
description: Globals AND together and can only narrow access; a function's own group ORs internally and is never satisfied by a global
tags: permissions
---

# Global permissions and function permissions are independent gates

`runPermissions` in `packages/core/src/permissions.ts` runs two gates and both
must pass. Every requirement registered through `addGlobalPermission` is checked
in turn and any failure throws `ForbiddenError` — globals AND, so a global can
only ever narrow access, never grant it. The function's own `permissions` group
is then evaluated by `verifyPermissions`, which ORs the group's branches and ANDs
the entries within a branch: the group passes if at least one branch is
satisfied.

That OR inside `verifyPermissions` is the only OR in authorization. Everything
cross-cutting — globals, scopes, auth — ANDs. A function's own group is the sole
place where "owner OR admin"-style alternatives belong. Crucially, a global that
passed contributes nothing to the function gate: a broad `signedIn` global cannot
satisfy an admin-only function's requirements, because the two gates are
evaluated independently against separate inputs. An empty or absent group passes,
so declaring no permissions means "globals only", not "deny".

Globals are bucketed per package, and a function reads *both* the root bucket and
its own package's — root first. The generated `addGlobalPermission` wrapper takes
no package argument, so an application's rules only ever land in the root bucket;
resolving the package bucket alone meant a host rule like "every request needs a
signed-in user" silently stopped at the addon boundary, while the bucket an
addon's functions actually read was one no host could write to. Unioning is safe
in a way that nothing else here would be: globals AND, so adding the root ones
can only tighten. Package buckets stay one-way — a package's globals never apply
to root functions, or an installed addon could gate the whole application.

**What this rules out:** short-circuiting the function gate when the globals
passed, merging the global requirements into the function group (which would turn
AND into OR and let any global satisfy any function), and giving
`verifyPermissions` AND-across-branches semantics to "make it consistent" with
the global gate.
