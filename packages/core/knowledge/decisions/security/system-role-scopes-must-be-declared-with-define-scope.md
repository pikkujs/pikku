---
type: decision
title: System role scopes must be declared with defineScope, or the build fails
description: A system role may grant only scope ids that defineScope declares, and the bare wildcard is refused; both are critical inspector diagnostics, so a role cannot grant a scope no function checks
tags: core, roles, scopes, inspector
---

# System role scopes must be declared with defineScope, or the build fails

The type doc on `CoreSystemRole.scopes` says every id a role grants "must be declared with `defineScope` — the inspector fails the build otherwise, so a role cannot quietly grant a scope that no function checks" (`packages/core/src/wirings/role/role.types.ts:15-19`).

The check is `validateSystemRoleScopes` in `packages/inspector/src/utils/post-process.ts:1745-1775`. It walks every `state.systemRoles.definitions` entry and each of its scopes:

- The bare `*` is reported as critical and skipped (`post-process.ts:1757-1763`).
- A trailing `:*` is stripped before the lookup (`post-process.ts:1765`), so `admin:*` needs `admin` to be declared.
- Any other scope missing from the set built from `state.scopes.definitions` is reported as critical, with the list of available scopes (`post-process.ts:1766-1771`).

It runs from the validation pass in `packages/inspector/src/inspector.ts:580-581`, straight after `applyDeclaredScopes` and `validateScopeReferences`.

Critical diagnostics are what block the build by default. The `diagnostic` doc in `packages/inspector/src/types.ts:400-403` says `error` and `warn` block only under `--fail-on-error` / `--fail-on-warn`, with the default at critical only.

The literal-array and unqualified-name rules for `defineSystemRole` are a separate check, covered in [System roles must declare literal, unqualified scopes](../../../../inspector/knowledge/decisions/system-roles-declare-literal-unqualified-scopes.md). The runtime side, where a synced role can only add grants, is in [System roles are synced additively and cannot be deleted or rewritten](system-roles-are-additive-and-immutable.md).

**What this rules out:** a system role that grants a scope no `defineScope` declares, which no function would ever check. It also rules out a role granting bare `*`, which would hide what the role confers. Neither is a warning to tolerate; both stop the build.
