---
'@pikku/n8n-import': patch
---

Expand the `httpAuthRecipe` predefined-credential table from 5 to 31 entries,
covering the most common static-key n8n HTTP Request credential types in the
corpus — `qdrantApi`, `cloudflareApi`, `todoistApi`, `mistralCloudApi`,
`stripeApi`, `n8nApi`, `clockifyApi`, `githubApi`, `anthropicApi`,
`shopifyAccessTokenApi`, `serpApi`, `pipedriveApi`, and more — each mapped to its
documented auth scheme (bearer / apiKeyHeader / apiKeyQuery / basic). These
authenticated `httpRequest` nodes now emit a runnable `graph:httpRequest` with an
auth descriptor resolved from a secret at request time, instead of a throwing
stub. OAuth1/OAuth2 types and unrecognized credentials still degrade to stubs.
