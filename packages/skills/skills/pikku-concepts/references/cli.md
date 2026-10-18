# The Pikku CLI commands

`pikku doc` is the API surface — the `#pikku/*` exports. It does **not** list
commands, so this table is where they exist. `pikku <command> --help` has the
flags; the "Read" column is the skill that teaches the thing, where one does.

**Generating**

| Command                                    | What it does                                         | Read                          |
| ------------------------------------------ | ---------------------------------------------------- | ----------------------------- |
| `all`                                      | Everything: types, schemas, wirings, clients         | this skill                    |
| `bootstrap`                                | Type files only (the setup phase)                    | this skill                    |
| `schemas`                                  | JSON Schemas for function input/output types         | this skill                    |
| `fetch` / `websocket` / `rpc` / `realtime` | One client each, when you do not want `all`          | `pikku-wiring`, `pikku-react` |
| `react-query` / `tanstack-start`           | React Query hooks; the TanStack Start `makeApi` shim | `pikku-react`                 |
| `queue-service`                            | The queue service wrapper                            | `pikku-wiring`                |
| `openapi`                                  | An OpenAPI spec from the HTTP routes                 | —                             |
| `nextjs`                                   | Next.js backend and HTTP wrappers                    | `pikku-deploy`                |
| `new`                                      | Scaffold a function or wiring                        | `pikku-wiring`                |
| `enable`                                   | Turn a Pikku feature on                              | `pikku-build`                 |
| `import`                                   | Import workflows from another system                 | `pikku-n8n-import`            |

**Running**

| Command                           | What it does                                                                   | Read                                         |
| --------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| `dev`                             | Local dev server, all services wired, watch + HMR                              | `pikku-build`                                |
| `serve`                           | Bundled bun/node runner — no watch, no codegen                                 | `pikku-deploy`                               |
| `watch`                           | Regenerate on file change, without a server                                    | —                                            |
| `scenario list\|run`              | Scenarios as e2e tests and health checks                                       | `pikku-scenario`                             |
| `virtual-user run`                | A declared virtual user, model-driven, against a stage                         | `pikku-scenario`, virtual-user-run reference |
| `virtual-user list\|sync\|secret` | Who is declared; what an environment will provision; minting their credentials | `pikku-scenario`, virtual-user-run reference |
| `db`                              | Local development database                                                     | `pikku-kysely`                               |

**Inspecting and evolving**

| Command                | What it does                                                            | Read                         |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| `doc`                  | The installed API surface                                               | this skill                   |
| `meta` / `info`        | What the project declares, machine- and human-readable                  | `pikku-meta`                 |
| `validate`             | Every check that applies — app structure, an addon's published file set | `pikku-build`, `pikku-addon` |
| `versions` / `release` | Contract hashes, breaking-change detection, versioned releases          | `pikku-meta`                 |
| `audit` / `update`     | Advisories; which `@pikku/*` can move and what peers that needs         | `pikku-meta`                 |
| `scopes` / `roles`     | Declared authorization scopes; roles from `defineSystemRole`            | `pikku-auth`                 |
| `knowledge`            | The knowledge base — what this app is, in its users' language           | `pikku-knowledge`            |
| `emails`               | Email template generation                                               | `pikku-emails`               |

**Shipping, and the CLI itself**

| Command                       | What it does                                                                                                                                   | Read           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `deploy`                      | Deploy to cloud infrastructure                                                                                                                 | `pikku-deploy` |
| `binary`                      | Compile an entrypoint to a native binary (`bun build --compile`)                                                                               | —              |
| `dist`                        | Copy what `tsc` cannot emit — `.gen.json` meta, hand-authored `.d.ts` — into the build output. Run it after `tsc`, as a package's build script | —              |
| `login` / `logout` / `whoami` | The CLI's session against a pikku server                                                                                                       | —              |
| `skills`                      | Install these skills into an agent (Claude Code, opencode, pi)                                                                                 | —              |

`-c/--config`, `--log-level`, `--json` and the filter flags are **global
options**, not commands — they attach to the generating commands above.

A dash means no skill covers it beyond this line. `--help` is then the whole of
it — which is a reason to read `--help` rather than to assume the command does
what its name suggests.
