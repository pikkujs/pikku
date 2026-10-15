---
type: overview
title: Questions
description: Things asked of inspector and not yet answered
---

# Questions

Something asked and not yet answered. The choice stays, the doubt gets recorded.

<!-- pikku:knowledge-index -->
- [Does a non-literal auth on wireRemoteAddon get checked?](does-a-non-literal-remote-addon-auth-get-checked.md) — A non-literal auth value is recorded exactly like an omitted one, so the consumer's credential and secret checks never run for it
- [Should an incomplete oauth2 block be dropped without a log?](is-an-incomplete-oauth2-block-dropped-without-a-log.md) — An oauth2 block missing any required field is silently left undefined, and an empty scopes array passes the check
- [Should an app function named like scenario instrumentation be silently skipped?](should-app-functions-named-like-scenario-instrumentation-be-refused.md) — Five instrumentation names are skipped by name in every project, so an app's own function with one of those names disappears without a log
- [Should the OpenAPI document apply an ApiKey-or-Bearer security default to every operation, including auth false routes?](should-the-openapi-document-default-every-operation-to-a-bearer-or-api-key.md) — The OpenAPI serializer emits one top-level security default for all operations and does not read the auth or session metadata of any route
<!-- /pikku:knowledge-index -->
