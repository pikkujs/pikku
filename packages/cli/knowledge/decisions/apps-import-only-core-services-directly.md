---
type: decision
title: App code imports only core services from core directly and reaches the rest through generated leaves
description: The core import check reports every @pikku/core import except @pikku/core/services, and suggests the generated leaf for subpaths that have one
tags: cli, validate, imports, core
---

# App code imports only core services from core directly and reaches the rest through generated leaves

`packages/cli/src/functions/validate/core-import-checks.ts` holds the rule. `ALLOWED_SUBPATHS` is `['@pikku/core/services']`
(`core-import-checks.ts:18`). The doc comment says that subpath holds concrete service implementations that picking is a
choice like picking a package, and that bootstrap code is already outside the `#pikku` contract and is where `process.env`
is allowed (`core-import-checks.ts:8-16`).

A specifier is checked only when it is a core import (`core-import-checks.ts:25-26`), and a core import that is not allowed
is reported (`core-import-checks.ts:123`). `LEAF_FOR_SUBPATH` gives the generated leaf to point at for subpaths that have one
(`core-import-checks.ts:28-37`).

**What this rules out:** app code importing other `@pikku/core` subpaths directly.
