---
type: decision
title: The frontend client files are generated from clientFiles, not copied into each app
description: typesFile, envFile, rpcFile and authClientFile in clientFiles make the CLI emit RPCInput/RPCOutput types, apiUrl(), an isomorphic rpc() client and the Better Auth client glue, with import paths computed from the config
tags: cli, codegen, frontend, react, better-auth
---

# The frontend client files are generated from clientFiles, not copied into each app

`pikku-command-rpc-client.ts` writes four more files beside `rpcWiringsFile`, each opt-in by
naming it under `clientFiles` in `pikku.config.json`: `typesFile` (`RPCInput<Name>`,
`RPCOutput<Name>`, `FlattenedRPCMap`, and `AnalyticsEvent` only when `scaffold.analytics` is on),
`envFile` (`apiUrl()`, `basePath()`, `appHref()`), `rpcFile` (`rpc()`, a PikkuRPC client that
forwards the request cookie during SSR), and `authClientFile` (the Better Auth glue built on
`@pikku/better-auth/client`). Imports between them are computed with `getFileImportRelativePath`,
so no path is written by hand.

`rpcFile` needs `envFile`, and `authClientFile` needs `rpcFile`, `envFile`, a `pikkuBetterAuth`
export and a `getSession` function; when one is missing the file is skipped with a warning that
names what to add. `clientAuth.loginPath`, `homePath` and `resetPasswordPath` choose where the
glue sends people and default to the library's own.

**What this rules out:** every app copying the same `env.ts`, `rpc.ts`, `types.ts` and auth
wrappers, and drifting from the generated clients they depend on.
