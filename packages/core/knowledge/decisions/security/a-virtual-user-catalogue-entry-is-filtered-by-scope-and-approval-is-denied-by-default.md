---
type: decision
title: Virtual users are offered calls by declared scope, and approval-gated calls are denied by default
description: The catalogue type filters by the declared scopes of each RPC rather than by permission functions, and the catalogue filter drops approval-required entries unless the caller opts in
tags: core, virtual-users, scopes, approval
---

# Virtual users are offered calls by declared scope, and approval-gated calls are denied by default

`packages/core/src/wirings/virtual-user/virtual-user.types.ts` defines the
catalogue entry a virtual user is offered.

The `scopes` field lists the scopes the session must hold to call the RPC, all of
them (`virtual-user.types.ts:92-99`). The doc comment explains why scopes and not
permission functions: a scope is "declared and checkable", while "a permission is
arbitrary code whose verdict nobody can predict without running it"
(`virtual-user.types.ts:95-97`).

`approvalRequired` is documented as "denied by default" (`virtual-user.types.ts:89-90`).
The filter in `virtual-user-catalogue.ts` enforces this. It drops an entry when
`approvalRequired` is set and the caller has not passed `allowApprovalRequired`
(`virtual-user-catalogue.ts:113`), and that flag defaults to `false`
(`virtual-user-catalogue.ts:95`).

The same filter drops any entry the session's scopes do not cover
(`virtual-user-catalogue.ts:115-117`).

**What this rules out:** a virtual user calling an approval-gated RPC unless the
run explicitly allows it, and a permission function being used to decide what a
persona can see.
