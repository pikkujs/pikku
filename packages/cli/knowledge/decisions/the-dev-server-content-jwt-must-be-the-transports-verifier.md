---
type: decision
title: The dev server's content JWT must be the same instance the transport verifies signed reads with
description: DevServerOptions.contentSigningJWT signs asset URLs and the node transport verifies signed reads with it, falling back to the singleton jwt, and refuses signed reads with a 403 when no JWT is available
tags: cli, dev-server, content, signed-urls
---

# The dev server's content JWT must be the same instance the transport verifies signed reads with

`DevServerOptions.contentSigningJWT` in `packages/cli/src/server/dev-server-runner.interface.ts:35-41` is documented as the JWT service the dev server's content service signs asset URLs with. The comment says the transport verifies signed asset reads with it, so it must be the same instance; otherwise every signed URL is rejected (`dev-server-runner.interface.ts:37-40`).

The CLI's node server runner forwards the option to the transport (`packages/cli/src/server/node-server-runner.ts:69`). The transport reads it through `getContentSigningJWTService`, which prefers the option and falls back to the singleton `jwt` (`packages/runtimes/node-http-server/src/pikku-node-http-server.ts:798-802`).

When no JWT is available, the transport logs the misconfiguration once and refuses the signed read with a 403 (`pikku-node-http-server.ts:742-757`). It does not serve the asset unsigned.

The same option is threaded through the Bun runner (`packages/runtimes/bun-server/src/pikku-bun-server.ts:112`, `:175`, `:191`).

Signed-URL verification in general is described in [signed content URLs bind the request path](../../../core/knowledge/decisions/security/signed-content-urls-bind-the-request-path.md).

**What this rules out:** giving the dev server a separate JWT service for signing from the one the transport verifies with; and dropping the `contentSigningJWT` forward in a runner, which would turn every signed read into a 403.
