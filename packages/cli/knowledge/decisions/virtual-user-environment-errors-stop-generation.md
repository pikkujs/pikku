---
type: decision
title: A virtual user that cannot run where it says stops generation
description: Virtual user generation throws on environment errors before writing any file, and deletes the secrets file earlier versions generated
tags: cli, virtual-users, codegen, environments
---

# A virtual user that cannot run where it says stops generation

`pikkuVirtualUsers` in `packages/cli/src/functions/wirings/virtual-users/pikku-command-virtual-users.ts`
checks every virtual user against the configured environments with `virtualUserEnvironmentErrors`
before it writes anything. Any error is thrown, and the comment says generating the file anyway
would leave a `.pikku` that typechecks while lying.

No secret is generated for virtual users any more. When a `pikku-virtual-users-secrets.gen.ts`
left by an earlier version sits beside the virtual users file, it is deleted, because the comment
says a stale declaration would keep asking every deploy for a value nothing reads.

**What this rules out:** a generated virtual users file that declares a virtual user for an
environment it may not run in, and a leftover secret declaration nothing reads.
