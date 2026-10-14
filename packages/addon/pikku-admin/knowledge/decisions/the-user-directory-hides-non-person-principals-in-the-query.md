---
type: decision
title: The user directory hides non-person principals in the query and gates roles on admin:scopes:read
description: list-users excludes platform and synthetic user ids with a NOT IN clause and filters again after the read, and it refuses includeRoles to a caller without admin:scopes:read
tags: admin, users, directory
---

# The user directory hides non-person principals in the query and gates roles on admin:scopes:read

`packages/addon/pikku-admin/src/functions/list-users.function.ts` declares
`scopes: ['admin:users:list']` (`list-users.function.ts:64`).

**Exclusion.** `syntheticIds` (`list-users.function.ts:24-57`) collects the ids to
hide. It always adds the platform principal (`:28`). It adds every row whose marker
column is true for each declared marker (`:31-44`), and every row whose email ends
with the synthetic suffix (`:46-54`). The comment at `:14-23` gives the reason for
using ids rather than `actor != true`: a nullable marker column makes that
comparison drop every ordinary user. The query then carries `id NOT IN (...)`
(`list-users.function.ts:86-90`). The result is filtered again with `rows.filter(isPerson)`
(`list-users.function.ts:108`). The comment at `:105-107` says the second filter
is a floor for hosts with more marked rows than the gather reads.

**Roles.** `includeRoles` is checked in the function body, not in the declared
scopes. When it is set, `verifyScopes(['admin:scopes:read'], session)` runs
(`list-users.function.ts:76-80`). The comment there says this keeps the directory
usable without a scope only the roles need. The input schema says the same and adds
that a caller without the scope is refused, not handed a directory without roles
(`packages/addon/pikku-admin/src/lib/user.schemas.ts:37-42`).

**What this rules out:** an `actor != true` filter for the directory, and roles
returned to a caller who lacks `admin:scopes:read`.
