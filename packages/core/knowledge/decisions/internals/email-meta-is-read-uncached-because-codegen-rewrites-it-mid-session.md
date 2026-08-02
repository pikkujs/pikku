---
type: decision
title: Email meta is read uncached because codegen rewrites it mid-session
description: getEmailMeta re-reads its file on every call, unlike every other meta accessor, because the file appears and changes during a long-lived session
tags: services
---

# Email meta is read uncached because codegen rewrites it mid-session

`LocalMetaService.getEmailMeta` (`packages/core/src/services/meta-service.ts`)
reads `email/pikku-emails-meta.gen.json` fresh on every call. Every other
`getXMeta` on that class memoises into a private cache field; this one
deliberately does not.

The email meta file is written by `pikku all` / `pikku emails generate`, and in a
long-lived session it is regenerated underneath a running process — the sandbox
boots the orchestrator before the user project's codegen has produced it. When
this accessor was cached, the first call landed before the file existed, cached
the empty `{ templates: {} }` fallback, and the console's emails screen stayed
blank for the rest of the session even after the file appeared. A local JSON
read is essentially free, so re-reading is the cheaper mistake.

**What this rules out:** "consistency" refactors that give every meta accessor
the same caching treatment, including the one that collapses the ~25 hand-written
`getXMeta` methods and their cache fields into a single generic
`cached(key, loader)` helper. Email meta must stay outside whatever cache that
introduces.
