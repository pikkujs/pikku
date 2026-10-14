---
type: decision
title: The audit filter vocabulary is not narrowed by the current query
description: getAuditFilters lists every user id and event type in the trail, not only those on the page being shown, so the filter lists can reach the whole trail
tags: admin, audit
---

# The audit filter vocabulary is not narrowed by the current query

`getAuditFilters` (`packages/addon/pikku-admin/src/functions/get-audit-filters.function.ts`)
takes no filter input. It calls `audit.facets()` and returns every user id and
every event type that appears in the trail (`get-audit-filters.function.ts:36`,
`:39-43`, `:43`).

The comment gives the reason. It is "deliberately *not* narrowed by the current
filters: a list that only offered what the current page shows could never be used
to reach anything else" (`get-audit-filters.function.ts:21-23`). It also says the
console can cache the result once, rather than running two scans on every page of
an infinite list (`get-audit-filters.function.ts:23-24`).

The function is gated by `admin:audit:read` (`get-audit-filters.function.ts:31`).

**What this rules out:** returning only the users and types that match the
current `getAudits` filters, which would stop a reader from filtering to a user or
type that is not on the screen yet.
