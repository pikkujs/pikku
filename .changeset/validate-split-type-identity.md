---
'@pikku/cli': patch
---

feat(cli): validate catches a linked dependency that splits a package's type identity

A dependency linked into the project from another checkout (`link:`, `portal:`,
or a hand-made `dist` symlink) resolves its own imports from that other tree's
`node_modules`. When both trees carry the same package at different versions,
TypeScript ends up with two unrelated declarations of the same interface and
structurally compares them wherever they meet — which inside a generic
inference chain compounds badly. Fabric's `api-functions` went from
1.3GB/13s to a typecheck that never finished (8GB and 12GB heap ceilings both
died, 7.7M types, single assignability checks taking eight seconds) because one
package's `dist` pointed at a sibling checkout carrying its own `better-auth`.

The failure mode is what makes it worth a check: it presents as "codegen is
slow" or an out-of-memory crash, never as a version mismatch, and no existing
check looked at it. Both `pikku validate` and `pikku fabric validate` now report
`split-type-identity-<dep>-<pkg>` for each type-identity-sensitive package
(`better-auth`, `@better-auth/core`, `@pikku/core`, `kysely`, `zod`) that a
linked dependency resolves at a different version than the project does, naming
both versions and both paths.

Nothing about this is fabric-specific — linking a package from a sibling checkout
is the normal way to develop a pikku package against a consuming app, which is
exactly the population that hits it — so the check lives in the shared registry
and runs for any project.

It runs at the workspace root only: a linked dependency is a property of the
install as a whole, so running it per workspace package would report the same
pair once per package.

This is distinct from the existing duplicate-copy check, which is about two
physical copies of the *same* version splitting module state at runtime. Dependency
lookup probes workspace package directories as well as the root, so it also works
under isolated/pnpm-style installs that never hoist to the root `node_modules`.
