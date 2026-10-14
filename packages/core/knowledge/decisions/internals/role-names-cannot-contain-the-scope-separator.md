---
type: decision
title: System role names cannot contain the scope separator, and redeclared roles must grant the same scopes
description: validateAndBuildSystemRoleDefinitionsMeta rejects an empty role name or one containing ':', and throws when two declarations of one role name grant different scopes
tags: core, roles, scopes, validation
---

# System role names cannot contain the scope separator, and redeclared roles must grant the same scopes

`packages/core/src/wirings/role/validate-role-definitions.ts` checks declared
system roles.

The separator is `:` (`validate-role-definitions.ts:7`). A name is refused when it
is empty (`validate-role-definitions.ts:10-12`) or contains the separator
(`validate-role-definitions.ts:13-18`). The message says the separator "delimits
scope ids; a role named like a scope reads as one" (`validate-role-definitions.ts:16`).

When a name is declared twice, the scope lists are compared after sorting, so order
does not matter (`validate-role-definitions.ts:69-71`). A different set throws,
with the message "Roles sharing a name must grant the same scopes"
(`validate-role-definitions.ts:72-79`). An identical repeat is skipped
(`validate-role-definitions.ts:80`).

`flattenSystemRoleDefinitions` keeps the first entry for each name
(`validate-role-definitions.ts:36-40`). Its doc comment says this is safe only
because the validator already guaranteed the repeats are identical
(`validate-role-definitions.ts:24-29`).

**What this rules out:** a role named with a scope-like `:` in it, and two
declarations of one role that grant different scopes.
