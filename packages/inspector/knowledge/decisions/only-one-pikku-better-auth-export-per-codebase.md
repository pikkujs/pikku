---
type: decision
title: Only one pikkuBetterAuth export is allowed per codebase
description: pikkuBetterAuth must be an exported const, and a second definition is refused with the first file named
tags: [inspector, auth, better-auth]
---

# Only one pikkuBetterAuth export is allowed per codebase

`addAuth` in `packages/inspector/src/add/add-auth.ts` requires `pikkuBetterAuth(...)`
to be assigned to an exported `const` (lines 242-248). The message says the CLI has
to import it.

A second definition is refused as critical `DUPLICATE_AUTH_DEFINITION` (lines
250-256). The message says "Only one pikkuBetterAuth(...) is allowed per codebase"
and names both the new file and the first one.

**What this rules out:** two better-auth configurations in one codebase, so the
CLI always has a single auth definition to read.
