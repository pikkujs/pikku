---
type: decision
title: HTTP wiring without generated metadata is skipped, not fatal
description: wireHTTP warns and returns when a route has no metadata, so partial deploy units still boot
tags: http
---

# HTTP wiring without generated metadata is skipped, not fatal

`wireHTTP` in `packages/core/src/wirings/http/http-runner.ts` looks the route up in
`pikkuState(null, 'http', 'meta')` and, when nothing is found, logs a warning and
returns instead of throwing. `wireChannel` in
`packages/core/src/wirings/channel/channel-runner.ts` does the same for channels.

A deploy unit is built from filtered metadata: only the functions belonging to
that unit get meta entries. A wiring file, however, is imported whole. When two
wirings share one file, importing it for the sake of the first wiring also
executes the second — whose function is not in this unit and therefore has no
metadata. Throwing there would make an otherwise valid deploy unit fail to boot.
The warning names the route and tells the author to split the wirings into
separate files, which both fixes the warning and improves tree-shaking.

**What this rules out:** turning the missing-metadata branch into a thrown error
or an assertion "because a route should always have metadata". It should not, in
filtered builds. It also rules out silently dropping the warning — the warning is
the only signal an author gets that a route they wired is not actually served.
