# @pikku/addon-graph

## 0.12.10

### Patch Changes

- ae4e898: Carry a secret's `allowedHosts` through code generation, and close three gaps in
  the SSRF guard.

  `allowedHosts` was declared and enforced but never survived codegen: the
  inspector did not read the property off the `defineSecret` literal, and the meta
  builder rebuilt its objects without it. Enforcement in `assertSecretAllowedForHost`
  then always saw `undefined`, so the egress restriction was a no-op by default —
  and, with `secrets.requireAllowedHosts` set, threw for every secret including the
  ones that correctly declared hosts. Both stages now carry the field, and the
  secrets verifier asserts it against the generated JSON rather than a hand-written
  meta literal, which is why the existing tests stayed green.

  `isPrivateHost` now checks an explicit CIDR table instead of ad-hoc octet
  comparisons. It previously missed `100.64.0.0/10` — which contains Alibaba
  Cloud's `100.100.100.200` metadata endpoint — along with `192.0.0.0/24`,
  `198.18.0.0/15`, `192.88.99.0/24`, the TEST-NETs, multicast and reserved space.
  IPv6 gains a real parser, so `fec0::/10`, `ff00::/8`, and NAT64 (`64:ff9b::/96`)
  and 6to4 (`2002::/16`) forms wrapping an internal IPv4 address are caught.

  `safeFetch` takes an optional `resolveHost`, checked on the initial URL and every
  redirect hop, so a _public_ hostname pointing at a private address is refused —
  the `169-254-169-254.nip.io` shape a literal-only check cannot see. Core cannot
  resolve DNS itself (Workers has no DNS API), so the Node resolver ships as
  `@pikku/core/node-host-resolver` and the Node server runtimes install it during
  `init()`. The connection is not pinned to the address that was checked, so a
  rebind between check and connect is still possible.

  The graph addon's `httpRequest` node called bare `fetch`, bypassing the guard
  entirely; it now goes through `safeFetch`.

- Updated dependencies [e848eb2]
- Updated dependencies [b170489]
- Updated dependencies [ae4e898]
  - @pikku/core@0.12.79

## 0.12.9

### Patch Changes

- 78b29f0: `SecretService` now returns a `SecretValue<T>` rather than the bare value, so a
  vault secret cannot reach a sink by accident.

  `SecretValue` is nominally typed, which means it is not assignable to `string`
  (or to any other concretely-typed field). Every sink with a real type — a
  database column, an email body, a session payload — rejects it with no lint
  rule involved. The sinks typed `any`, `unknown`, or a free generic — the logger,
  queue payloads, webhook and email inputs, and a function's own output — are
  guarded with `Safe<T>`, which collapses a `SecretValue` found anywhere inside
  `T`, however deeply nested, to `never`.

  Unwrap deliberately at the point the secret reaches the wire:

  ```ts
  const secret = await secrets.getSecret('BETTER_AUTH_SECRET')
  betterAuth({ secret: secret.reveal() })
  ```

  Two behaviours cover what types cannot see. Structured serialization redacts —
  `JSON.stringify` and node's inspect both yield `[secret]`, so an audit or log
  write stays honest without crashing the request. String coercion throws
  `SecretCoercionError`, because a template literal is always a leak.

  `AuditLog.write` is guarded the same way as the logger, since an audit event
  carries `input` and `metadata` as `unknown` and nominality alone cannot stop a
  secret landing in one.

  `.reveal()` is the deliberate escape hatch, and what it hands back is an
  ordinary string as far as every sink signature is concerned. **PKU953** closes
  that gap: under `pikku all --security` the inspector reports a revealed secret
  that flows into a logger, an audit, a queue, an email or a webhook — `console` included.

  This also fixed a real one: `remote-addon-auth.ts` called `String(token)` on an
  `unknown` and wrote the result straight into an `Authorization` header.

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [78b29f0]
  - @pikku/core@0.12.76

## 0.12.8

### Patch Changes

- 8075f6a: Confine `SecretService` to the places an app is wired.

  `secrets` is now omitted from the services every function, AI agent, workflow,
  permission and wire receives, and the function runner replaces it with a
  throwing accessor so a cast cannot reach past the type. It stays available in
  `pikkuServices`, `pikkuWireServices`, addon service factories and middleware —
  read a secret there, give it to a service, and have the function ask that
  service.

  Alongside it:
  - `wireSecret` gains `allowedHosts`, refusing a secret attached to a host it was
    not declared for. Permissive by default; strict via
    `config.secrets.requireAllowedHosts`.
  - `pikku-graph`'s `httpRequest` resolves and attaches its credential inside a new
    `httpRequester` service instead of holding the plaintext in the function.
  - New inspector diagnostics: `PKU950` (a `SecretService` exposed under another
    service name), `PKU951` (a secret read that no `wireSecret` declares) and
    `PKU952` (a secret read with a non-literal key).

- Updated dependencies [6a307f0]
- Updated dependencies [afef587]
- Updated dependencies [8075f6a]
  - @pikku/core@0.12.74

## 0.12.7

### Patch Changes

- 637e668: State every package's license in the package itself.

  Eight publishable packages had no `license` field, `@pikku/aws-services` said `UNLICENSED` by accident, and no package carried a LICENSE file at all — the grant lived only in the repo root, which npm tarballs never include. Every publishable package now declares its license and ships the matching LICENSE file, and `yarn check:licenses` fails the release if the two ever disagree.

  `@pikku/console` is now explicitly BUSL-1.1 and named in the root LICENSE's Licensed Work alongside `@pikku/cli` and `@pikku/inspector`; the Additional Use Grant still permits production use for any purpose, including in free and open source software. Everything else — runtimes, services, clients, deploy adapters and the agent skills — is MIT, as the root LICENSE already said.

- Updated dependencies [8a2c993]
- Updated dependencies [a261006]
- Updated dependencies [09973b9]
  - @pikku/core@0.12.71

## 0.12.6

### Patch Changes

- cb079cc: `graph:httpRequest` gains an optional `auth` descriptor (bearer/apiKeyHeader/apiKeyQuery/basic) resolved from the `SecretService` at request time; `oauth2` is a guarded not-yet-supported error.
- cb079cc: Rename the `graph:map` addon function (and its `Map*` types) to `graph:fanout`, which better names invoking a child RPC once per element and collecting ordered results.
- cb079cc: Map n8n's Aggregate `aggregateAllItemData` mode onto `graph:aggregate` (new additive `includeAllItems` flag), converting ~164 previously-stubbed Aggregate nodes into real graph functions.
- cb079cc: Map n8n's Merge `append` mode (and mode-less Merge default) onto a new `graph:concat` addon function that flattens all input streams, converting ~103 previously-stubbed Merge nodes.
- cb079cc: Import n8n RAG flows (v1) — retrieval-as-tool, chainRetrievalQa, and ingestion — as runnable vector-store addon calls driven by a new `rag-map`, plus a new `graph:splitText` builtin.
- Updated dependencies [7ab5287]
- Updated dependencies [e86bc17]
- Updated dependencies [a9b96a0]
- Updated dependencies [3f7fc54]
- Updated dependencies [c478794]
- Updated dependencies [3f04ae4]
- Updated dependencies [90d9f04]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [0a7db82]
- Updated dependencies [981c4db]
- Updated dependencies [13474a6]
- Updated dependencies [5a2b0d5]
- Updated dependencies [13474a6]
- Updated dependencies [ee040dc]
- Updated dependencies [cb079cc]
- Updated dependencies [13474a6]
- Updated dependencies [9f0d0eb]
- Updated dependencies [13474a6]
- Updated dependencies [70fa400]
- Updated dependencies [7b2ea23]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64

## 0.12.5

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.4

### Patch Changes

- 0a2af8b: Stop addon packages from rebuilding via the workspace pikku CLI at publish time.

  `npx changeset publish` runs up to 10 `npm publish` processes concurrently, and
  `@pikku/cli`'s publish build (`build.sh`) starts with `rm -rf -- .pikku dist`.
  An addon whose `prepublishOnly` ran the workspace CLI (`pikku all`, or a
  `build.sh` invoking `cli/dist/bin/pikku.js`) could read `packages/cli/dist`
  mid-wipe and fail with `Cannot find module '.../cli/dist/src/services.js'`,
  breaking the release. `yarn release` already builds every package before
  publishing, so the `prepublishOnly` rebuild was redundant; it has been removed
  from both addons and a `check:no-publish-rebuild` guard now fails CI if any
  published package reintroduces a publish-time CLI rebuild.

## 0.12.3

### Patch Changes

- 4f8917f: Fix publish builds by falling back to a published CLI when the local workspace CLI binary is unavailable during release packaging.

## 0.12.2

### Patch Changes

- 9060165: Fix `@pikku/addon-graph` package exports so generated bootstrap files can be imported correctly. The Node.js HTTP server adapter is unified across dev, standalone, and container deployments. Next.js gains a worker-RPC transport. Date values in fetch responses now deserialise correctly.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21

## 0.0.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2
