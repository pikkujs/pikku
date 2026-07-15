---
'@pikku/n8n-import': patch
---

Convert static n8n `toolHttpRequest` / `httpRequestTool` agent tools into real
Pikku tool functions instead of throwing stubs. A tool with a static URL emits
a `pikkuSessionlessFunc` that performs the configured `fetch` (URL, method,
headers and query baked in as literals), carrying the n8n `toolDescription`; the
agent references it unchanged via `tools: [ref(...)]`. Auth reuses the same
`httpAuthRecipe` recipe table as the main `httpRequest` node — static-key auth
(bearer/apiKeyHeader/apiKeyQuery/basic) is injected from a secret at call time,
and the tool is excluded from `deriveCredentialInstances` so it never spawns a
bogus `@pikku/addon-<authtype>`. A runtime-dynamic URL (`$fromAI`, `{{ }}`,
`{placeholder}`) or OAuth2/custom auth has no static lowering and stays a stub.
Corpus clean coverage 973 → 985.
