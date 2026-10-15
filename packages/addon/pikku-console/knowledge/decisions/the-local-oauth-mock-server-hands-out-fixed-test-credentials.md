---
type: decision
title: The local OAuth2 mock server hands out fixed test credentials
description: The test OAuth2 server listens on localhost, generates a fresh RSA key on each start, and prints a fixed client id and secret for local use
tags: console, oauth, local-dev, testing
---

# The local OAuth2 mock server hands out fixed test credentials

`packages/addon/pikku-console/src/tests/test-oauth.ts` starts an `oauth2-mock-server`
for local testing. It generates an RS256 key on each start (`test-oauth.ts:8-9`) and
listens on `localhost` port 8080 (`test-oauth.ts:12`).

It prints fixed mock app credentials as an environment variable:
`{"clientId":"test-client","clientSecret":"test-secret"}` (`test-oauth.ts:21-24`).
It also prints the `oauth:status mock` and `oauth:connect mock` commands that use
them (`test-oauth.ts:26-28`). SIGINT stops the server and exits (`test-oauth.ts:34-43`).

**What this rules out:** using these client values for anything outside local
testing, and binding this server to a non-local interface, since the code binds
`localhost` only.
