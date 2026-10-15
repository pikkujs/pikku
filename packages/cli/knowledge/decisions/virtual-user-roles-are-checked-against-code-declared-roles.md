---
type: decision
title: Virtual user roles are checked against code-declared roles only
description: The virtual user roles type is SystemRoleName, generated from defineSystemRole declarations, so a virtual user cannot name a console-made custom role
tags: cli, virtual-users, roles, codegen
---

# Virtual user roles are checked against code-declared roles only

`serializeVirtualUsersTypes` in `packages/cli/src/functions/wirings/virtual-users/serialize-virtual-users-types.ts`
generates a `defineVirtualUsers` wrapper that types a virtual user's `roles` as
`SystemRoleName[]`, imported from the generated roles file. The comment says a
`string[]` would let a virtual user name an undeclared role, and the failure would
surface as 403s in a run days later rather than as a build error.

`serializeRolesTypes` in `packages/cli/src/functions/wirings/roles/serialize-roles-types.ts`
builds that union from `defineSystemRole` names only, and writes it into the generated
file as `SystemRoleName`. Its comment says custom roles are absent on purpose, because an
admin can delete one in the console.

**What this rules out:** a virtual user pinned to a role that exists only in the console
and can disappear, and a plain `string` for virtual user roles.
