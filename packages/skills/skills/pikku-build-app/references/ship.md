# Shipping, and staying Fabric-ready

Read this when the milestones are built and the scenarios are green — it is
the last phase, and nothing in it is needed before then.

## Ship it — open source, no platform

`pikku deploy` builds and ships without any hosted service:

    bunx --bun pikku deploy plan  --provider standalone --runtime bun
    bunx --bun pikku deploy apply --provider standalone --runtime bun

`standalone` comes from the installed `@pikku/deploy-standalone` adapter: it
bundles the project into a single unit and emits either a `bundle.js` you run
with Node, or a self-contained executable compiled with `bun build --compile`.
`cloudflare` (the default) and `aws` are the other providers — read the
`pikku-deploy-cloudflare` skill before using it, as it ships the handler
factories the deploy codegen expects, and hand-rolling an `ExportedHandler` is
how a worker deploy fails at runtime instead of at build.

Always run `plan` before `apply`, and read it. It names what will be created,
updated and deleted — the deletions are the reason to look.

The frontends build independently (`bun run build` at the root builds every
workspace). Serve each behind its own hostname, and put the API behind `/api` on
**all of them**, mirroring the Vite proxy from the multi-app reference: `/api/auth/*` keeps its
prefix, everything else under `/api/*` reaches the pikku server unprefixed. Get
this wrong and sign-in fails on one app only, which is a miserable thing to debug.

Before shipping, run the full gate:

    bunx --bun pikku all --tsc-summary --fail-on-warn
    bunx --bun pikku validate
    bunx --bun pikku knowledge validate
    bunx --bun pikku scenario run local --spawn --coverage

Keep `--coverage` on the release run even though you have been reading it per
milestone (§7a). Each of those readings only covered the functions that
milestone added; this is the first time the whole surface is measured at once,
and it is where a function orphaned by a later refactor shows up.

`pikku all --security --fail-on-error` additionally runs the data-classification
lint over function return types, catching a `Pii`/`Secret` field that leaks
through an exposed function. Expensive, so run it before a release rather than on
every save — but run it.

## Staying Fabric-ready

Everything above is open source. This is the contract that keeps
`pikku fabric init` a one-command import later, instead of a migration.

- **`pikkufabric.config.json` describes reality.** Every app has an entry with
  the right `cwd`, `port`, `kind` and `dev.command`; exactly one is `primary`;
  `serves` and `personas` name real personas from the personas section. Leave `projectId` as
  `__PROJECT_ID__` — that placeholder means "unlinked", and `fabric init` writes
  the real one. Do not invent a value to make it look configured.
- **One `definePersonas` call**, every persona reachable through exactly one
  frontend. Fabric materialises these as its virtual users; a persona nobody
  serves imports as a person with no way in.
- **`knowledge/` passes `validate`, with every milestone at `built`.** This is
  the part Fabric itself reads and continues from.
- **Every milestone has a passing scenario**, including its refusals.
- **Permissions live in the `permissions` field**, not in function bodies and not
  in the frontends. A check hidden in a component does not survive a new client.
- **Nothing hardcodes a host, a port, or a `process.env` read inside a
  function.** Secrets go through `defineSecret` and the injected `secrets`
  service. This is the single most common reason a working local project fails
  its first deploy — on any platform.
- **Generated files stay generated.** No hand edits to `.pikku/`, `*.gen.*`, or
  the SDK.
- **`pikku validate` is clean**, and `pikku all` has no critical diagnostics.

What you deliberately do NOT do: run any `pikku fabric` subcommand, add a card,
or link a project. None of it is needed to build, test, critique, or deploy — it
is needed the day the user wants Fabric to host and build it, and on that day, if
this section holds, that day is one command long.
