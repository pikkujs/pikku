---
'@pikku/console': patch
---

PikkuHTTPProvider: add a `credentials` prop (default `'include'`) that flows
through to the underlying pikku instance, including the `usePikkuSSE` fetch.
Cross-origin bearer-token setups (e.g. Fabric's sandbox runtime, served behind
wildcard CORS without `Access-Control-Allow-Credentials`) can now pass
`credentials="omit"` so the SSE/HTTP fetch isn't rejected at the CORS preflight.
Same-origin cookie-auth consumers are unaffected by the default.
