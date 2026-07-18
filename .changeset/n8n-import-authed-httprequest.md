---
'@pikku/n8n-import': patch
---

Authenticated n8n HTTP Request nodes now map to a runnable `graph:httpRequest`
call instead of a throwing stub. A new `http-auth-map.ts` classifies the n8n
auth type (generic header/basic/query + predefined API-key credential types) into
an `HttpAuthDescriptor` (mode + credential name + recipe); `graph:httpRequest`
resolves the secret at runtime. Header/query auth whose exact header name lives
in n8n's absent credential store defaults to `Authorization: Bearer` with a TODO.
OAuth2 and custom auth have no static recipe and stay stubs (follow-up). Authed
http nodes are also excluded from `deriveCredentialInstances`, fixing a latent
bug that emitted a bogus `@pikku/addon-<authtype>` `wireAddon`.

Corpus impact: fully-clean workflows rose from 797 to 964 (+167) on the 2,053
Danitilahun mirror.
