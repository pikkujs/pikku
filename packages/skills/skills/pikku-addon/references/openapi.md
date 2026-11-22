# An addon from an OpenAPI spec

## Build with an OpenAPI addon (the whole sequence)

Run every command in the folder that holds `pikku.config.json` (the app's functions package, usually `packages/functions`). Measured on three hand builds: 8 to 10 tool calls, first file written at call 5 or 6. Do not read the generated addon, `node_modules`, `dist` or `.pikku`: steps 3 and 4 tell you everything the workflow needs.

1. **Find the API** (skip when you were handed a spec path, URL or catalogue name):
   `pikku addons search <one or two words> --openapi` (add `--authless` to keep only APIs that need no key and are free)
   Look for `OpenAPI catalogue:` and lines `<name>  <title>  [<auth>, <price>]  -> pikku addons add <name>`. A line ending `--auth none` is keyless; any other needs the user's credential, so ask for it. Nothing listed: try one other word; still nothing and no name given: `pikku report "<what was searched>"` and ask for a spec URL. An API you were told to use by name can be added without searching.
2. **Generate and wire it, one command:**
   `pikku addons add <catalogue-name | spec-url | spec-path> --auth none [--name <short>]`
   Expect `N operations, auth: none`, then `Created addon at .../packages/addon-<name>`, `updated src/addons/<name>.addon.ts`, `pikku all`, `tsc && pikku dist`, and `Fill these in: variable <NAME>_BASE_URL` (it has the spec's server as its default: nothing to fill). About 10 s. The namespace is `<name>` (the `--name`, else the catalogue name without the domain suffix, else the spec title). A spec URL or path needs `--auth` and `--name`; a catalogue name needs neither. `--auth none` only for an API that really takes no key; anything else, stop and ask. Not ok: a `TypeError` while generating means the spec is malformed, so `pikku report` it with the name; `Directory already exists` means that name is taken, pass another `--name`.
3. **List its operations:** `pikku meta grep <name> <word>` prints `<name>:<fn>` rows ranked by the words, or `pikku meta functions` lists the wired addons. Operations with no `operationId` in the spec are named `get`, `get2`, `listLatest`: the input fields in step 4 say which is which.
4. **Read each function you will call:** `pikku meta functions get <name>:<fn>` (one id per call). It prints the input fields (`?` is optional; `any` or a bare `array` means an enum or a list of enum values from the spec, so type your own input field as a `z.enum([...])` of the values you will use or the compiler will say so) and the output fields (`rates: object`; an empty list means the spec gave no response shape, so the output is `unknown`: take it as input of your own step and narrow it there). Input shown as `fields: []` with `name: null` means no input: pass `null` as the step data, not `{}`.
5. **Write everything in one go** (one function file, one wiring file per kind; schemas are exported constants, never inline, or `pikku check` raises PKU489):
   - `src/functions/<area>/<x>.function.ts`: a `pikkuSessionlessFunc` that only does `rpc.startWorkflow('<workflowName>', data)`, plus any step that is your own logic.
   - `src/wirings/<x>.http.ts`: `wireHTTP({ method: 'post', route: '/<x>', auth: false, func: <starter> })`.
   - `src/wirings/<x>.workflow.ts`: `pikkuWorkflowFunc` exported under the contract name, calling the addon as a step: `await workflow.do('<step name>', '<name>:<fn>', { ...input }, { retries: 3, retryDelay: '10s' })`. Never wrap the addon in your own function that calls `rpc.invoke`; the gate wants the step itself. A branch is a plain `if` on the step result.
   The full shape (starter, wiring, workflow, retries, branch) is in the pikku-workflow skill's `references/addon-workflow-example.md`; the addon call differs only in the `<name>:<fn>` and its input.
6. **Build and type-check:** `pikku all`, then `pikku check` (it runs codegen and `tsc`; `✓ ok` is the target).
7. **Confirm the workflow reads as steps:** `pikku meta workflows get <workflowName>` must list `"rpcName":"<name>:<fn>"` for every addon call. A step typed as a plain function name instead means the call was written wrong.

If a TS2769 "No overload matches ... `keyof WorkflowMap`" names your `<name>:<fn>` step, the argument is wrong, not the step name: re-read step 4 (an enum, `null` input, or a required field you left out).

Files the build leaves: `packages/addon-<name>/` (generated), a line in `packages/functions/package.json` and the lockfile, `src/addons/<name>.addon.ts`, and your three files. Nothing else is needed, and `.env` is local.

## Contents

- Recognising one
- 1 — Look at the spec first
- 2 — Generate, from the app's root
- 3 — Check what was generated
- 4 — Call it from the app
- 5 — Verify
- 6 — Check the spec against the real API
- Then

When you are handed an OpenAPI or Swagger spec — a file, a URL to one, or the
name of one in the registry's catalogue (`https://www.pikku.dev/openapis`) — the
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

`--openapi` takes a path, a URL, or a catalogue name such as
`amazonaws.com:applicationcostprofiler`. A name is anything that is neither a
URL, a path, nor a `.json`/`.yaml` file; it is looked up in the registry
(`--registry`, else `pikku.config.json`'s `registry`, else
`https://api.pikkustudio.app`) and generated from the entry's spec URL. A name
the registry does not know is refused before anything is written. On the
website the page URL is a slug (`amazonaws-com-applicationcostprofiler`); the
name to pass is the one the page's command shows, with its `.` and `:`.

For a catalogue entry inside an app, the short form is
`pikku addons add amazonaws.com:applicationcostprofiler`. It names the addon
after the entry (`amazonaws-applicationcostprofiler`) and takes `--auth` from
what the registry records: `none` for a public API, `user` for OAuth or a key
each user brings, `shared` for a key the app holds, and `user` when the registry
does not know. It prints the mode it picked; pass `--auth` to override it.

A spec published only to signed-in callers
takes the key the way the API reads it: `--openapi-header "NAME: value"`
(repeatable), or in the URL's query string when the API reads it there
(Dolibarr's explorer takes `?DOLAPIKEY=`). A 401 while fetching says which.

The generator warns loudly when the spec has fewer than five operations, or only
auth routes. That is almost always the public half of a spec that shows more
to an authenticated caller — fetch it again with the key, don't build on it.

Keep a copy in `specs/` as the record of what the addon was generated from.

## 2 — Generate, from the folder with `pikku.config.json`

```bash
pikku addons add <path-url-or-catalogue-name> --auth none --name <name>
```

(`pikku new addon <name> --openapi <spec>` is the same generator.) One command. Inside an app it writes `packages/addon-<name>` as
`@pikku/addon-<name>`, then installs it into the app:

- the dependency in the root and the functions `package.json`
- `src/addons/<name>.addon.ts` — `wireAddon` with `auth: true` and an explicit
  `expose` list (every operation in per-user modes, only the `GET`s behind a
  shared secret)
- the auth wiring in `src/auth.ts` for the chosen mode
- `<NAME>_BASE_URL` in `.env`

and then runs install and the addon's build. `--no-install` generates the
package alone.

| Flag                                         | When                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| `--auth user` (default)                      | Each user brings their own credential                                            |
| `--auth shared`                              | One secret behind every user; locally it goes in `.env`                          |
| `--auth none`                                | The API really takes no auth                                                     |
| `--credential apikey\|bearer\|basic\|oauth2` | Override what the spec's `securitySchemes` declares                              |
| `--auth-config <file>`                       | Users sign in with their upstream login, or the spec gets auth wrong             |
| `--tags a,b` / `--include` / `--exclude`     | Keep part of a huge spec: tags, or globs on operationId, `/path`, `METHOD /path` |
| `--mcp`                                      | The operations should also be MCP tools                                          |
| `--camel-case`                               | The API's property names are snake_case and the app's are not                    |

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
- **Fix the addon, not the app**: the schema in the op's `<op>.schemas.ts`, or the
  request shape in `src/<name>-api.service.ts`. Then rebuild it.
- **List each mismatch in `packages/addon-<name>/SPEC-ISSUES.md`**: a title and a
  short description. No credentials or customer data.

Then tell the user in one line: "FYI, the spec deviates from the real API in
N ways: [SPEC-ISSUES.md](…)". Add to the file whenever a later call disagrees
with its schema. Ask before sending it to the API's maintainers, because an issue
on their tracker is a public post.

## Then

Go back to the mode you were building in (`pikku-build`). The addon is a
dependency of the app, not the app: plan changes around what the user wants
to do with the API, and reach the operations through `ref()`.
