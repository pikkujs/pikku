---
type: decision
title: An HTTP Request node maps to the native HTTP call only when it has no auth or a static auth recipe
description: parse-n8n gives an HTTP Request node the native http role when it is unauthenticated, or when httpAuthRecipe returns a recipe; otherwise it stays an integration stub
tags: [n8n, http, auth]
---

# An HTTP Request node maps to the native HTTP call only when it has no auth or a static auth recipe

`isNoAuthHttpRequest` in `packages/n8n-import/src/parse-n8n.ts` (lines 123-127) returns true when the node
type is `httprequest` and `parameters.authentication` is absent or `'none'`.

In the classification step (lines 283-302), an integration whose type is `httprequest` gets the role `http`
when `isNoAuthHttpRequest` is true (lines 293-294). Otherwise `httpAuthRecipe(node)` is called (line 296).
If it returns a recipe, the role becomes `http` and the recipe is stored as `httpAuth` (lines 297-300). If it
returns nothing, the node keeps the integration role and stays a stub.

The comment at lines 283-287 says a static recipe (bearer, basic or api-key) "carries an `httpAuth` descriptor
the runtime resolves from a secret", and that OAuth2, custom and unknown auth "stays an integration stub".

**What this rules out:** an authenticated HTTP Request node going through a plain native call without its auth.
An authenticated node with no static recipe is not mapped to the native call.
