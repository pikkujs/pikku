---
type: question
title: Should betterAuthStoreSession warn about unhonoured impersonation?
description: The cookie and stateless middlewares warn once when the impersonation header is ignored; the store middleware does not, and nothing says whether that is an omission
tags: better-auth, impersonation, logging
---

# Should betterAuthStoreSession warn about unhonoured impersonation?

`betterAuthSession` and `betterAuthStatelessSession` both call
`warnImpersonationUnconfigured` when a request names a target and no
`impersonation` option is set. `betterAuthStoreSession` does not.

Without the warning, a store-backed app that forgets the option runs every
scenario virtual user as the signed-in caller and fails only on assertions. The code gives
no reason for the difference.

Open: is the store middleware's silence an omission, or was it left out because
it is used only for header-token traffic where impersonation is never wanted?
