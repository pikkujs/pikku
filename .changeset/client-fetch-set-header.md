---
"@pikku/fetch": patch
---

Add `CorePikkuFetch.setHeader(name, value)` to set or clear an arbitrary request header (passing `null` removes it). Enables per-client headers such as admin impersonation (`x-pikku-impersonate-user-id`) without subclassing the fetch client.
