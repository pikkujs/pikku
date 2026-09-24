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

## 1 — Look at the spec first

`--openapi` takes a path or a URL. A spec published only to signed-in callers
takes the key the way the API reads it: `--openapi-header "NAME: value"`
(repeatable), or in the URL's query string when the API reads it there
(Dolibarr's explorer takes `?DOLAPIKEY=`). A 401 while fetching says which.

The generator warns loudly when the spec has fewer than five operations, or only
auth routes. That is almost always the public half of a spec that shows more
to an authenticated caller — fetch it again with the key, don't build on it.

Keep a copy in `specs/` as the record of what the addon was generated from.

## 2 — Generate, from the app's root

```bash
bunx --bun pikku new addon <name> --openapi <path-or-url>
```

One command. Inside an app it writes `packages/addon-<name>` as
`@pikku/addon-<name>`, then installs it into the app:

- the dependency in the root and the functions `package.json`
- `src/addons/<name>.addon.ts` — `wireAddon` with `auth: true` and an explicit
  `expose` list (every operation in per-user modes, only the `GET`s behind a
  shared secret)
- the auth wiring in `src/auth.ts` for the chosen mode
- `<NAME>_BASE_URL` in `.env`

and then runs install and the addon's build. `--no-install` generates the
package alone.

| Flag                                  | When                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `--auth user` (default)               | Each user brings their own credential                                        |
| `--auth shared`                       | One secret behind every user; set it with `pikku secrets`                    |
| `--auth none`                         | The API really takes no auth                                                 |
| `--credential apikey\|bearer\|basic\|oauth2` | Override what the spec's `securitySchemes` declares                  |
| `--auth-config <file>`                | Users sign in with their upstream login, or the spec gets auth wrong         |
| `--tags a,b` / `--include` / `--exclude` | Keep part of a huge spec: tags, or globs on operationId, `/path`, `METHOD /path` |
| `--mcp`                               | The operations should also be MCP tools                                      |
| `--camel-case`                        | The API's property names are snake_case and the app's are not                |

The mode comes from the spec unless a flag says otherwise. A spec with no
machine-readable auth is refused rather than guessed: pass one of the flags the
error names. Which mode fits, and the auth-config format, are in the
`pikku-build` skill's `references/openapi.md`.

## 3 — Check what was generated

```
packages/addon-<name>/
├── <name>.svg                    # placeholder icon; replace with the real one
├── src/<name>-api.service.ts     # one fetch wrapper, reads <NAME>_BASE_URL
├── src/<name>.variable.ts        # <NAME>_BASE_URL: z.string().url(), the first server as default
├── src/functions/<op>.function.ts
├── src/functions/<op>.schemas.ts # the op's zod schemas — never import #pikku here
└── src/index.ts                  # re-exports every function
```

An operation whose spec gives no response, or one too vague to validate
against, outputs `z.unknown()`. Tighten it in `<op>.schemas.ts` once §6 shows
what the API really returns.

An upstream 401 on a per-user credential throws `CredentialRejectedError`
(403, `reauth: 'sign-in' | 'connect'`); a UI shows the matching screen again
rather than a generic error.

## 4 — Call it from the app

Operations are reached by reference — `ref('<name>:<operationFn>')` in a
workflow, agent tool or HTTP wiring — the same way as any other addon. See
"Consuming an Addon" in the skill. An exposed operation is also callable from
the frontend at `POST /rpc/<name>:<operationFn>` with a body of
`{ "data": { … } }`, as the signed-in user.

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

Specs are often wrong, and the generated schemas repeat every mistake. Before
building on the addon:

- **Call the reads you can.** The `GET`s the credential can reach, following ids
  from lists into retrieves. Writes only if the user opts in.
- **Fix the addon, not the app**: the schema in the op's function file, or the
  request shape in `src/<name>-api.service.ts`. Then rebuild it.
- **List each mismatch in `packages/addon-<name>/SPEC-ISSUES.md`**: a title and a
  short description. No credentials or customer data.

Then tell the user in one line: "FYI, the spec deviates from the real API in
N ways: [SPEC-ISSUES.md](…)". Add to the file whenever a later call disagrees
with its schema. Ask before sending it to the API's maintainers, because an issue
on their tracker is a public post.

## Then

Go back to the mode you were building in (`pikku-build`). The addon is a
dependency of the app, not the app: plan milestones around what the user wants
to do with the API, and reach the operations through `ref()`.
