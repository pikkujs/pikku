---
type: decision
title: The remote jobs inbox rejects every caller when its secret is unset
description: remoteJobsSecret refuses all requests when the dispatch secret variable is empty, and compares the header in constant time when it is set
tags: core, remote-jobs, secrets, middleware
---

# The remote jobs inbox rejects every caller when its secret is unset

`packages/core/src/middleware/remote-jobs-secret.ts` guards the remote job inbox.
The doc comment says it "fails closed: an unset secret rejects every caller, so
the routes are never open just because the deployment forgot to configure one"
(`remote-jobs-secret.ts:18-21`).

The check rejects when any of three things is true (`remote-jobs-secret.ts:26-31`):
the expected value is empty, the provided header is not a string, or the two
values differ. All three throw `UnauthorizedError` (`remote-jobs-secret.ts:31`).

The comparison is `constantTimeEqual` (`remote-jobs-secret.ts:8-15`), which XORs
each character code and accumulates the result. It returns early on a length
mismatch (`remote-jobs-secret.ts:9`), so the length of the secret is not hidden.

**What this rules out:** an open inbox on a deployment that has not set the
secret, and a plain `===` comparison of the secret.
