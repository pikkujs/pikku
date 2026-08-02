---
type: decision
title: HTTP route groups cascade config in a fixed, per-field order
description: basePath concatenates, tags and middleware merge outward-in, auth is overridden by the innermost group
tags: http
---

# HTTP route groups cascade config in a fixed, per-field order

`wireHTTPRoutes` in `packages/core/src/wirings/http/http-routes.ts` walks a
nested route map and merges group config at each level through
`mergeGroupConfig`. Each field cascades differently, and the differences are the
contract callers write against:

- `basePath` concatenates, outer prefix first, so nesting composes URLs.
- `tags` merge, parent then child; nothing is replaced.
- `middleware` merges with the parent's entries first, so outer middleware always
  runs before inner middleware.
- `auth` is a single value and the innermost declaration wins, which is what lets
  one public route sit inside an authenticated group.

`registerRoute` then applies the same rules once more between the group config
and the individual route before calling `wireHTTP`.

**What this rules out:** collapsing `mergeGroupConfig` into an object spread or a
generic deep-merge. A spread would make the child replace the parent's `tags` and
`middleware` instead of extending them, and a deep-merge would concatenate `auth`
or reorder middleware — silently changing which middleware sees a request first.
