# tsrs-inspector (experiment)

How much of `pikku-inspect` can be rebuilt on [tsrs](https://github.com/oxc-project/tsrs), the Rust port of the TypeScript 7 compiler, through its Node API (`tsrs/sync`, `tsrs/ast`)?

Not published, not wired into the CLI, not in the workspace. It exists to answer that question with measurements. Branch: `tsrs-inspector-experiment`, off the PR that retires the TypeScript engine.

## What was built

Two slices of the inspector, rebuilt from the Go source's rules and scored field by field against the Go inspector's own output (`.pikku/function/pikku-functions-meta-verbose.gen.json`, `.pikku/http/pikku-http-wirings-meta.gen.json`):

| file                           | does                                                                                                                                        | uses from tsrs                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/discover.ts` (≈290 lines) | every exported `pikku…Func(...)`: id, wrapper, services, input/output type names, description/title/tags/mcp/expose/auth, versioned ids     | AST walk; checker: `getTypeFromTypeNode`, `getTypeAtLocation`, `getSignatureFromDeclaration`, `getReturnTypeOfSignature`, `getAwaitedType`, `typeToString`, `TypeFlags`, `Type.getTypes` |
| `src/http.ts` (≈210 lines)     | `wireHTTP`, `wireHTTPRoutes`, `defineHTTPRoutes` groups: method, route, function id, auth, params, tags, inherited `basePath`/`auth`/`tags` | AST walk; checker: `getSymbolAtLocation`, `getAliasedSymbol`, `valueDeclaration.resolve()` to follow a `func:` reference across files and renamed imports                                |
| `src/score.ts`, `src/sweep.ts` | the scorer, and a crash/timing sweep over every Pikku project in the repo                                                                   |                                                                                                                                                                                          |

The Go code those two slices correspond to: `group_functions.go` (683 lines) and `group_http.go` (651 lines).

## Results

Scored against the Go inspector on `recipes/functions`, `templates/online-shop` and `templates/field-service`:

|             | found      | fields matching        |
| ----------- | ---------- | ---------------------- |
| functions   | 162 of 171 | 2,099 of 2,106 (99.7%) |
| HTTP routes | 87 of 87   | 335 of 348 (96.3%)     |

Every difference is accounted for, and none is a bug in the checker:

- **9 functions not found** are synthesised by Go from wirings (`http:post:/agents/ops/approve`, bot handlers). They are not declarations, so a different mechanism.
- **`getItem@v3`** (3 fields, 11 route ids): Go resolves the unversioned name to the latest version in a cross-function pass (`resolve_versions.go`) that is not ported.
- **`authHandler`** (2 fields per project): Go stamps its services and output in _finalize_ from the auth definition, not at discovery.
- **`warehouseWebhookReceive`** (2 fields): webhook-receive defaults.
- **Inline-function routes**: Go invents ids for routes whose `func` is not a reference.

How the score moved: 94.4% with an AST-only first pass, 99.3% after porting the wrapper/version/MCP rules and adding checker-based naming, 99.7% after the last rule fixes. Those rules came from reading `group_functions.go`, not from fitting the data. But the scoreboard was visible while I built it, so treat the number as "reproduces Go's behaviour on these three projects", not as a blind benchmark.

### Robustness

A sweep (`src/sweep.ts`) over all 100 Pikku projects in the repo: 100 opened and walked, 0 failures, 1,191 functions found, 9.6 s in total (≈96 ms per project). No crashes, hangs or malformed results.

### Speed and memory (online-shop, this machine, linux-arm64)

|                                                          | wall   | peak RSS                                                                                 |
| -------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------- |
| Go `pikku-inspect` — the **whole** inspection            | ≈0.6 s | ≈305 MB                                                                                  |
| this experiment — function discovery **and** routes only | ≈0.6 s | ≈83 MB (the Node process only; the tsrs server is a separate process and is not counted) |

So there is no speed win for equal work yet: the experiment does a small part of the job in about the time Go does all of it. Opening the project is ≈120 ms; the function walk is ≈220 ms, most of it per-node round trips to the tsrs server, because every node and checker answer crosses a process boundary. Go's version calls typescript-go in-process. I did not measure the tsrs server's memory, so no memory claim is made.

## How far could it go?

From the Go source (`packages/inspector-go/internal`):

- **The visitors:** 32 group files, ≈9,200 lines (≈15,700 with the helpers around them), and only 111 checker calls in the whole package. **19 of the 32 groups use the checker zero times** (pure AST work: middleware, workflow graph, scopes, virtual users, MCP, gateway, …). The two groups done here are among those with real checker work. So the visitors are a large but mostly mechanical port.
- **Finalize (≈6,200 lines) need not be ported at all.** Analysis and finalize already meet at a serialized state, and the Go binary has `pikku-inspect finalize --stdin`. A tsrs front end could emit the pre-finalize state and let Go finish it.
- **Schema generation is the hard part:** ≈9,700 lines of vendored `ts-json-schema-generator-go` plus the type-to-text and `typesMap` machinery. It walks types property by property (`getPropertiesOfType`, `getTypeOfSymbol`, signatures, mapped/conditional types). tsrs exposes those calls, but its own docs mark type queries as "partial … not byte-compared end-to-end", and Go's output depends on exact type-id ordering. I did not attempt it, so I cannot say whether it would match.

## Why this probably should not replace the Go inspector

- **It is a port of the same compiler.** tsrs is "a function-by-function port of the Go implementation" pinned to `microsoft/TypeScript@3e9236361fa9` (7.1.0-beta, 2026-10-19). Pikku's Go engine embeds typescript-go pinned to a July 2026 revision. Two different upstream revisions would be two sources of drift to keep aligned.
- **No in-process library.** The API is a TypeScript client talking to a Rust server over a pipe. Pikku's Go binary already has the checker in-process, which is why it needs no round trips.
- **Maturity.** Beta (`0.22.0-ts7.1.0-beta`), an "early release" by its README's own words, and pull requests are closed. The README's 100%-compatibility claim sits next to a known-problems list.
- **What it would buy:** a way to run analysis from Node or WASM without shipping a Go binary per platform. That is a real benefit if distribution is the problem; it is not a speed or correctness benefit for Pikku today.

## Running it

```sh
cd experiments/tsrs-inspector
npm install --no-package-lock
# generate the Go inspector's answer key first:
(cd ../../templates/online-shop && npx pikku all)
node --experimental-strip-types src/score.ts ../../templates/online-shop
node --experimental-strip-types src/sweep.ts ../..
```

Requires Node ≥ 22.6 for `--experimental-strip-types`. `tsrs` ships a binary per platform; `linux-arm64-gnu` was used here.

## What this does not show

- Anything about schema generation, `typesMap`, workflows, channels, queues, agents or finalize.
- Behaviour on a project the Go inspector has not already analysed (the scoring needs Go's output as the answer key).
- Whether the tsrs checker agrees with typescript-go on hard types (conditional, mapped, recursive generics). The slices here mostly name types; they do not print them.
