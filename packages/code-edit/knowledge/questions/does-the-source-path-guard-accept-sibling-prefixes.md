---
type: question
title: Does the source-path guard accept sibling directories that share the root's prefix?
description: resolvePath checks startsWith on the root with no path separator, so a sibling directory whose name begins with the root name passes
tags: [code-edit, paths, security]
---

# Does the source-path guard accept sibling directories that share the root's prefix?

`resolvePath` in `packages/code-edit/src/code-edit.service.ts` (lines 322-330) resolves a
source file against `this.rootDir`, which is the constructor argument with no
normalisation (line 83). It then throws "Path traversal not allowed" unless
`resolved.startsWith(this.rootDir)` (lines 326-327).

There is no separator in that check. With a root of `/work/app`, a path resolving to
`/work/app-other/file.ts` starts with the root string and would pass. `resolvePath` is
called by the source-editing methods (for example lines 93, 120, 141, 169 and 205).
A search of `packages/code-edit/src` found no test that mentions "Path traversal".

Question: should the guard compare against the root plus a path separator, or is the
root always a directory whose siblings cannot share its name? The code does not say. I
did not run the case.
