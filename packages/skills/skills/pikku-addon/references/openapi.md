# An addon from an OpenAPI spec

When you are handed an OpenAPI or Swagger spec — a file, or a URL to one — the
API it describes becomes an addon: one function per operation, each with its
input and output schemas, behind one service that makes the HTTP calls. Say so
before starting ("This is an OpenAPI spec — I'll turn it into an addon first"),
then generate it. Don't hand-write the functions, and don't ask which
operations to keep: generate the whole spec, however large.

## Recognising one

A JSON or YAML document with a top-level `openapi` key (3.x) or `swagger` key
(2.0), and a `paths` object. A URL ending in `openapi.json`, `swagger.json` or
`.yaml` is almost always one; open it and check the key before generating.

## 1 — Put the spec in the repo

`--openapi` reads a local path, not a URL. Download it to `specs/`, where it
stays as the record of what the addon was generated from:

```bash
mkdir -p specs
curl -fsSL <url> -o specs/<name>.openapi.json
```

## 2 — Generate

Inside an app, the addon is a workspace package under `packages/`:

```bash
bunx --bun pikku new addon <name> --openapi specs/<name>.openapi.json --dir packages
```

This writes `packages/addon-<name>` as `@pikku/addon-<name>`, installs it and
builds it. Inside a workspace the generated test app depends on it as
`workspace:*`, so nothing is published.

| Flag                          | When                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `--credential apikey\|bearer` | The spec's `securitySchemes` is an API key or a bearer token — each user brings their own |
| `--credential oauth2`         | The spec's `securitySchemes` is OAuth2                                                    |
| `--auth-config <file>`        | The spec gets auth wrong or leaves it out: a custom header, a delegated login endpoint    |
| `--mcp`                       | The operations should also be MCP tools                                                   |
| `--camel-case`                | The API's property names are snake_case and the app's are not                             |

Read the spec's `securitySchemes` to pick the credential. Leave the flag off
only when the API really takes no auth.

## 3 — Check what was generated

```
packages/addon-<name>/
├── src/<name>-api.service.ts     # one fetch wrapper, reads <NAME>_BASE_URL
├── src/<name>.variable.ts        # <NAME>_BASE_URL, an enum of the spec's servers
├── src/functions/<op>.function.ts
├── src/functions/<op>.schemas.ts # the op's zod schemas — never import #pikku here
└── src/index.ts                  # re-exports every function
```

`<NAME>_BASE_URL` is an enum of the spec's `servers`. When those are
placeholders or a per-tenant host (`https://{tenant}.example.com`, or a server
list that is only an example), change its schema in `src/<name>.variable.ts`
to `z.string().url()` so each deployment sets its own.

## 4 — Wire it into the app

```typescript
// src/addons.ts
import { wireAddon } from '#pikku/addon'

wireAddon({ name: '<name>', package: '@pikku/addon-<name>' })
```

Then call operations by reference — `ref('<name>:<operationFn>')` in a
workflow, agent tool or HTTP wiring — the same way as any other addon. See
"Consuming an Addon" in the skill.

## 5 — Verify

```bash
bunx --bun pikku all
bunx --bun pikku validate
```

`Could not convert Zod schema … Cannot find module …/dist/.pikku/…` means a
schema is declared in a file that imports `#pikku`. The generator never does
that, so a hand edit moved it — put it back in `<op>.schemas.ts`.

`pikku validate` reports a `skewed-type-identity` error (and `pikku all` warns
`[PKU719]`) when the CLI and the app resolve different copies of `zod` or
another shared package. Codegen then reads the app's
schemas with the wrong copy and fails on schemas that are correct. Pin one
version for the whole install, as the finding says, and reinstall.

## 6 — Check the spec against the real API

A spec is a claim about the API, and it is often wrong: a list typed as
`string[]` that returns objects, a body wrapped in a key the server never reads,
a 404 where an empty list should be, flags typed as booleans that arrive as
`"0"`. The generated schemas repeat every one of those mistakes, so check the
spec before building on it:

- **Sweep the reads.** Call every `GET` the credential can reach, following
  ids from list results into the retrieve operations, and compare each
  response with the spec's declared response: its shape, types, required
  fields and status codes. Never sweep writes. A write is checked the first
  time the app uses it, against a record made for the purpose.
- **Fix the addon, not the app.** Correct the schema in
  `src/functions/<op>.schemas.ts`, or the request shape in
  `src/<name>-api.service.ts`, then rebuild the addon. A cast or a re-parse in
  an app function hides the defect from every other consumer.
- **Record every mismatch in `packages/addon-<name>/SPEC-ISSUES.md`.** It is
  written for the API's maintainers, so they can fix the spec. For each one,
  give the operation (`GET /thirdparties`), what the spec says, what the API
  does, a minimal request and response as evidence, and the fix applied in the
  addon. Strip credentials, tokens and real customer data from the evidence.
  The file is also the list of edits to reapply if the addon is ever
  regenerated from a new spec.

Keep adding to it for the rest of the build, whenever a call disagrees with its
schema. At hand-over, show it to the user and ask before sending it anywhere.
An issue on the API's tracker is a public post.

## Then

Go back to the mode you were building in (`pikku-build`). The addon is a
dependency of the app, not the app: plan milestones around what the user wants
to do with the API, and reach the operations through `ref()`.
