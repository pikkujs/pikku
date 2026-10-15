---
type: decision
title: Scoped content access is confined to a root folder, with longest-prefix grants outside it
description: ScopedContentService keeps an addon inside its root folder, lets it reach the wider store only through read or write grants matched by longest prefix, and refuses signURL and copyFile
tags: core, content, scoping, paths
---

# Scoped content access is confined to a root folder, with longest-prefix grants outside it

`packages/core/src/services/scoped-content-service.ts` narrows a `ContentService`
to one folder. The doc comment describes the rule (`scoped-content-service.ts:57-67`).

Paths are normalised first (`scoped-content-service.ts:39-49`). Each value is
decoded up to four times (`scoped-content-service.ts:16`, `25-35`). A null byte,
a leading `/` or `\`, or a `.` or `..` segment in any pass is refused
(`scoped-content-service.ts:40-46`).

A bucket that does not start with `@` is placed under the root
(`scoped-content-service.ts:105-109`). A bucket that starts with `@` names a path
from the store root. It is allowed if it sits under the root
(`scoped-content-service.ts:113`). Otherwise the grants are checked, sorted
longest prefix first (`scoped-content-service.ts:79-88`), and the first match
decides (`scoped-content-service.ts:114-117`). A write needs a `write` grant
(`scoped-content-service.ts:115`).

`signURL` and `copyFile` throw unconditionally (`scoped-content-service.ts:126-128`,
`145-147`). The doc comment says both take a finished URL or a local path, "so
neither can be narrowed to a folder" (`scoped-content-service.ts:64-66`).

**What this rules out:** traversal, including encoded traversal, out of the root,
signed URLs for content outside the root, and copies that name arbitrary paths.
