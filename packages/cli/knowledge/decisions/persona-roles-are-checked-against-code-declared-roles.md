---
type: decision
title: Persona roles are checked against code-declared roles only
description: The persona roles type is SystemRoleName, generated from defineSystemRole declarations, so a persona cannot name a console-made custom role
tags: cli, personas, roles, codegen
---

# Persona roles are checked against code-declared roles only

`serializePersonasTypes` in `packages/cli/src/functions/wirings/personas/serialize-personas-types.ts`
types a persona's `roles` as `SystemRoleName[]` (`serialize-personas-types.ts:54-57`), and
imports `SystemRoleName` from the generated roles file (`serialize-personas-types.ts:39`).
The comment says a `string[]` would let a persona name an undeclared role, and the
failure would surface as 403s in a run days later rather than as a build error
(`serialize-personas-types.ts:12-19`).

`serializeRolesTypes` in `packages/cli/src/functions/wirings/roles/serialize-roles-types.ts`
builds that union from `defineSystemRole` names only (`serialize-roles-types.ts:18-23`).
Its comment says custom roles are absent on purpose, because an admin can delete one
in the console (`serialize-roles-types.ts:12-15`). The union is written into the
generated file as `SystemRoleName` (`serialize-roles-types.ts:38`).

**What this rules out:** a persona pinned to a role that exists only in the console
and can disappear, and a plain `string` for persona roles.
