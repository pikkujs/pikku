---
type: question
title: Should a delegated login invent an email when the upstream returns none?
description: With no upstream email, the default emailTemplate builds one from the login and host, and that value reaches generated code
tags: [openapi, auth, delegated-login]
---

# Should a delegated login invent an email when the upstream returns none?

In `packages/openapi-parser/src/auth-config.ts`, the `email` claim is documented as the
path to the email, and "when missing or empty, `emailTemplate` builds one" (line 19).
`emailTemplate` defaults to `'{login}@{host}'` (line 68). The placeholders are
`{login}`, `{externalId}` and `{host}` (lines 65-67).

`packages/openapi-parser/src/codegen.ts:1244` writes `delegated.emailTemplate` into the
generated code. The codegen test at `packages/openapi-parser/src/codegen.test.ts:1289`
uses the same default.

The same schema defaults `apiKeyHeader` to `x-api-key` (line 48), which is an assumed
header name for the upstream.

Question: is a synthetic address built from the login name and the upstream host meant
to be stored as the user's email? Nothing in these files says whether it is a placeholder
for display, a stable identifier, or a real address, and the upstream may own a
different domain.
