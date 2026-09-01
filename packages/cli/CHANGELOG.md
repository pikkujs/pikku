## 0.12.129

### Patch Changes

- 8852a75: Register an agent invoked from a function body in the calling deployment unit.

  `runAgent('houseAssistant', ...)` and `rpc.agent.run('houseAssistant', ...)` resolve against the in-process agent registry, but the deploy analyzer only ever put an agent's registration in its own `agent-*` unit. A function calling one landed in a separate unit whose bootstrap never registered it, so the deployed worker threw `AI agent not found: houseAssistant`.

  The inspector now records a string-literal agent name passed to `runAgent` / `streamAgent` / `rpc.agent.run` / `rpc.agent.stream` in a function body under `agents.invokedAgentsByFile`, mirroring what it already does for `rpc.invoke` targets. The analyzer carries those names on the calling unit as `invokedAgents` and adds the `ai-model` / `ai-storage` service requirements, and per-unit codegen puts the agent — and its tools — into that unit's filter names so its wiring is generated there too. A dynamic (template-literal) agent name is warned about, as it is for `rpc.invoke`.

- acca415: Consolidate the skills corpus from 63 skills to 21.

  The corpus had grown one skill per package and one per transport, so an agent's
  first decision was a routing problem — which of ten wiring skills, which of five
  auth skills — before it could reach anything that helped. Most of what those
  skills carried was signatures and option keys, which `pikku doc` computes from
  the compiler and cannot go stale.

  Each family collapses to one chooser skill plus per-topic `references/*.md`. The
  chooser answers the question the compiler cannot: which thing to pick, what
  differs between the options, and what goes wrong silently. The families:

  - `pikku-deploy` — eight runtime skills
  - `pikku-service-backends` — six adapter skills, organised by the core interface
    they implement rather than by vendor
  - `pikku-wiring` — ten transport skills
  - `pikku-auth` — five skills that all answered "who is this and may they",
    fronted by the authentication-versus-authorization distinction
  - `pikku-services` — services, config, audit and logging
  - `pikku-agent` — the agent, its runner and the voice middlewares
  - `pikku-react` and `pikku-i18n` — the client and localisation families
  - `pikku-meta` — project metadata, contract versioning and the dependency audit
  - `pikku-build` — the three build modes, feature work and post-clone cleanup
  - `pikku-software-archaeology` and `pikku-fabric` — each gains its second phase

  The doc-surface routing table (`LEAF_EDITORIAL`) points at the merged skills, and
  the fabric install group is back to what it names: skills about Fabric.

- Updated dependencies [9015400]
- Updated dependencies [f4e2e89]
- Updated dependencies [8852a75]
- Updated dependencies [acca415]
  - @pikku/inspector@0.12.71
  - @pikku/core@0.12.102
  - @pikku/skills@0.12.23
  - @pikku/deploy@0.12.3

## 0.12.128

### Patch Changes

- c0940a1: `pikku new addon` now installs and builds the addon it generates.

  The generated package exports `./dist/...`, which is what an installed consumer
  resolves and what the app's own `pikku-bootstrap.gen.ts` imports. Until `build`
  had run, that path did not exist: the app failed at boot with PKU340 and an
  ERR_MODULE_NOT_FOUND on a dist file nobody had written, and every
  `ref('<addon>:…')` resolved to nothing. Nothing about the generated files showed
  the problem, so a generated addon looked complete and was dead at runtime.

  Pass `--no-build` to keep the previous write-only behaviour.

- e92e30b: Print a CLI failure as its message, not as a JS stack trace.

  Every error that reached the top of `executeCLI` was logged with `console.error('Error:', error)`, which node renders as the full stack — and prefixed it a second time, so a refusal read `Error: Error: Persona 'guest' missing guest…` above ten frames of pikku internals. A `PikkuFetchError` was worse: node inspects an error's own properties, so the whole `Response` came out with it, headers and body stream included, to say `502`.

  An expected failure — a `PikkuError`, or anything carrying `expected: true` — now prints its message alone, and a fetch failure prints `502 Bad Gateway from <url>` without touching the response. Anything else keeps its stack, because a `TypeError` with its frames removed is undiagnosable. `--verbose`/`-v`, or `PIKKU_DEBUG=1` where the flag cannot be typed, adds the stack back to an expected failure.

  The refusals behind the examples — a persona whose roles have drifted, a sign-in the stage rejected — are raised as `PikkuError` so they are classed as deliberate.

- 3079f44: Give `pikku dev` a credential store.

  Wiring a `credentialService` is the deployment's job — the values are per-user
  secrets, and where they are encrypted and who holds the key is a decision only
  the host can make. But that left `pikku dev` with none at all: `credentialService`
  was `undefined`, so an addon imported with `--auth per-user` or `--auth delegated`
  could not be exercised locally. The delegated sign-in a project is told to wire
  threw on its first call, and projects were reaching for their own credential
  tables to get past it.

  `pikku dev` now builds a `LocalCredentialService` alongside the rest of its
  in-memory services — the queue, the trigger service, the workflow service — and
  hands it to `createSingletonServices` as an existing service. A project that
  wants a real store overrides it there the same way it overrides any of the
  others: `existingServices.credentialService ?? new OwnCredentialService()`.

- 5bb006f: Add `pikku fabric secrets delete <name>`.

  Removing one secret from a stage had no lever. The only thing close was
  `secrets rotate`, which retires the stage's sealing key and so takes every
  secret on the stage down with it — an enormous blast radius for wanting one
  name gone.

  `secrets delete` calls the `deleteStageSecret` RPC, which removes the single
  named secret and leaves the sealing key and the stage's other secrets alone.
  It confirms first unless `--force` is passed: fabric holds only the public half
  of the stage keypair, so it cannot read a sealed value back and cannot restore
  one — the plaintext has to be supplied again. Deployed units keep serving the
  old value until the stage is republished, so the run that does so is reported
  when the delete triggers one.

- e15f5a9: Add `pikku dist`, and use it as the generated addon's build step.

  `tsc` compiles the `.ts` under the pikku out dir, but it never carries the
  `*.gen.json` meta written beside them, and it never re-emits a hand-authored
  `.d.ts`. Both are needed at runtime — `MetaService` opens the meta off disk by
  path — so a package that ships only tsc's output answers every meta lookup with
  nothing.

  Every generated addon papered over this with `tsc && cp -r .pikku types dist/`,
  which copied two whole directories: it dragged 52 raw `.ts` sources into the
  published output alongside the compiled ones, and needed a POSIX shell. Since
  the script comes from the CLI, every project carried the same line.

  `pikku dist` copies exactly what tsc could not emit, to where tsc would have put
  it, reading the layout from `pikku.config.json` and the destination from the
  tsconfig's `outDir` (or `--dist-dir`). The generated build script is now
  `tsc && pikku dist`.

- 4d0a548: Provision the declared personas from the fabric plugin instead of the server lifecycle.

  `provisionPersonas` was documented as a call an app makes from `pikkuServerLifecycle`'s `afterStart`. That hook is invoked by `pikku serve` and `pikku dev` and by nothing else — no deploy runtime calls it — so on any stage deployed to Workers or a serverless target the provisioning never ran, and every persona signed in holding no roles.

  `pikkuFabric` now takes `personas`. The operator endpoint resolves the address the caller wants to act as; a miss provisions the declaration and looks again. On a stage that already holds the persona that is one query, and the pass only runs when there is genuinely something absent to create.

  Sign-in no longer creates accounts of its own. `OperatorSignInOptions.createMissing` and `PIKKU_PERSONA_CREATE_MISSING` are gone, and an address no declaration claims stays a 404 however many times it is asked for. `provisionPersonas` is no longer exported — the plugin is the only caller.

  `pikku persona sync <environment>` is unchanged: it still reports who an environment will provision and why anyone was skipped, and still writes nothing.

- Updated dependencies [e92e30b]
- Updated dependencies [14059e0]
- Updated dependencies [781797c]
- Updated dependencies [ccab6ed]
- Updated dependencies [4d0a548]
- Updated dependencies [5ace170]
  - @pikku/core@0.12.101
  - @pikku/better-auth@0.12.35
  - @pikku/skills@0.12.22

## 0.12.127

### Patch Changes

- 77ae071: `pikku fabric report` sends a finding — something about pikku that cost an agent time — to fabric. It needs a login but no linked project: a finding is about the framework rather than about anyone's project, and the reports worth having most come from checkouts that have nothing to name.

  The finding can be given as JSON on stdin (`--stdin`) instead of as flags. Half the fields are prose, and prose carries apostrophes, quotes, backticks and newlines — every one a shell metacharacter before it is a character in a sentence — so an error message pasted into `--error` used to break the command at its first newline. The same schema validates either path.

  Nothing is written to the repo, so nothing goes stale on an abandoned branch, and the terminal prints exactly what left the machine. Reporting never fails a build.

  A finding that cannot be sent is held in `~/.fabric/findings` rather than dropped: logged out, unlinked, or fabric unreachable are the states a finding is most likely to be describing, and a scaffold that never got far enough to log in is exactly the thing worth hearing about. The queue drains on the next report that succeeds, keeps the project each finding was filed against, and is bounded at 100. `pikku fabric findings list`, `flush` and `clear` inspect and control it.

  The resolved `@pikku/*` versions are read off the installed tree rather than out of `package.json`, since a range says nothing about what actually ran. A skewed tree and a package resolving through a workspace or link are both flagged, because either is a reason to read the finding differently.

  The `pikku-feature` skill now tells an agent when to file one: work around it first, investigate only when there is no workaround, report at the depth already reached, and never patch pikku itself from inside a project that is using it.

- 32d1280: Prefix the better-auth plugin factories with `pikku`: `pikkuActor`, `pikkuBan`,
  `pikkuFabric`, `pikkuDelegatedAuth` and `pikkuCredentialOAuth`.

  A `betterAuth({ plugins: [...] })` array mixes this package's plugins with
  better-auth's own, and until now nothing at the call site told them apart —
  `plugins: [actor(...), ban(), fabric(...), organization()]` reads as four
  plugins from one place when only the last is better-auth's. The prefix says
  which package a plugin came from where it is actually wired.

  The old names are still exported as deprecated aliases bound to the same
  functions, so no import has to change. Nothing about the plugins themselves
  moved: the `id` each registers under — `pikku-ban`, `actor`, `fabric`,
  `delegated-auth`, `credential-oauth` — is unchanged, so no deployed database or
  session is affected.

  The pieces that read a plugin's _export_ name rather than its id accept both:
  `PLUGIN_REGISTRY` is keyed under the prefixed and the bare name, and the
  `pikku validate` ban/actor checks and the `scaffold.userAdmin` ban check count
  either spelling as wired. Their messages now point at the new names.

- a0ed1e8: Derive a persona's session and operator paths from the mount its sign-in path names.

  Both `sessionRoles()` and the Fabric operator handshake asked for a fixed
  `/auth/…` no matter where auth was mounted. An app serving better-auth under
  `/api/auth` while keeping its RPCs at the root cannot put the mount in
  `apiUrl`, so it moves `signInPath` — and the other two stayed behind.

  For the session read that meant a 404, which returns `null`, which means "this
  stage does not report roles": every `pikku persona run` on such an app warned
  "running unverified" and lost the one thing that tells a permissions finding
  from seed drift. For the operator handshake it was worse — `HttpPersona`
  reused the _actor_ path verbatim, so an operator token was posted to the actor
  endpoint and came back as a validation error about a missing email and secret,
  which reads like a broken persona rather than a wrong URL. The browser provider
  had the same fixed default.

  All three now follow `signInPath`, and `environments[].sessionPath` in
  pikku.config.json overrides the session read for a stage that reports it
  elsewhere.

- Updated dependencies [77ae071]
- Updated dependencies [32d1280]
- Updated dependencies [a0ed1e8]
  - @pikku/skills@0.12.21
  - @pikku/better-auth@0.12.34
  - @pikku/inspector@0.12.69
  - @pikku/core@0.12.100
  - @pikku/playwright@0.12.81

## 0.12.126

### Patch Changes

- ee9da9e: A Postgres `CHECK (col IN (…))` constraint now generates a string-literal union, the way a native enum and the SQLite equivalent already did. SQL comments inside the value list are ignored rather than corrupting the union parsed out of it.
- 7a15c9c: An actor credential is one persona's, not everyone's

  `SCENARIO_ACTOR_SECRET` was a skeleton key. Anyone holding it could post any
  `actor: true` address to `/auth/sign-in/actor` and get that persona's session —
  including the `admin` persona, which provisioning grants real admin. The browser
  switcher held it too, baked into the dev bundle as `VITE_SCENARIO_ACTOR_SECRET`,
  so "the reviewer can sign in as each kind of user" and "the reviewer's bundle is
  entitled to every persona" were the same fact.

  It is now a root that credentials derive from, never one that is presented:

  ```ts
  deriveActorSecret(root, email) // HKDF-expanded HMAC-SHA256 over the address
  ```

  The endpoint re-derives the expected value for whichever address is signing in
  and compares, so nothing is stored or looked up, a credential minted for one
  persona is refused for every other, and rotating the root invalidates all of
  them at once. The root itself is no longer a valid credential, and a root under
  32 characters refuses the endpoint rather than deriving weak credentials from
  it — the server log says why, the client is not told.

  What that buys, in the places that used to need the whole key:

  - **`pikku dev`** mints one credential per declared persona into
    `VITE_DEV_ACTOR_SECRETS` and no longer writes `VITE_SCENARIO_ACTOR_SECRET` at
    all. The root stays on the server.
  - **`pikku persona secret <id>`** mints them for anything else, and a run given
    `PIKKU_PERSONA_SECRETS=id=secret,…` can sign in as those personas and no
    others — asking for one outside the list throws naming the persona instead of
    falling back to the root.

  `useDevActors()` and `<DevActorSwitcher />` take `secrets` (one per address)
  where they took `secret`, and an actor with no credential is no longer offered
  rather than rendering a row that 401s. `HttpPersonasConfig.secret` and the
  Playwright provider's `secret` additionally accept a resolver, which is how a
  partially-credentialled run is expressed.

- ee9da9e: `pikku fabric validate` now fails a project whose generated `coercion.gen.ts` declares coercions that no Kysely instance applies, and the generated file itself says what has to consume it. An unwired coercion map cannot fail locally and 500s on the first deployed request.
- ee9da9e: `pikku db reset` and `fabric validate` stop treating an absent dev seed as an empty database

  The seed step reported a conclusion about the database rather than about
  itself: with no `db/sqlite-dev-seed.sql`, reset finished with `database is
empty` even when a migration had just populated it, and `--no-seed` said the
  same. Both lines now name the step — `no dev seed applied (…)` and `--no-seed,
skipping the dev seed`.

  `fabric validate` raised `dev-seed-sql-missing` at **error** severity, so a
  project that had correctly moved its rows into a migration — where anything a
  deployed stage needs has to live, since Fabric never replays the dev seed — was
  failed for no longer carrying a file it deliberately does not need. It is now
  `info`, and the hint says what the file is for instead of advising an idempotent
  form the framework tells you not to reach for.

- ee9da9e: The Bun deploy bundler now keeps names, matching the esbuild one, so a deployed error answers with its real name instead of the bundler's identifier for it — `PermissionDeniedError`, not `cn`. An error's `name` is its constructor's name, so a bundler you configure yourself has to preserve names too.
- ee9da9e: `fabric deploy apply` reports the commit the deployment holds, not the one requested

  With a deployment already parked at `suspended` for the branch,
  `deployByStageKind` attaches to that plan — pinned to whatever commit it was
  cut at — rather than creating a new one. The CLI echoed back the sha it had
  been asked for, so `apply` printed

  ```
  status: suspended   sha: 599439e6
  ```

  for a deployment `deploy list` showed pinned to `5bfe84c`, five commits above
  it. `--ref` did not help; the argument was echoed too. The only symptom was a
  correct-looking line of output, and the failure mode is a rollback that
  silently does not roll back.

  The ref is now read back off the deployment, and a disagreement between what
  was asked for and what is held aborts with both shas and the deployment id
  named, rather than continuing under the wrong one.

- ee9da9e: The hardcoded-copy check stops flagging a feature's own name

  Two rules disagreed. `runScenarioFileChecks` requires every `pikkuFeature` to
  live in a `*.scenario.ts`, and moving one there is what put it in front of the
  hardcoded-copy check — which then flagged the feature's own `name` because the
  app catalogue happens to hold the same word:

  ```
  name: 'Downloads',   → ✗ "Downloads" → nav__downloads | downloads__title
  ```

  Complying with the first rule created violations of the second, and the advice
  — read the string from the app catalogue — would tie the Console's language to
  the product's. `name`, `description` and `template` declared directly on a
  `pikkuFeature`, `pikkuScenario` or `pikkuScenarioStep` are Console meta and are
  now skipped. A `name` nested deeper — `getByRole('button', { name: 'Speichern'
})` — is a selector built out of UI copy and is still caught.

- 967d1de: Rename the `locale` field in `pikku.config.json` to `metaLocale`. It sets the language of the meta the Console renders back to your team, not the language your app speaks to its users — a config that still says `locale` now fails with an error saying where the value moved.
- ee9da9e: `fabric` stage commands default to the only stage, and say what is missing when they cannot

  `pikku fabric secrets list` with one stage deployed failed with `No stage for
branch "undefined". Existing: main` — an error interpolating the missing
  argument's value directly above a line naming the single stage it could have
  used.

  With exactly one stage there is nothing to disambiguate, so `secrets
list/set/rotate` and `variables get/set` now use it. With several, the error
  says `--branch is required` and lists them; with none, it says nothing is
  deployed yet. Each command also names the stage it acted on rather than echoing
  the argument, and `secrets rotate` resolves before it refuses, so the one
  message standing between a typo and unreadable secrets names the stage that
  would actually be rotated.

- ee9da9e: the surface gate measures the surface it actually ships

  The doc-quality gate went in with ceilings of 112, 823 and 10 beside a surface
  that measured 160, 1210 and 15, so it never passed on any build. Re-baselined to
  the real measurements, and the key-documentation floor earned its way from 76%
  to 79% by documenting what a caller has to put in `defineSecret`, the gateway
  message shapes, and the scorer and judge configs.

- ee9da9e: `fabric validate` no longer reads comment prose as an import

  The undeclared-dependency check matched `from "…"` in raw file text, so any
  sentence putting a quoted phrase after the word _from_ became a phantom
  dependency — at error severity, against the app, with nothing naming the file
  it came from:

  ```
  ✗  @project/app imports undeclared package(s): is fine — the deploy bundle cannot resolve them
  ```

  The source is now scanned with comments blanked (a new `blankComments` keeps
  the text the same length so offsets still line up), and the fix hint names the
  file and line each missing package was first imported at.

- 2e7adcd: Give a virtual user run a trigger so it survives a per-function deploy.

  `scaffold.virtualUser` dispatched `executeVirtualUserRun` with an unawaited
  `rpc.invoke`. That is a real dispatch in one process and nothing at all under a
  deployment that puts each function in its own unit: the run function is
  sessionless, unexposed and wired to nothing, so it is never emitted as a unit,
  the RPC resolves to nothing, and the rejection is swallowed by the `catch` that
  exists to stop an unhandled rejection taking the process down. The run parks at
  `running` with zero steps and no error anywhere.

  The scaffold now wires it to a `pikku-virtual-user-runs` queue worker, which is
  what puts it in the deploy manifest, and `runVirtualUser` enqueues onto that
  queue at `attempts: 1` — a redelivery would be a second different outing writing
  into a record that already has an outcome. A project with no queue service keeps
  the in-process dispatch, which is correct for the one process it runs in.

- Updated dependencies [ee9da9e]
- Updated dependencies [7a15c9c]
- Updated dependencies [ee9da9e]
- Updated dependencies [7d641f3]
- Updated dependencies [ee9da9e]
- Updated dependencies [ee9da9e]
- Updated dependencies [ee9da9e]
  - @pikku/core@0.12.99
  - @pikku/better-auth@0.12.33
  - @pikku/playwright@0.12.80
  - @pikku/skills@0.12.20
  - @pikku/inspector@0.12.68

## 0.12.125

### Patch Changes

- b951f04: Add `pikku fabric projects`, listing the projects in your organization with their ids. The fabric API already exposed `fabricCliProjects`; no command called it, so a project's id was reachable only through the web console — and a checkout whose `pikkufabric.config.json` still held the `__PROJECT_ID__` placeholder could run no other fabric command to recover it. `fabric init` was no help either: it only creates, so against a project that already exists it fails with a 409 carrying no id. Projects matching the local config are marked.
- 80eb5c0: Generate a desktop shell from `pikku deploy apply --desktop`

  `pikku deploy apply --provider standalone --runtime bun --desktop` now emits a
  `src-tauri/` crate that ships the compiled binary as a sidecar and opens a
  window on the server's own HTTP origin, so cookies, CORS and OAuth behave
  exactly as they do in a browser. Regeneration is idempotent and leaves an
  edited file alone rather than overwriting it.

  `--desktop-url https://app.example.com` builds the other shape: a shell that
  points at an already-deployed server. Nothing is bundled — no sidecar, no
  binary, and so no bun runtime to compile one — and the window is declared in
  `tauri.conf.json` rather than opened from Rust, because the origin is known up
  front. The url can also live in `pikku.config.json` as `deploy.desktop.url`,
  alongside `deploy.desktop.identifier`.

  Supporting changes: `SERVER_READY_MARKER` moved to `@pikku/deploy` (the CLI
  re-exports it from its old path), both HTTP runtimes expose the port they
  actually bound so `--port 0` reports a real port, and the generated server
  entry exits when its parent process goes away.

- 80eb5c0: feat: serve a built frontend from the pikku server's own origin

  A new `frontend` key in `pikku.config.json` names a directory of built
  frontend output. `pikku serve` mounts it, and `pikku deploy` ships it inside
  the distributable — into a directory beside the bundle for the node runtime,
  and embedded in the binary for a `bun build --compile` standalone. `pikku dev`
  deliberately ignores it and says so, because the frontend's own dev server owns
  that job.

  Pikku reads the frontend's output and never builds it, so an unbuilt directory
  fails with a message that says which build to run rather than booting a server
  that answers every page with a 404.

- af2bde4: Persona provisioning actually provisions.

  Two things stopped `provisionPersonas` from ever creating an account. It read
  `$context` off the better-auth instance without awaiting it — every other call
  site does — so the orphan sweep died on `undefined.findMany`, and a cast to
  `any` kept the compiler quiet about it. And nothing set `PIKKU_ENV`, so the
  environment rule failed closed and skipped every persona before it got that
  far; `pikku dev` now names the local environment from `environments` in
  pikku.config.json, preferring one called `local`.

- 2252016: Decide whether a virtual-user run is against production from the configured
  environment rather than `NODE_ENV`.

  A deployment whose staging is a production mirror runs `NODE_ENV=production`
  there too, so the old check refused every disposition on the one environment
  they exist to be used on. `startVirtualUserRun` now takes the `environments`
  generated beside the personas and the environment this process is (`PIKKU_ENV`
  by default), which is the same signal `personaEnvironmentRefusal` already
  checks at sign-in; the generated scaffold passes them. An environment that
  cannot be resolved is treated as production. `NODE_ENV` remains the answer for
  a project that configures no environments at all.

- 80eb5c0: Encrypt classified columns from the generated manifest.

  `ClassificationPlugin` reads the per-column classification manifest and decrypts `wrapped` and `sealed` columns transparently on the way out. Writes are not transparent — Kysely's `transformQuery` is synchronous and WebCrypto is not — so plaintext heading for a classified column **throws** instead, and values are produced by `ClassificationCrypto.encryptColumn()`. A forgotten call site is a loud error rather than a silent plaintext row. The stored envelope is self-describing (`pikku1.<keyId>.<version>.<wrappedDek>.<ciphertext>`), so a row records which key opens it without a schema change to every table.

  `keyId` now flows from the hand-authored `db/annotations.ts` through `pikku db migrate` into `classification.gen.ts`. It is emitted only for `wrapped` and `sealed` columns: naming a key on a plain column would claim a protection it does not have, and a hashed column has no key at all — the hash is the lookup key.

- Updated dependencies [80eb5c0]
- Updated dependencies [80eb5c0]
- Updated dependencies [80eb5c0]
- Updated dependencies [af2bde4]
- Updated dependencies [2252016]
- Updated dependencies [80eb5c0]
  - @pikku/core@0.12.98
  - @pikku/node-http-server@0.12.12
  - @pikku/bun-server@0.12.10
  - @pikku/deploy@0.12.2
  - @pikku/better-auth@0.12.32
  - @pikku/kysely@0.13.23

## 0.12.124

### Patch Changes

- e0106bb: fabric validate: honour better-auth `modelName` overrides in the auth schema check.

  The check looked for migrations creating `user`, `session`, `account` and
  `verification` — better-auth's default table names. An app that already owns a
  `user` table renames the models (`user: { modelName: 'authUser' }`), and the
  adapter's CamelCasePlugin then writes them as `auth_user`, `auth_session` and
  so on. None of the default names appear in such an app's migrations, so a fully
  migrated project was reported as having no better-auth schema at all — an error
  it had no way to clear.

  Each model now also matches its configured `modelName` and that name's
  snake_case form, read from the source files that configure better-auth.

- e0106bb: fabric validate: stop two scanners reporting false positives.

  The undeclared-import scan read raw file text, so prose in a comment or a
  description string matched its `from "..."` pattern — `Converted from the
Gherkin scenario of the same name` reported a missing package named `signed`.
  Comments are now blanked before the scan, and a specifier containing whitespace
  is never a package name.

  The scenario copy scan matched every string literal in the file against the
  message catalogue, so an RPC payload field whose value happens to equal a label
  was reported as hardcoded UI copy — `unit: 'kg'` flagged against a `unit_kg`
  form suffix, where rewriting it to a message lookup would bind a stored value to
  UI copy. A literal in `key: '...'` position now only counts when the key names
  something the browser renders; bare locator arguments are unchanged.

- e0106bb: fabric validate: stop the scenario copy scan reporting asserted values as UI copy.

  `expect(item.unit, 'kg', 'the item unit')` compares a value an RPC returned.
  The scan matched the literal against the message catalogue and reported it as
  hardcoded copy that should be read from `unit_kg` — a fix that would bind a
  stored value to a form label, so the assertion would then pass against whatever
  the label happened to say.

  A literal passed directly to `expect(...)` is no longer scanned. A locator
  nested inside one still is: in `expect(await page.getByText('Save').count(), 1)`
  the literal belongs to `getByText`.

- 6d9c09c: Resolve a variable's declared default instead of dropping it.

  `defineVariable` takes a schema, and a schema can carry a default — `z.enum(['https://api.github.com']).default('https://api.github.com')` is the shape most addons declare their base URL with. Nothing read it. `variables.get('GITHUB_BASE_URL')` returned `undefined` on a host that had not set it, and the `as string` at the call site hid that until a request went to `undefined/repos/...`.

  The default now resolves in `TypedVariablesService`, which is the layer that knows what was declared — `VariablesService` only knows what a host put in it. A stored value always wins; a schema with no default still resolves to `undefined`.

  `VariableStatus` gains `hasDefault`, and `getMissing()` no longer lists a variable that defaults: it has a value, just not one anybody has to supply. `isConfigured` still means what it said — that a host set it.

  For this to work the generated `TYPED_VARIABLES_META` now carries the schema as a value rather than only `z.infer`-ing its type, so the schema module is retained in the emit instead of being elided.

- ef775dc: validate: flag static imports of packages the deploy bundler stubs

  The deploy bundler replaces the AI SDK packages (`@pikku/ai-vercel`, `@ai-sdk/*`,
  `ai`) with `export {}` in every unit that does not require `agentRunner`, so a
  static named import of one in `services.ts` fails to bundle with an opaque
  esbuild error repeated once per unit. `pikku fabric validate` now reports this as
  `services-static-stubbed-import` and points at the lazy-import shape the starter
  template uses. The service-to-module map moved to its own module so the check and
  the bundler read the same list.

- 239332b: Move first-party product analytics out of application code and into the framework.

  `createAnalytics<Event>({ endpoint })` in `@pikku/react` is the buffered beacon client: it is typed against the app's own event union, flushes on an interval, on size and on `pagehide`/`visibilitychange` (via `sendBeacon`, so the abandon-point events survive unload), never surfaces a failure to the user and never retries. It also carries the delegated `data-analytics-click` listener, registered in the capture phase so a component calling `stopPropagation()` cannot silence instrumentation, and merging `data-analytics-meta` from ancestors with nearest-wins. Put the client on the Pikku instance and `usePikkuAnalytics<Event>()` reaches it from the provider, alongside `usePikkuFetch` and `usePikkuRPC`.

  `requireOrigin()` in `@pikku/core/middleware` is a server-side origin lock for any unauthed route, and is re-exported from the generated `#pikku/middleware` leaf alongside `cors`. Unlike `cors()` — which only sets response headers a non-browser client ignores — it rejects with a 403 before the function body. Comparison is exact on the parsed origin, so `https://evil-myapp.com` cannot suffix-match `myapp.com`, and a missing `Origin` is rejected because a real browser always sets one on a cross-origin-capable POST. Allowed origins default to the request's own host and can be extended with a list or a resolver over services. `isAllowedOrigin` and `toOrigin` are exported for direct unit testing.

  Together these let an app keep only its event registry and its wiring, instead of a few hundred lines of copied transport.

- Updated dependencies [8154b1c]
- Updated dependencies [af2b764]
- Updated dependencies [6d9c09c]
- Updated dependencies [239332b]
  - @pikku/core@0.12.97
  - @pikku/inspector@0.12.67

## 0.12.123

### Patch Changes

- 9d2fbeb: Point a config-blocked deploy at the command that sets what is actually missing

  A deploy blocked on `needs_config` printed one hint — "Set the values with
  `pikku fabric secrets set <name>`" — whether what was missing was a secret or a
  variable. Secrets and variables are set by two different commands, so anyone
  blocked on a variable was sent to a command that refuses their value. The hint
  now follows what is missing and names it, so the values can be found without
  reading the deployment status by hand.

- 2f94a0a: Stop `pikku all` failing on a diagnostic its own codegen went on to fix.

  The run inspects several times, because generating the scaffold, the leaf indexes and the type files each changes the source graph the next inspection reads. Every full inspection re-runs every validator, so the newest pass is the complete one — but the logger accumulated diagnostics across all of them, and the build gate failed the run if any pass had ever recorded a critical.

  A project whose system roles grant a scaffold-declared scope (`virtualUser:*`) therefore could not build from clean: the pass taken before the scaffold existed raised PKU124, the pass taken after was clean, and the run failed anyway. Same for PKU951 on a scaffold-declared secret.

  Validation diagnostics are now scoped to the pass that recorded them, so a later pass supersedes an earlier one. Diagnostics reported outside a validation pass — by a generator or a command — are untouched, and a fault every pass reports still fails the run.

- f1ccfe3: A step ladder reads as one paragraph, not a list of restatements

  Every step prefixed its actor with `the `, named that actor again, and repeated
  the phase keyword. A three-step run by one person said their name three times
  and `Given` three times, only read as English when the persona key happened to
  be a role noun, and never said who that person was — the fabric template's own
  placeholder came out as `the nadia opens /app`.

  ```
  Given yasser (the founder) signs in
  When  yasser opens the dashboard
  And   sees the audit log
  And   nadia reviews the invite
  ```

  The article is gone: the actor key is the subject verbatim, so a persona named
  after a person reads as that person. A repeated phase reads as `And`, the way
  Gherkin has always written it. A step that continues both the phase and the
  actor drops the repeated subject, because English drops a repeated subject in a
  compound predicate — it takes both, since eliding across a phase change gives
  `When opens the dashboard`, and a pronoun rather than a name would give `they
sees`, step templates being authored in the third person singular.

  An actor is introduced once, by the persona's `jobTitle` — prose someone wrote
  for a reader. `roles` is authorisation, so a persona whose only description is a
  `reviewer` grant gets no introduction rather than one assembled out of grants.
  A row carries `sentenceWithRole` alongside `sentence`, set only where an actor
  is first named, so a renderer can offer the introduction as a toggle without
  parsing a composed sentence back apart.

  `{placeholder}` filling, the `#ordinal` lookup for repeated step names and an
  actorless step reading as its description alone are all unchanged.

- Updated dependencies [88629af]
- Updated dependencies [88629af]
- Updated dependencies [2f94a0a]
- Updated dependencies [7eeff81]
- Updated dependencies [f1ccfe3]
  - @pikku/core@0.12.96
  - @pikku/fetch@0.12.10
  - @pikku/inspector@0.12.66
  - @pikku/skills@0.12.19

## 0.12.122

### Patch Changes

- 7d8082a: Add `pikku fabric variables set` and `pikku fabric variables get`

  `secrets` was the only stage-scoped store the CLI exposed, so a value declared
  with `defineVariable` could be set locally through `.env` and not at all on a
  deployed stage — `variables.get('NAME')` compiled, ran, and answered `undefined`
  forever, with nothing saying why. The fabric API already had
  `setStageConsoleVariable` and `getStageConsoleVariable`; only the CLI surface was
  missing.

  `set` stores the value the way `LocalVariablesService` reads one: `JSON.parse`,
  falling back to the raw string. `--value true` is therefore the boolean on a
  stage exactly as it is from `.env`, and `--value '"true"'` is the string. `get`
  prints the stored value as JSON so the two are distinguishable, which is usually
  why you are looking.

  Variables are not sealed and are readable back — that is the difference from
  `secrets`, and anything that would hurt to print belongs in `secrets set`.

- Updated dependencies [7d8082a]
  - @pikku/skills@0.12.18

## 0.12.121

### Patch Changes

- 30e390b: `pikku.config.json` takes a `locale`, naming the language the project's meta is
  written in.

  Meta is the human-readable prose authored inside the code rather than in a
  message catalogue: `description` on functions and steps, `name`/`title` on
  features and scenarios, step `template` strings, role and persona descriptions.
  It is also the one part of a project the Pikku Console renders back to a human,
  which is what the field is for — a team whose working language is German should
  be able to read their own Console in German without anything else about the
  project changing.

  This release is the groundwork: the field is read, validated and canonicalized,
  and the skills explain which of a project's three languages it is. Nothing
  consumes it yet, so setting it does not change what the Console renders — that
  comes with the reader.

  It defaults to `en`, is validated as a BCP-47 tag through
  `Intl.getCanonicalLocales` (so `de_DE` fails at the line that is wrong rather
  than degrading to "some language" three layers down), and comes back
  canonicalized so `EN-gb` and `en-GB` are one value downstream.

  Two things it deliberately does not do, because collapsing them is the bug this
  came from. It never renames anything — identifiers, files, database tables and
  columns stay English whatever it says. And it is not the product's UI language:
  what the app says to its users lives in `messages/<locale>.json`, with
  `active.json`'s `defaultLocale` deciding what a first-time visitor is served,
  while `baseLocale` names the message source and stays `en`.

- b5e79c1: Resolve `Config`, `SingletonServices` and `Services` by declaration rather than
  by name.

  Service extraction read `typesLookup` under the hardcoded names the scaffold
  happens to use, but the lookup is keyed by whatever the project named its
  interface. A project that renamed one satisfied every required-type check and
  then resolved to no services at all, surfacing much later as PKU724 or as every
  singleton service turning optional. These now go through the import maps, which
  carry the real name.

  `pikku workflow` carried the same lookup as its fallback when aggregation came
  back empty, so a project with a renamed interface was told
  `WORKFLOW_ORCHESTRATOR_NOT_CONFIGURED` while holding a perfectly good
  `workflowService`.

- 30e390b: `pikku fabric validate` warns when an app's `baseLocale` is not `en`.

  `baseLocale` names the message source, not the language the app is served in,
  and pointing it at the product's language looks like it works — the app does
  come up in that language. What it actually does is leave the project without an
  English catalogue to add a second language from, permanently, because repointing
  it later re-authors every key.

  New finding `app-base-locale-not-english-<app>` (warn) says so and names the
  setting that was wanted instead: `baseLocale: "en"` with the language in
  `locales`, and `defaultLocale` in `active.json` deciding what a first-time
  visitor opens in. Where the app is already keyed in the other language the hint
  adds that this is a re-key rather than a rename, since that is the part someone
  otherwise discovers halfway through.

- 2a02288: Let a virtual user run against a deployed stage.

  Until now the scaffolded run could only sign its personas in with
  `SCENARIO_ACTOR_SECRET`, which only `pikku dev` serves — so a run against a
  deployed target failed before its first turn. `runVirtualUser` now takes an
  optional short-lived Fabric operator token, handed in by whoever starts the run
  and passed through to `createPersonas` as `operator`.

  Handed in rather than fetched on demand: a stage that could ask for a token
  would be holding a credential able to mint admin sessions for itself for as long
  as the box lives. It holds one receipt, for one run, and the receipt expires. It
  is never written to the run record — only `FABRIC_OPERATOR_TOKEN` in the
  environment is read, and only as the fallback for a run nobody handed a token to.

  `HttpPersonasConfig.signInPath` now applies to the operator path too, so an app
  that mounts auth under `/api` can say so once.

  The framework's own virtual-user RPCs no longer enter a virtual user's
  catalogue. A persona whose role carries `virtualUser:*` could otherwise start
  further runs, read back every run's transcript — an adversarial run's steps are
  working exploits against the same app — and put a persona on a schedule that
  outlives it.

  The scheduled tick now runs as the platform user, and starts its runs through
  the same door a person uses.

  The scaffolded `startVirtualUserRun` RPC is gone — not the `startVirtualUserRun`
  helper `@pikku/core/virtual-user` now exports, which is the shared record-writer
  `runVirtualUser` calls. The RPC existed only so the tick could record a run
  without holding a session, which meant the persona checks, the
  production-disposition rule and the record lived in two places that would
  eventually disagree. The tick calls `runVirtualUser` over RPC instead, and the
  scaffold emits `virtualUserPlatformSession` to give it an identity:

  ```ts
  wireScheduler({
    name: 'virtualUsers',
    schedule: '0 * * * *',
    middleware: [virtualUserPlatformSession],
    func: tickVirtualUserSchedules,
  })
  ```

  `pikku-platform` is the platform's own principal and already exists for exactly
  this — a reserved user row created with no credential account of any kind, so no
  sign-in method can resolve it, and one the user directory already filters out, so
  unlike a seeded service account it costs no phantom member in any list, seat
  count or bill.

  The middleware is attached to the task rather than declared as tag middleware
  over `/rpc`, which cannot set a session at all: `runScheduledTask` builds its
  wire with a `sessionService`, so the session set here is the one the function is
  frozen with. A tick wired without it is refused for want of a session, and one
  carrying the wrong scope is refused on `virtualUser:run` — both now covered by
  tests.

  A Fabric operator can now actually start the run it signs in to start.

  `fabric()` granted its operator row `admin` and nothing else. `admin` is this
  package's own root — pikku's parent-grant rule walks down from a root that is
  held, and the virtual-user scaffold declares `virtualUser` as a root of its own
  precisely so a role can carry `virtualUser:run` without also implying
  administration. So the operator was refused by `runVirtualUser`, the one
  function the operator sign-in exists to reach.

  The operator is now granted the roots in `OPERATOR_SCOPE_ROOTS`
  (`admin`, `virtualUser`) rather than a bare `admin`. Listed rather than
  collapsed to `*`, which would make every operator a superuser on every app for
  the sake of one function: an operator still holds nothing in the application's
  own domain, and a root the app never declared is skipped rather than stored.

  The grant is also re-checked on every operator sign-in instead of only when the
  row is created. It is deliberately logged rather than thrown, so a single
  failure used to leave that operator permanently unprivileged with nothing to
  retry it, and a root added to the set later would never have reached the
  operators that already existed.

  The scaffolds no longer keep their logic inside the CLI's template strings.

  Code written as text inside a template literal is never compiled, never linted,
  and testable only by matching the source the CLI emits — so a dead branch or a
  duplicated loop survives there indefinitely. Five scaffolds were carrying real
  logic that way, and it now lives in `@pikku/core` alongside the types it uses,
  leaving each serializer to emit only what is genuinely per-application.

  - **virtual-user** — 677 lines: the run driver, the persona and disposition
    rules, the schedule writer and the serializers, now
    `@pikku/core/virtual-user`. The guarantee that an operator token never
    reaches the run record used to be a regex over emitted text; it is now
    structural, because `startVirtualUserRun` has no parameter to pass one to.
  - **workflow** — the two status streams were an ~80-line poll loop each,
    identical apart from three fields, now one `streamWorkflowRunStatus` told
    whether to be detailed. Fixes three latent bugs both copies shared: a
    `setInterval(async …)` whose poll threw produced an unhandled rejection; a
    poll that threw left the channel open rather than ending the stream; and the
    interval fired whether or not the previous poll had returned, so a slow store
    put two polls in flight and sent the init frame twice.
  - **emails** — ~190 lines of HTML escaping, trusted-root allowlist and
    single-pass substitution, now `renderEmail` in `@pikku/core/services`. This
    was the security-sensitive one, and compiling it surfaced a bug the template
    string had been hiding: `{{ content }}` was written unescaped in every render
    rather than only in the layout it is the slot for, so a caller passing
    `data.content` to a template that named it got raw HTML out. Nested lookups
    also used `in`, which walks the prototype chain; nothing inherited actually
    reached the output — every step past a prototype hit lands on a function,
    which is neither traversed nor written — so that one is a closed door rather
    than a fixed leak.
  - **agent** — both callers built the same options object; now
    `agentCallOptions`, typed against `AgentInput` rather than a second copy of
    its shape.
  - **console** — two branches that could only survive uncompiled: a catch block
    identical to its try, and an if/else whose arms were the same call.

  Behaviour is unchanged throughout, and the emitted modules are the same modules
  — the emails scaffold's ten escaping tests pass untouched through core. The five
  serializers shrink from 1,936 lines to 1,281, and what they used to emit is now
  covered by 75 tests that run the code rather than by regexes over the text.

- Updated dependencies [a3deea4]
- Updated dependencies [a3deea4]
- Updated dependencies [1cc50ef]
- Updated dependencies [b5e79c1]
- Updated dependencies [a3deea4]
- Updated dependencies [30e390b]
- Updated dependencies [2a02288]
  - @pikku/better-auth@0.12.31
  - @pikku/skills@0.12.17
  - @pikku/core@0.12.95
  - @pikku/inspector@0.12.65

## 0.12.120

### Patch Changes

- 29309e2: Send what a persona currently declares alongside the schedule row that is actually running it. A cadence is enabled once and then outlives the declaration it was written from: someone edits `personas.ts`, redeploys, and the row keeps running last month's goals and disposition with nothing anywhere to say so. `listVirtualUserSchedules` now resolves each row's persona out of `personaConfigs` and returns its goals and disposition as `declared`, so the difference is readable rather than inferred.

  Which fields differ is deliberately not computed here. It is a question about how to render two values, and a codegen step that answered it would fix the answer for every client — including the ones that want to show both sides rather than a flag.

- 2caea1d: Make the virtual user scaffold typecheck in the project it is generated into.

  Three shapes in `virtual-user.gen.ts` were written against what the scaffold
  knows rather than what an application actually has, and every one of them was
  an error the moment a real project turned `scaffold.virtualUser` on:

  - `startVirtualUserRun` asked for `config: { nodeEnv?: string }`. An
    application's `Config` is its own interface and need not declare `nodeEnv` at
    all — and a target type whose properties are all optional shares none with
    such a config, so TypeScript rejected the whole call. It takes `unknown` and
    reads `nodeEnv` off it.
  - It also asked for `rpc.invoke(name: string, …)`. A project's generated
    `invoke` is generic over its own map's keys and `string` is not one of them.
    The parameter now names the one function the scaffold dispatches.
  - `listVirtualUserSchedules` passed `input: null`, which is not one of the two
    things an input may be. The field is omitted.

  It also signed in at the wrong door. `createPersonas` was called without a
  sign-in or RPC path, so a run against an application that mounts auth anywhere
  but the root — `/api/auth` is the usual place — signed in against a 404 and
  spent its whole budget reasoning about why every call failed. It now reads
  `SCENARIO_SIGN_IN_PATH` and `SCENARIO_RPC_PATH`, the same two variables a
  scenario run reads, because a virtual user goes through exactly the doors a
  scenario does.

## 0.12.119

### Patch Changes

- c7b9e8e: Make `@pikku/ws` and `ws` optional peer dependencies instead of dependencies, and resolve them from the project rather than from the CLI.

  `@pikku/ws` peers on a `@pikku/core` range, so a copy sitting in the CLI's own tree gets paired with the CLI's core rather than the project's — the skew surfaced as `Cannot find module '@pikku/core/ecosystem'` from a package the project never imported. As an optional peer resolved against the project's `package.json`, there is one core in play, and a Bun project (which serves WebSockets natively through `@pikku/bun-server`) no longer installs a Node WebSocket stack it cannot use.

  `pikku dev` and `pikku serve` under Node now start over plain HTTP when the packages are absent, logging why, and `pikku validate` reports `websocket-deps-missing` as an error for a project that wires channels without them.

- 0b1bf53: `pikku dev` turns actor quick login on and mints its secret; `pikku serve` never
  does

  Which command is running is the thing that knows whether "sign in as <persona>"
  should work, so the two server commands now say so rather than leaving it to
  whatever the environment happens to contain.

  `pikku dev` sets `PIKKU_DEV_ACTOR_SIGN_IN` before it loads the project and, if no
  actor secret is set, mints a cryptographically random one for the run under both
  `SCENARIO_ACTOR_SECRET` and the `VITE_`-prefixed copy the dev frontend can
  actually read — only prefixed variables reach `import.meta.env`, and the switcher
  runs in the browser. Requiring every contributor to hand-manage a secret for a
  server that is trusted with the database anyway bought nothing and cost setup
  friction on every machine. An explicitly-set secret always wins: a project
  pointing its scenario runs and its dev server at one value has to keep that
  value. The minted one lives only in this process's environment, so it is gone
  when the server stops and yesterday's cannot sign anything in today. Both cases
  are logged, naming where the secret came from — the previous silence is what made
  a missing control unanswerable from outside the container. Where the two names
  disagree the command says so instead of picking one quietly, because that
  disagreement presents as "the switcher signs in nowhere".

  `pikku serve` is the production server command and does the opposite: it clears
  the marker outright, so an inherited environment cannot switch passwordless
  sign-in on behind the operator, and it warns when it had something to clear. What
  it deliberately leaves alone is `PIKKU_ALLOW_ACTOR_SIGN_IN` — scenario suites have
  to be able to run against a deployed stage, and that opt-in is the supported way
  to say so.

  `pikku validate`'s fix hint for a project with personas but no actor sign-in no
  longer tells people to control the endpoint by withholding the secret, which is
  no longer how it is controlled, and the `pikku-better-auth` skill documents the
  gate, the two escape hatches, and the two distinct refusals.

- 0b1bf53: Stop the fabric git probes answering about the wrong repository. `git push` from a worktree exports `GIT_DIR` to every hook, and a hook's children inherit it — `GIT_DIR` outranks the process's directory, so `isGitRepo`/`isTracked` and the deploy safety checks reported the hook's repository no matter which `cwd` they were given. `fabric validate` run from a pre-push hook then failed `fabric-config-untracked` against files it never looked at. Each probe picks its repository by `cwd`, so the inherited pointer is dropped along with the other repository-location variables.
- 0b1bf53: Provision the app a persona signs into as a grant, not just a declaration.

  `CorePersona.app` decided where a browser run navigated and nothing else, so
  "which frontend may this person reach" was a fact only the test runner held and
  the deployment could not enforce. It is now a scope: the CLI derives an `app`
  tree from the apps the personas name, and `provisionPersonas` grants
  `app:<name>` alongside the roles.

  Carried as a scope rather than a per-app column so it resolves at the session
  boundary like every other grant — revocable at runtime from the console, not
  inherited by a restricted API key, and one query for which apps a user may
  reach instead of a migration per frontend. A single-frontend product declares
  nothing and is unaffected.

  `app` is reserved as a scope root: a `defineScope` call that also declares it
  now fails the build rather than shadowing the derived tree.

- 0b1bf53: Personas are provisioned by the deployment, not by the CLI

  Signing a persona in was what created their account: the actor endpoint upserted
  an `actor: true` row on first sign-in and nothing else did. That is now the wrong
  way round — creating an actor row is a power the endpoint only has under
  `pikku dev`, so a stage whose sign-in is shut could not be provisioned at all,
  and one whose sign-in is open would have had to accept identity minting as the
  price of running scenarios.

  The obvious fix was to have `pikku persona sync <environment>` write the rows
  itself, and that fix is wrong in a way worth naming: the CLI has no connection to
  a deployed environment's database. It resolves one from the local project config,
  so `pikku persona sync staging` would read staging's API and write whatever
  database the checkout happens to point at — right for a developer's own stage,
  silently wrong everywhere else.

  So provisioning happens where the database already is. `@pikku/better-auth`
  exports `provisionPersonas`, which an app calls from its server lifecycle:

  ```ts
  import { provisionPersonas } from '@pikku/better-auth'
  import {
    personaConfigs,
    personaEnvironments,
  } from '#pikku/pikku-personas.gen.js'

  await provisionPersonas(singletonServices, {
    personas: personaConfigs,
    environments: personaEnvironments,
  })
  ```

  It creates each missing account through better-auth's own adapter, applies the
  roles the persona declares, and is additive — it never revokes. A deploy carries
  its personas with it, and no credential has to travel to reach a database.

  Two properties carry over, and one is new:

  - **A real user's address is refused**, rather than being granted the persona's
    roles. If a row exists for that address without `actor`, provisioning stops and
    names the persona, because the alternative is silently handing somebody else's
    account an `admin` grant.
  - **The environment rule still decides who is provisioned.** The same
    `personaEnvironmentRefusal` that decides who may _run_ against an environment
    decides who gets an account in it — two rules would drift, and the one that
    drifted would leave an account standing in production for a persona the engine
    then refuses to sign in. The generated personas file now carries
    `personaEnvironments` so the rule can be applied inside the bundle; only the
    `production` flag is projected into it, because an environment's `apiUrl` and
    paths belong to the machine running `pikku scenario`.
  - **A persona you delete leaves an account behind, and now you hear about it.**
    Additive provisioning has a hole: the account keeps every role it was granted,
    and the actor endpoint authenticates on the `actor` column alone without
    consulting the declaration, so an `admin` persona nobody declares any more is
    still a live way in wherever that endpoint is open. Provisioning warns about
    every actor account no declared persona claims; `orphans: 'ban'` shuts them
    through the same `banned` column the console's ban RPC writes, revoking their
    sessions and leaving the row, its grants and its history intact — and lifting
    the ban again by itself if the persona comes back. `report` stays the default
    because a rolling deploy provisions from the new declaration while the old
    replica is still serving the previous one.
  - **`pikku persona sync <environment>` now reports rather than writes.** It
    prints who the environment will provision, with which roles, and why anyone was
    skipped — which is what tells you _before_ a deploy whether the accounts you
    expect will appear. It needs no `SCENARIO_ACTOR_SECRET` and no database.

- 0b1bf53: Refuse better-auth's `admin()` plugin, and point at `ban()`.

  `admin()` authorizes its endpoints against a `user.role` column while pikku
  authorizes on scopes, so wiring it means running two authorization models and
  projecting one onto the other — coarsely, since any single `admin:users:*` scope
  has to project to `role='admin'` and thereby unlocks every one of its endpoints
  underneath. Pikku dropped that projection when user management moved to
  `@pikku/addon-admin`'s scoped RPCs, so nothing reads the column any more.

  The inspector now throws when `admin()` appears in a `betterAuth({ plugins })`
  array, naming the replacement:

  ```ts
  import { ban } from '@pikku/better-auth'
  betterAuth({ plugins: [ban()] })
  ```

  `ban()` keeps the one capability `admin()` had that pikku cannot supply from
  outside better-auth: the `banned`/`banReason`/`banExpires` columns and the
  session hook that refuses a banned user a session.

  `pikku validate` reports the same thing without a prebuild, and additionally
  warns about the quieter half of the migration — an app that dropped `admin()`
  and never wired `ban()`, which keeps its ban columns and its ban UI while
  silently enforcing nothing.

  Both resolve the plugin's provenance before applying the policy: the entry has
  to be better-auth's `admin`, imported from `better-auth/plugins` — by name, by
  alias or through a namespace — and actually present in the `plugins` array. A
  project's own helper called `admin` passes, and an import left behind after the
  call was removed configures nothing.

- Updated dependencies [0b1bf53]
- Updated dependencies [0b1bf53]
- Updated dependencies [0b1bf53]
- Updated dependencies [8519a73]
- Updated dependencies [0b1bf53]
- Updated dependencies [0b1bf53]
- Updated dependencies [0b1bf53]
  - @pikku/better-auth@0.12.30
  - @pikku/skills@0.12.16
  - @pikku/core@0.12.94
  - @pikku/inspector@0.12.64

## 0.12.118

### Patch Changes

- 6ff72d3: Raise the supported Bun version to 1.4.

  `@pikku/bun-server` and `@pikku/kysely-bun-sqlite` now declare `engines.bun: >=1.4.0`
  and build against `@types/bun@^1.4.0`. `create-pikku` scaffolds
  `"packageManager": "bun@1.4.0"`, and the fabric `smoke`/`validate` commands default to
  and recommend the same version. CI pins `oven-sh/setup-bun` to 1.4.0 instead of
  tracking `latest`.

- 56d6fde: `pikku meta apply` edits your own source from a batch of operations, so an agent
  that wants to set a permission, retag a function or rewrite a body no longer has
  to regenerate the whole project once per property.

  Three things had to exist for that to be safe:

  `permissions` joins the function change-set. Unlike every field before it, its
  value is an identifier rather than a literal, so the change-set carries the
  module each symbol comes from and the missing import is spliced in — widening an
  existing import from that module rather than adding a second one. The same
  mechanism fixes `tools`, which has always emitted `ref(...)` without ever
  importing `ref`.

  `applyOperations` is all-or-nothing. Every operation resolves against in-memory
  content first and nothing is written unless all of them succeed, so a batch
  cannot leave a project half-edited and uncompilable with no record of how far it
  got. Operations on one file compose in order, each re-parsing the last result,
  because a splice invalidates every offset after it. A failure names the
  operation that caused it.

  Newly added properties no longer leave a blank line behind them, and a missing
  trailing comma is now added after the last property instead of on its own line.

- Updated dependencies [6ff72d3]
- Updated dependencies [d1c6956]
- Updated dependencies [56d6fde]
- Updated dependencies [56d6fde]
- Updated dependencies [56d6fde]
  - @pikku/bun-server@0.12.9
  - @pikku/code-edit@0.12.1
  - @pikku/skills@0.12.15

## 0.12.117

### Patch Changes

- ad2b801: PKU717 no longer fires on a version bun or pnpm left in its store. Neither prunes
  on upgrade, so one `@pikku/core` bump leaves both copies on disk while the links
  resolve to one — and the guard reported a split on a tree that had none. The scan
  now walks in from the `@pikku/*` links, so a store copy counts only when
  something actually resolves to it.

## 0.12.116

### Patch Changes

- d7eea08: Gate the generated `getAgentThreads` behind `auth: true`. It lists the caller's own threads, so an anonymous caller could only ever get an empty array back — but it was the one exposed agent function with neither a permission nor a session requirement, so every scaffolded project shipped a PKU574 warning.
- 4058c3a: authBearer, authCookie and authAPIKey now come from `#pikku/middleware`, so nothing needs `@pikku/core`
- 4058c3a: A default skills install is now the seventeen that teach a `#pikku/*` door, not everything
- 4058c3a: `pikku doc <export>` finds an export that lives on the addon surface instead of dead-ending
- 4058c3a: `pikku doc --ai` now names the skill that teaches each door, and pikku-concepts sends you there first
- 4058c3a: `pikku doc` takes several topics at once, so an agent that needs two exports
  spends one round-trip rather than two.

  A variadic positional validated at runtime but not in the types: `[files...]`
  resolved to a key literally named `files...`, so declaring one was a type error.

- 4058c3a: `pikku doc` keeps a door screen to a door: exports, what each is for, and either
  its signature or a pointer to its keys — never the keys themselves. `#pikku/function`
  was 9.4k tokens and is now under 1k.

  Error classes carry their registered HTTP status again. The scrape read only the
  program, and a surveyed project consumes pikku as `.d.ts`, which has no statements —
  so all 49 came back bare.

- 23ab90f: Stop the CLI entrypoint-guard tests failing whenever colour is forced.

  The two assertions ran the emitted guard in a child process and compared its
  stdout against `'true'` / `'false'`. The fixture logged the bare boolean, so
  `console.log` sent it through `util.inspect`, which wraps a boolean in ANSI
  yellow as soon as colour is forced. `yarn` forces it — so the tests passed when
  run by hand and failed inside the pre-push hook, comparing
  `'\x1B[33mfalse\x1B[39m'` against `'false'`, which left `main` unpushable
  without `--no-verify`.

  The fixture now logs `String(isDirectExecution)`. Strings are not colourised,
  and the assertions are about what the guard resolved to, never about how Node
  formats it.

- 4058c3a: Give every export `pikku doc` lists a line saying what it is for, and gate it at zero
- 4058c3a: Point the doc's examples at real template source instead of restating it. An `@example snippet: name` names a `// @snippet start name` region in `templates/functions` or `templates/function-addon`, and the surface build resolves it — so every example the doc shows is code that compiled, and renaming an option breaks the build rather than the docs. `wireHTTP`, `wireChannel`, `wireScheduler`, `wireQueueWorker`, `defineSecret`, `defineVariable` and `addError` now carry one.
- 1bba2a5: feat(fabric): `deploy apply --sync` waits for the deploy and fails the build when it doesn't land

  `pikku fabric deploy apply` queued a deployment, printed its id and exited 0.
  Whether the deploy went live, failed, or parked itself at fabric's approval gate
  waiting for a human, the CLI said the same thing and returned the same code — so
  no CI pipeline built on it could tell a green deploy from a red one.

  `--sync` polls the deployment to a terminal state and exits on the outcome: 0
  live, 2 failed, 3 blocked, 4 timed out (900s by default, `--timeout <seconds>`
  to move it). On success it prints what changed — units, handlers, functions,
  workflows, secrets, variables, pending migrations (destructive ones called out
  individually with fabric's reasons) — and the workers now running.
  Under `--json` the wait emits NDJSON progress events with the terminal result
  last.

  It polls `getDeploymentStatus`, not `listDeployments`, because only the former
  carries `statusReason` — and `suspended` alone cannot tell "waiting for you to
  approve" from "blocked on a secret that has no value". A caller polling for
  `active` on the second one waits out its whole timeout on a deployment that was
  never going to move. The CLI now names the missing secrets and variables
  instead, and only offers to approve a plan that is genuinely at the gate.

  - `--auto-approve` **replaces `--auto-apply`**, with no alias. It answers both
    decisions the flow has: confirm the create, and publish a plan parked at
    `awaiting_approval`. It deliberately will not force a `needs_config` or
    `needs_attention` plan through — fabric refuses those, and so do we.
  - `--allow-destructive` is required on top of `--auto-approve` when fabric's
    plan marks a pending migration destructive (`drop_table`, `truncate`,
    `delete_rows`, a column rewrite, …). `--auto-approve` is a standing yes
    written before anyone knew what the plan contained, and the risk verdict is
    exactly what could not have been known — so the CLI lists the migrations and
    the reasons, exits 3, and waits to be told again with the plan in view. The
    interactive prompt shows the same lines inside the question.
  - `--deployment-id <id>` attaches to an existing deployment instead of creating
    one, which is what lets one CI job kick a deploy off and a later one wait for
    it. It combines with `--sync` and `--auto-approve`, is rejected alongside
    `--branch`/`--production`, and skips the git safety check — the deployment
    already pins a sha and the local checkout is allowed to have moved on.
  - **`deploy plan` is removed.** It never called the server: it re-ran the same
    auth, branch-safety and ref resolution `apply` does and printed the sha back.
    The real plan is produced server-side and is now visible in `apply`'s output.
  - The `message` field on the deploy input is gone. Nothing ever sent it.

  Attaching reads `getDeploymentStatus` for the deployment's existence and state
  and treats the project listing as a bonus lookup for the branch name and diff.
  The listing hides dismissed deployments unless asked, and a cancelled deploy is
  normally dismissed — going to it first reported "no such deployment" for one
  that existed and had a terminal status worth failing the build on.

  The bundled fabric rpc-map snapshot gains `applyDeployment` and
  `getDeploymentStatus` and drops `reapplyDeployment`, which fabric no longer
  serves.

- 57c1589: Apply `globalHTTPPrefix` to the RPC and agent routes the deploy analyzer synthesizes.

  Every `wireHTTP` route already carries the prefix — the generator bakes it in, so `rpcCaller` is wired at `<prefix>/rpc/:rpcName` and the generated client posts to `` `${globalHTTPPrefix}/rpc/${rpcName}` ``. The per-function routes `analyzeDeployment` builds did not: an exposed function's unit was published at `/rpc/getMe` regardless of the prefix.

  On a deployed stage that made the whole exposed RPC surface unreachable. `<prefix>/rpc/getMe` — what every client sends — matched no function unit, so it fell through to the `rpcCaller` catch-all, which carries only its own implementation; and `/rpc/getMe`, where the unit actually sat, is outside the prefix the gateway serves the API under, so it reached the frontend instead. Projects without `globalHTTPPrefix` were unaffected, which is why this survived: the two paths are the same string when the prefix is empty.

  Also applies to `/remote/rpc/<name>` and the four `/rpc/agent/<name>` routes.

- 8ea7879: Release the inspector's ts.Program between refreshes so `pikku dev` stops ratcheting memory
- 4058c3a: Point another thirteen examples at template source: `pikkuFunc`, `pikkuSessionlessFunc`, `pikkuVoidFunc`, `pikkuChannelFunc`, `pikkuConfig`, `pikkuWireServices`, `pikkuPermission`, `pikkuMiddlewareFactory`, `pikkuChannelMiddleware`, `pikkuAgentMiddleware`, `addTagMiddleware`, `addHTTPMiddleware` and `pikkuCLIRender`. 23 of the 34 examples the doc ships are now code that compiled.
- 4058c3a: Gate the door-to-skill table so it cannot name a skill a default install does not get
- 9d48e8a: Fail `pikku fabric validate` when a scenario step hardcodes a string the message catalogue already owns.

  A browser step that says `getByLabel('Full Name')` passes only while the app happens to render the base locale, and any copy edit turns it into a selector timeout that points at the wizard rather than at the rename that caused it. Validate now reads each `apps/<app>/messages/<baseLocale>.json` and errors on any string in a `*.steps.ts` / `*.scenario.ts` that is verbatim a catalogue value, naming the key to use.

  It scans every literal rather than only the ones sitting in a `getBy*` call, because copy passed to a project helper — `pick('Where would you like to work?', …)` — reaches the DOM just the same. Comments are stripped first, since the prose around a step quotes the copy it is explaining. A project with no inlang app is not scanned, and a string the catalogue does not own (a test id, a fixture filename) is left alone.

  The `pikku-scenario` skill gains the corresponding rule, including typing the lookup off the catalogue JSON rather than the generated Paraglide output, so a renamed key is a compile error instead of a run-time timeout.

- 06dae85: fix(cli): type the shadow-exempt set so a project that opts none in still compiles

  The shadowed-services warning emitted `new Set([])` when a project declared no
  `allowShadowedServices`, and TypeScript infers that as `Set<never>` — so the
  `allowedToShadow.has(name)` on the next line failed to compile with a `string`.
  It type-checked only for a project that had opted at least one service in, and
  no project in the repo has, so every build broke on the generated setup types.

  Emitted as `new Set<string>([])`.

- 4058c3a: Every `@example` in the public surface now names a snippet from `examples/online-shop`,
  and `@pikku/cli` ships the regions themselves as `snippets.json` beside `surface.json`.

  One running application is the only source: the code a reader is shown is code that
  compiles, migrates and passes `pikku` in CI, and it cannot drift from the API it
  illustrates. 80 of the 85 app-entrypoint callables now carry an example, up from 34.

- 4058c3a: Add a `client` install group, so frontend-facing skills can be pulled without the whole `core` set: `pikku skills install --client`. `installGroups` has always been a list and the resolver installs a skill if _any_ requested group matches, so `[core, client]` keeps every existing `--core` install identical.

  Tagged `[core, client]`: `pikku-react`, `pikku-react-query`, `pikku-workflows-client`, `pikku-paraglide`, `pikku-i18n`, `pikku-rtl`.

- 4058c3a: `@pikku/cli` ships every snippet the docs need, so a site rendering them no longer
  carries a submodule of the app they came from.

  Three gaps closed against what the website was extracting itself: SQL migrations
  are source too (`-- @snippet start` in a `.sql` file), `snippets-meta.json` records
  which file each region came from so a page can link to it, and the scenario
  environments block is read straight off the project's `pikku.config.json` — the one
  region a marker cannot reach, since that file is parsed as strict JSON.

- 4058c3a: Describe how each export is called in the surface doc: computed signatures, the keys of the options object it takes with the JSDoc that declares them, `@example` blocks, and the HTTP status an error class maps to. Each leaf now also names the skill that teaches it, or declares that none does.
- 4058c3a: Say what each wiring key is for, and gate it so it stays said

  The public surface doc listed keys as a name and a type. `schedule: string`
  is a shape; what a caller needs is that it wants a cron expression. Written
  as JSDoc where the type is declared, it reaches `pikku doc`, the IDE and the
  console at once — 31% of keys carried one, now 64%.

  `CoreHTTPFunctionWiring` was six near-identical union branches, so its keys
  could not be documented once. It is now a shared object intersected with the
  two unions that are genuinely correlated: `auth` with the kind of function it
  admits, and the method with `sse` and `query`.

  A test reads the shipped surface and holds three numbers: keys that say what
  they are for can only go up, and references to a `Core*` internal or to a type
  the doc never describes can only go down.

  Drops `eventChannel` from HTTP wirings and `graph` from triggers; nothing read
  either.

- 958b91a: Stop the TanStack Start shim throwing on every deployed page

  `makeApi()` read `import.meta.env.VITE_API_URL` and threw `VITE_API_URL is not
set` when it was absent — which is what happens in a deployed bundle. Fabric
  binds `VITE_API_URL` as a runtime binding on the worker, invisible to Vite at
  build time, so the read is `undefined` and the shim threw on the first loader
  that touched it. Codegen was shipping the failure `fabric validate` now fails
  projects for.

  The generated shim derives the base instead:

  - **Browser** — `import.meta.env.VITE_API_URL` when the build inlined one,
    otherwise `window.location.origin + '/api'`. A configured base pointing at
    localhost while the page is served from a real origin is ignored: the browser
    cannot reach it, so it is a stray dev value.
  - **SSR** — `PIKKU_API_URL` then `VITE_API_URL` from the environment, since
    there is no page to derive from. This is the one path that still throws when
    nothing is set, and it now names both variables. The environment is reached
    through `globalThis`, so the emitted file type-checks under a browser-only
    tsconfig with no Node types.

  `apiBaseUrl()` is exported alongside `makeApi()` for code that needs the base
  without an RPC client. This is the same resolution the shipping app templates
  use.

- 704d87d: Fail `pikku fabric validate` when a deployed frontend does not derive its API base from the page origin.

  Nothing writes a `VITE_*` / `NEXT_PUBLIC_*` variable at build time, and nothing
  can: the stage hostname is chosen when the worker is published, after the bundle
  is built. Fabric binds `VITE_API_URL` as a runtime binding on the deployed
  worker, which `import.meta.env` cannot see — so in the shipped bundle the read
  is `undefined` and whatever follows it is the real answer.

  That makes every build-time env read for an API base a failure, not just the
  ones defaulting to localhost:

  - `?? 'http://localhost:3002'` — errors as `frontend-env-fallback-localhost-<slug>`.
    Every call from a real browser hangs until it times out, with nothing in any
    log, because the request never left the visitor's machine.
  - `?? '/api'`, or no fallback at all, or a `NEXT_PUBLIC_*` name nothing binds —
    errors as `frontend-api-base-not-derived-<slug>`, naming the variable the app
    actually read.
  - A bare hardcoded localhost URL — now an error rather than a warning.

  All three are suppressed when the frontend reads `location.origin` somewhere:
  there the env read is the override branch of an answer that is already correct.
  That is the fix in every case, and what fabric's own app template does — the app
  and the API share a hostname and the dispatcher claims `/api/*` on it, so
  `location.origin + '/api'` is right on a stage, a preview and a custom domain
  alike.

  Only deployable declared frontends are scanned. Tests, `.d.ts` files and comments
  are skipped: none of them reach a browser.

- 90bef58: Warn when `createSingletonServices` returns a service the host already passed in

  `pikkuServices` merges `{ ...existingServices, ...createdServices }`, so a
  factory that builds its own `secrets` (or `kysely`, or `content`) wins over the
  one the host configured — silently. The replacement starts empty and the first
  failure lands much later, somewhere unrelated, with nothing in the boot log
  pointing at the swap. The generated wrapper now names what it discarded and
  points at the `existingServices.x ?? new Own()` idiom the templates use.

  Shadowing stays available where it is deliberate, but has to be said out loud.
  `allowShadowedServices` in `pikku.config.json` lists the names that may be
  replaced without a warning:

  ```json
  {
    "allowShadowedServices": ["kysely"]
  }
  ```

  Names are opted in one at a time rather than by a blanket flag, so adding a
  service later still warns until someone decides it should not.

- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [114c079]
- Updated dependencies [4058c3a]
- Updated dependencies [9d48e8a]
- Updated dependencies [4450b2a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [4058c3a]
- Updated dependencies [c63adb8]
  - @pikku/core@0.12.93
  - @pikku/skills@0.12.14
  - @pikku/better-auth@0.12.29
  - @pikku/kysely@0.13.22

## 0.12.115

### Patch Changes

- cfe0623: Honour `PIKKU_PERSONA_CREATE_MISSING=true` again.

  `variables.get` JSON-parses its value, so the flag arrived as the boolean
  `true` and never equalled the string it was compared against — every
  deployed scenario run asked the stage not to create the persona, and
  failed on the first one with `No account on this stage for ...`. The
  operator token beside it survived the same parse only because a JWT is
  not valid JSON.

## 0.12.114

### Patch Changes

- 09aff02: Point `pikku scenario run`, `pikku persona`, and `pikku persona sync` at a
  deployed environment.

  Each of the three read `SCENARIO_ACTOR_SECRET` directly and failed without it,
  which meant a deployed target was unreachable no matter what credentials you
  held. They now share one resolver: `FABRIC_OPERATOR_TOKEN` for a deployed stage,
  `SCENARIO_ACTOR_SECRET` for a local `pikku dev` one, and an error naming both
  when neither is set. The operator token wins when both are present, being the
  stronger of the two.

  Browser runs follow the same split. `@pikku/playwright` takes `operator` as an
  alternative to `secret`, plants the operator session on the actor's context and
  sets the impersonation header on it — so a browser step and an RPC step in one
  scenario still act as one user.

  Set `PIKKU_PERSONA_CREATE_MISSING=true` to let a run provision persona accounts
  the target does not have. It is off by default.

- Updated dependencies [09aff02]
- Updated dependencies [09aff02]
- Updated dependencies [09aff02]
  - @pikku/better-auth@0.12.27
  - @pikku/core@0.12.91
  - @pikku/playwright@0.12.79

## 0.12.113

### Patch Changes

- f2c7969: Run one codegen pass per file change in `pikku dev`, not two

  `configWatcher` watched the source directories and rebuilt the file watcher on
  every change, whose `ready` handler immediately ran a full codegen — while the
  old watcher's own `change` handler ran another. Each pass holds a whole
  `ts.Program`, so the two overlapping passes doubled peak RSS and could OOM a
  memory-capped sandbox. There is now a single long-lived watcher, and changes
  arriving mid-pass coalesce into exactly one follow-up run.

- f2c7969: Keep `pikku watch` alive so it actually watches, and run one codegen pass per change

  The command registered its chokidar handlers and returned, so the process exited
  before `ready` ever fired and nothing was ever regenerated. It now stays alive the
  way `pikku dev` does, and uses the same single-watcher, in-flight-coalescing shape,
  so a change during a pass schedules exactly one more run instead of overlapping two
  `ts.Program`s.

## 0.12.112

### Patch Changes

- 05e47cf: fix(persona): give `persona run` a singleton agent runner, so `talkTo` works

  `pikku persona run` built a dev agent runner and handed it to the virtual-user
  engine as `llm`, which covers the persona's own thinking and nothing else. The
  `talkTo` tool does not go through that handle: `HttpPersona.converse` asks
  `getSingletonServices()` for an `agentRunner`, and the CLI had never put one
  there. So a persona whose scopes reached one of the app's agents threw
  `AIProviderNotConfiguredError` on its first turn and took the whole run with
  it, while the same project ran fine as a persona holding no agent scopes —
  which reads as the app being broken for its privileged users rather than as a
  missing wire in the runner.

  The runner is now registered on the singleton services before the run starts.
  Nothing else about the run changes; a project with no agents behaves exactly as
  it did.

- 05e47cf: feat(virtual-user): make a run's history readable

  There was no way to ask what the virtual users had been doing. The scaffold
  generated a way to start a run and a way to read one back by id, and
  `VirtualUserRunStore.list()` — which takes a persona filter — had no caller at
  all. The console's Virtual Users screen was built entirely from static meta, so
  it could say who a persona was and what they could reach, and nothing about
  whether anybody had ever turned them loose.

  The scaffold now also generates `listVirtualUserRuns` and
  `getVirtualUserRunSteps`, both behind the existing `virtualUser:read` scope —
  the transcript is strictly more sensitive than the summary it belongs to, since
  it carries the live ids and payloads the run actually sent.

  The console reads the same two things through the console addon
  (`console:getVirtualUserRuns`, `console:getVirtualUserRunSteps`) off the host's
  own `virtualUserRunStore`, under a new `pikku:console:virtualUsers:read` scope.
  Going through the store rather than the scaffolded RPCs means a project's runs
  show up whether or not it turned `scaffold.virtualUser` on — wiring the store is
  all a run has ever needed. A host with no store answers with an empty list
  rather than an error: it has no runs, which is a true answer.

  Each persona now shows its recent runs under the declaration — status, when,
  steps and mutations, findings, disposition and seed — and opening one fetches
  its transcript. The steps are fetched only on open, because the history is read
  far more often than any single run is.

- 05e47cf: feat(virtual-user): keep the transcript a run already produced

  The engine returns `intents` and `steps` on every run — what the user set out
  to do, and every turn it took getting there — and `VirtualUserRunOutcome` kept
  neither. The record held counts and findings, so the one question anybody
  actually asks of a completed run ("what did it _do_?") had no answer anywhere,
  even though the answer had been computed and thrown away a moment earlier.

  `VirtualUserRunOutcome` now carries both, and `VirtualUserRunStore` gains a
  `steps(runId, options?)` read. Intents ride on the run record: there are a
  handful of them and every read of the run wants them. Steps get their own
  `virtualUserRunStep` table, because a run at a 500-step budget carries more
  transcript than every other column together and `list()` would pay for it on
  every row.

  Three things the kysely store had to get right, all of them driver differences
  rather than design:

  - steps are inserted in chunks of 50, because a bare sqlite driver binds at
    most 999 variables per statement and ten columns times a 500-step budget is
    five thousand — an un-chunked insert fails on long runs, which are the
    interesting ones;
  - `ok` is stored as 0 or 1, since a bare driver cannot bind a boolean at all
    and `SerializePlugin` is not installed everywhere;
  - `response` is stored JSON-encoded, because a truncated API response usually
    starts with a brace and `SerializePlugin` would otherwise read it back as an
    object rather than the string the engine saw.

  Completing a run that does not exist no longer writes steps: there is no
  foreign key to refuse them and nothing would ever read or reap them.

  **This adds a table to the `virtualUser` schema**, and the runtime creates
  nothing: a database that already has `virtualUserRun` gets the store's own
  refusal at startup until `pikku db generate` writes the migration and
  `pikku db migrate` applies it. Landing it now costs nothing, because
  `scaffold.virtualUser` is not yet switched on anywhere.

- 05e47cf: feat(virtual-user): put each persona on its own clock

  A budget says where one run stops. Nothing said how often a persona should use
  the application, so in practice each one ran whenever somebody remembered — and
  what actually tells you about a product is the same user coming back over a
  fortnight.

  Each persona now gets a row rather than a bigger budget. `virtualUserSchedule`
  holds `enabled`, the disposition and goals to run with, an interval **range**,
  and `nextRunAt`. `tickVirtualUserSchedules` acts on whichever rows are due:

  ```ts
  wireScheduler({
    name: 'virtualUsers',
    schedule: '0 * * * *',
    func: tickVirtualUserSchedules,
  })
  ```

  The tick is generated and wired by nobody, deliberately. A scaffolded
  `wireScheduler` would start spending an application's model budget the moment
  somebody ran `pikku all`, on a host that may not run schedulers at all. Tick
  resolution bounds how late a due persona is, never how often it runs.

  Three things it does that are easy to leave out:

  - The next due time is written **before** the run is dispatched, so a tick that
    dies halfway cannot hand the same persona to the next one. A dispatch that
    throws waits a full interval instead of retrying every minute for a week.
    That write is a compare-and-set against the `nextRunAt` the tick read, so it
    is also how a tick _wins_ the persona: two processes on the same cron see the
    same due row, and only the one whose claim lands dispatches.
  - A persona whose previous run is still `running` is skipped, not queued. Two
    copies of the same user acting at once is a different test, and its findings
    do not reproduce.
  - A run still `running` after two hours is failed. Without that, one restart
    mid-run blocks that persona's schedule permanently — which is where the
    stranded-record cost of not using a queue finally gets paid.

  Reschedule-on-completion was the other candidate and is worse in exactly one
  way, fatally: a crash between finishing and scheduling ends the persona forever,
  and the evidence is an absence.

  New: `VirtualUserScheduleStore` in core (with the tick, `isDue` and `nextRunAt`
  as pure functions), `KyselyVirtualUserScheduleStore` and its own schema —
  its own rather than a third table in `virtualUserSchema`, and owned by its own
  store, so a project that records runs and never wants them unattended carries no
  cadence table. `scaffold.virtualUser` gains `setVirtualUserSchedule`,
  `listVirtualUserSchedules` and the tick, behind a new `virtualUser:schedule`
  scope: starting a run spends money once with a caller watching, while writing a
  schedule spends it repeatedly with nobody there.

  The console's Virtual Users screen gains a **Run now** button beside a persona's
  run history, gated on `pikku:console:virtualUsers:run`. It dispatches the
  project's own `runVirtualUser` rather than starting a run itself, so a run the
  application would refuse — an acted-upon persona, a non-accountable disposition
  in production — is still refused.

- Updated dependencies [3c0012c]
- Updated dependencies [05e47cf]
- Updated dependencies [cfd364a]
- Updated dependencies [05e47cf]
- Updated dependencies [05e47cf]
- Updated dependencies [05e47cf]
  - @pikku/core@0.12.90
  - @pikku/kysely@0.13.21

## 0.12.111

### Patch Changes

- 274cab3: The singleton intersection moves to the leaves that name it, the runtime stops
  creating schema, and `db generate` writes only the runtime tables a project's
  services own

  `WiredSingletonServices` was exported from the generated function leaf so the
  auth leaf could import it. Nothing outside a generated leaf ever names it —
  emit declarations for a project of any size and it appears in none of them —
  so the auth and middleware leaves derive the intersection themselves and the
  function leaf keeps it private. `WiredServices` stays exported: 147 `.d.ts`
  files name it, and unexporting it asks every wired module to name each member
  service through a specifier it does not have.

  `ensurePikkuSchema` is gone. `requirePikkuSchema` replaces it: a service calls
  it at boot, it looks, and it issues no DDL at all. `pikku db generate` writes
  the declaration down as a migration and `pikku db migrate` applies it, and
  those two are now the only way pikku's runtime tables come into existence. A
  service that finds them missing says so and stops, naming both commands.
  Half-present is no longer a distinct case — the remedy is the same migration
  either way. `audit` and `virtual-user` join `pikkuSchemas` as a consequence:
  boot was the only thing that had ever created them.

  `pikku db generate` applied all of `pikkuSchemas`, so a project with no agents,
  no channels and no workflows still had `agent_threads`, `channels` and
  `workflow_runs` written into its migrations, and then carried them forever. A
  schema now names the services that own it, and generation gates on
  `requiredServices` — the set the inspector already builds for service
  tree-shaking. The gate is one-sided: a schema that names no owner is always
  written, because the session and secret stores and the deployment record are
  reached by the runtime itself and nothing in a project's source implies them.
  Declared scopes now imply `scopeService`, which nothing destructures because
  the generated auth layer is what reaches it.

  Drift keeps asking the unscoped question. A table already in a database has to
  stay recognisable as a runtime table after the service that needed it is
  dropped — scoping it there would report those tables as unexplained.

  Every project in this repo that had been relying on boot-time creation now says
  where its tables come from. `createConfig` moves into its own `config.ts` in the
  templates — `pikku db` looks for it there — and the three postgres templates plus
  the workflow verifier declare `postgresUrl` and run `pikku db generate && pikku
db migrate` before the server starts, from the single connection string their
  runtime opens. The e2e harness cannot: its databases are in-memory sqlite built
  inside the services factory, so nothing outside the process can migrate them. It
  applies the schemas it owns with `applyPikkuSchemas` instead — the same DDL, run
  by the one process that has the database.

- 58cb0f8: Scaffold an addon whose exports point at the leaf its codegen actually writes

  `pikku all` roots an addon's generated tree at `.pikku/addon/`, but `pikku new
addon` still wrote the pre-split targets: `./.pikku/*` resolved to
  `./dist/.pikku/*` and the internal RPC map to `./dist/.pikku/rpc/...`, neither of
  which exists in the published package. The subpaths a consumer writes are
  unchanged — only the targets gain the `addon` segment.

  The addon manifest reference in the `pikku-addon` skill described the same
  package.json one migration further back, with `imports` and `exports` naming the
  source tree and `files: ["dist", ".pikku"]` shipping `.ts` files Node cannot
  load. It now documents the built layout, and why `imports` and tsconfig `paths`
  deliberately point at different trees.

  The plain scaffold — no `--secret`, `--oauth` or `--credential` — built its API
  service with `new XService(variables)` against a class declaring no constructor,
  so `pikku new addon <name>` produced a package that did not typecheck until the
  author deleted the argument. Only the authenticating variants take one.

- 32616af: Give the deploy pipeline one shared contract instead of a copy per adapter

  `DeploymentManifest`, `DeploymentUnit`, `EntryGenerationContext` and
  `ProviderAdapter` were hand-copied into eleven source files across the four
  provider adapters and the CLI — three copies inside `@pikku/deploy-cloudflare`
  alone. Nothing compared the copies, so they had already drifted: several typed
  `role` as a bare `string`, and none carried the manifest's addon-scoping fields.

  They now live in a new zero-dependency `@pikku/deploy` package that every
  adapter and the CLI import, and each adapter declares `implements
ProviderAdapter` so the compiler checks it against the contract it claims to
  satisfy. That check immediately caught a real disagreement: the deploy result's
  `workersDeployed` and `resourcesCreated` were `string[]` from Cloudflare — the
  shape the result file and the generated SDK types already record — but
  `Array<{ name: string }>` from the standalone adapter. Both are now `string[]`.

  The Lambda and Azure adapters also derived their esbuild externals from a
  hand-written list of 25 node builtins, so anything outside it (`async_hooks`,
  `perf_hooks`, `timers`, `http2`, …) was bundled instead of resolved from the
  runtime. They now use `nodeBuiltinExternals()`, which reads `builtinModules`
  from the running Node and cannot fall behind it.

- c858555: fix(cli): a scaffold feature refuses the removed `auth` key instead of ignoring it

  `scaffold.<feature>` stopped taking `auth` when a scaffold flag became a
  statement about whether a surface is generated rather than about who may call
  it. The key was removed from the type, but a `pikku.config.json` still carrying
  it loaded clean and was silently dropped — a config that reads as if it closed
  the console to anonymous callers while configuring nothing at all.

  It is now refused at config load, by name, with the reason and the fix. Any
  other unrecognised key is refused too, so a typo'd `paths` fails at load rather
  than generating a file at the default location. `null` and arrays are refused
  with the same message a bare string already got, rather than crashing on a
  property read.

  These arrive as `PikkuCLIConfigError`, so the message reaches the developer
  verbatim rather than as "failed to load config file".

- Updated dependencies [274cab3]
- Updated dependencies [58cb0f8]
- Updated dependencies [32616af]
- Updated dependencies [32616af]
- Updated dependencies [6848cd9]
  - @pikku/kysely@0.13.20
  - @pikku/inspector@0.12.63
  - @pikku/skills@0.12.13
  - @pikku/deploy@0.12.1
  - @pikku/deploy-cloudflare@0.12.13
  - @pikku/core@0.12.89

## 0.12.110

### Patch Changes

- 74b8b63: Narrow the Bun resolve plugin's `onResolve` filter to the specifiers it actually
  rewrites. A catch-all filter that deferred to Bun for everything else made Bun
  bundle any bare specifier resolved through a package.json `exports` subpath
  (`@pikku/core/workflow`) as an empty module, so every deployed worker died at
  startup with `ReferenceError: PikkuWorkflowService is not defined`.

## 0.12.109

### Patch Changes

- a6bdc52: feat(cli): generate a browser-safe scope client

  `clientFiles.scopesFile` emits the project's `ScopeId` union and a
  `hasScopes(required, held)` with the cascade inlined, so a frontend deciding
  what to render no longer imports `@pikku/core` — a server package that drags
  AsyncLocalStorage and the wiring runtime into the bundle.

- Updated dependencies [4712e73]
- Updated dependencies [082403f]
  - @pikku/core@0.12.88
  - @pikku/ai-vercel@0.12.13

## 0.12.108

### Patch Changes

- 9687ad1: fix: hand agent middleware the singleton services its type promises

  `PikkuAgentMiddlewareHooks` typed its `services` parameter as the project's full
  wire `Services`, while every runtime call site has only ever passed the singleton
  services. A middleware that destructured a wire service typechecked and silently
  received `undefined`.

  The hooks are now bounded by `CoreSingletonServices` in core, and the generated
  `pikkuAgentMiddleware` defaults to `WiredSingletonServices` like the other
  middleware definers. Nothing changes at runtime: agent middleware hooks a _run_,
  and a run is not a request — it can start from a scheduler or a workflow with no
  wire behind it. A tool the run calls is an ordinary function call and still gets
  its own wire services through `runPikkuFunc`.

- 13ee73f: Generate `SCENARIO_ACTOR_SECRET` as an optional secret. A stage that runs no
  scenarios is a supported state — the actor sign-in refuses every request — but
  the required declaration failed the deploy config gate on every such stage.
- 8d6a6bc: fix(cli): a scaffold flag says a surface exists, not who may call it

  `scaffold.<feature>` accepted an `auth` field, and the generated wrapper emitted
  it onto the wired function. That put authentication in two places at once: the
  target function already declares whether it needs a session, its wiring, its
  scopes and its addon gate already refine it, and `runPikkuFunc` already enforces
  all of that on every call. The scaffold flag only stacked a coarser gate in
  front of the one that actually decides, and — being a config field — it could
  disagree with the function it was gating.

  `PikkuScaffoldFeature` is now `boolean | { path?: string }`. It answers two
  things and no more: whether the surface is generated, and where the file is
  written. A feature that was `{ "auth": false }` becomes plain `true`, and
  `pikku enable` loses its `--noAuth` flag along with the dimension it set.

  The six generators that took the flag no longer take one. The four that generate
  a dispatcher — public RPC, public agent, workflow routes and the events channel
  — now emit a fixed `auth: false`. That is the wrapper declining to gate, not the
  scaffold declaring the surface public: `rpcCaller` forwards to whichever
  function the caller named, and that function's own `auth`, permissions, scopes
  and addon gate are what decide. Emitting nothing would not be neutral, since a
  wiring without `auth` requires a session and would reject the call before the
  gate that decides ever ran. The two that generate scoped admin functions — user
  admin and virtual users — emit no `auth`, because they are `pikkuFunc` with
  their own `scopes`: session-required by construction, and the deciding function
  rather than a wrapper in front of one.

  The legacy `'auth'` / `'no-auth'` string values are gone with it. A bare string
  is still refused rather than read as a `path`: under `boolean | object` no
  string is valid, so guessing one would turn a typo into a generated file nobody
  asked for.

- 5fa28a5: `pikku dev`: say which AI SDK copies the agent runner is using, and refuse a mismatched pair up front

  Resolving `@pikku/ai-vercel` and `@ai-sdk/openai-compatible` from the project's root `package.json` is all-or-nothing, and under an isolated `node_modules` layout (bun, pnpm) the root resolves only what the root itself declares. A monorepo that installed the pair in the workspace that uses them silently got the CLI's own copies instead — which then threw `Unsupported model version v4 …` at the first model call, naming the model and the gateway but neither of the packages that actually disagreed. That case now logs a warning naming the package that could not be resolved.

  When the pair does come from the project, their `@ai-sdk/provider` majors are compared before the runner is built. A mismatch disables agents with a message naming both versions and pointing at `@ai-sdk/openai-compatible`'s per-`ai`-major dist-tags, instead of surfacing as a model-spec error later.

- 2783d93: refactor(cli)!: `clientFiles.startServerFnsFile` is now `clientFiles.tanstackStartFile`

  The old name read as "start the server fns" when it meant "the TanStack **Start**
  server-fns file". A config still using it now fails to load with the new name in
  the message, rather than silently generating nothing.

- 3a83f85: Stop re-exporting package internals through entry points

  66 names reached consumers only because an `export *` in an entry point swept
  them up. Each one is referenced solely inside its own package, so the star is
  now an explicit named re-export listing what is genuinely public. The
  declarations themselves are untouched — this narrows the entry point, not the
  module.

- d21ab7b: fix(cli): validate flags a dead Design tab instead of mentioning it

  A project that renders Mantine but has no `packages/mantine-theme/` (or no
  `themes/<id>.json`) gets a Design tab that renders "No themes yet". That was
  reported at info, under a summary ending "no errors". It is now a warning when
  an app depends on `@mantine/core` or `@pikku/mantine`, and stays info otherwise.

  The `components-missing` check is replaced by `design-no-stories`, which looks
  where the design server actually globs stories — `apps/*/src/components/**/*.stories.tsx`
  — rather than at `packages/components/`.

- 31ad85f: fix(emails): escape substituted values in the generated email renderer

  `renderEmailTemplate` spliced values into HTML unescaped and looped substitution
  until it reached a fixed point, so a value containing `"` broke out of the
  attribute it landed in, a value containing markup was injected verbatim, and a
  value containing `{{...}}` was re-expanded as a template on the next pass. An
  ordinary CSS font stack from `theme.json` was enough to corrupt the document.

  Rendering is now layered by trust. Partials are inlined first; `theme.*` and
  `t.*` are expanded next as template-author input; caller `data` is substituted in
  a single pass that is never rescanned. Values are HTML-escaped in `.html` output
  and left raw in `.subject.txt` / `.text.txt`. `{{content}}` and partials stay
  raw, and `{{{value}}}` is a new opt-in raw form. The console's email preview uses
  the same renderer, so previews match what is sent.

- Updated dependencies [9687ad1]
- Updated dependencies [2d21628]
- Updated dependencies [8d6a6bc]
- Updated dependencies [985b87b]
- Updated dependencies [3a83f85]
- Updated dependencies [31ad85f]
  - @pikku/core@0.12.87
  - @pikku/kysely@0.13.19
  - @pikku/skills@0.12.12
  - @pikku/inspector@0.12.62
  - @pikku/ws@0.12.9

## 0.12.107

### Patch Changes

- 69e49af: fabric validate and fabric smoke now agree with the build container that Fabric is bun-only, and validate refuses @pikku/cloudflare below 0.12.20
- 746ed6a: fix: one coercion plugin, not three

  The Kysely coercion plugin existed in three copies — the CLI's local database,
  `@pikku/kysely-node-sqlite` and `@pikku/kysely-bun-sqlite` — and all three had
  drifted apart. Only the CLI's resolved a column against the tables the query
  actually named, so two tables that disagree on the kind of a same-named column
  coerced correctly in local development and silently did not at runtime; only
  bun's dropped a genuinely ambiguous column instead of letting the last table
  processed win.

  The single implementation now lives in `@pikku/kysely`, which all three already
  depended on, and keeps both behaviours: table-qualified resolution first, an
  ambiguity-safe bare-name fallback second.

  `ColumnKind` — the value type of the generated `coercion.gen.ts` — is
  `'date' | 'bool' | 'json'`. The CLI's fourth member, `uuid`, was never a
  coercion kind: the codegen excludes it from the map by construction, because a
  UUID is a string in both Postgres and SQLite. It is now `AnnotationKind` in the
  CLI, the union a column may declare in `db/annotations.ts`, of which
  `ColumnKind` is the coercible subset.

  `@pikku/cli` also drops its unused dependency on the Node-only
  `@pikku/kysely-node-sqlite`.

- Updated dependencies [5a1a962]
- Updated dependencies [746ed6a]
  - @pikku/core@0.12.86
  - @pikku/kysely@0.13.18

## 0.12.106

### Patch Changes

- 7722ceb: Split the addon leaf so an application cannot shadow a linked addon's own

  An addon authored its services through `#pikku/addon`, and so did an
  application installing one. Node keeps those apart — `#pikku/*` is a
  package-private subpath import, resolved against the addon's own
  `package.json` — but tsconfig `paths` are global to a tsx process, and every
  runtime template maps `#pikku/*` onto a sibling package. A linked addon's
  `#pikku/addon` was resolved against the _application's_ leaf, which holds the
  install half and none of the authoring exports, and every template failed to
  boot with `does not provide an export named 'pikkuAddonServices'`.

  The authoring half now sits at `#pikku/addon/setup`. An application generates a
  flat `.pikku/<leaf>`, so there is nothing there for that specifier to match and
  the resolver falls back to Node, which reads the addon's own imports. Addons
  declaring themselves import `pikkuAddonConfig`, `pikkuAddonServices` and
  `pikkuAddonWireServices` from `#pikku/addon/setup`; `wireAddon` and
  `wireRemoteAddon` stay at `#pikku/addon`.

  `wireAddon` and `wireRemoteAddon` also move off `@pikku/core/rpc` onto
  `@pikku/core/addon`. Being reached over rpc is how an addon is called rather
  than what it is, and it put the whole addon surface behind the rpc subpath for
  consumers that only wanted to install one.

- 20d8a39: Split application administration out of the console addon into a new
  `@pikku/addon-admin`.

  `@pikku/addon-console` reads generated metadata, project source and knowledge
  notes from disk, so it only ever runs where there is a project checkout and a
  dev server. That made the console the only way to reach capabilities that have
  nothing to do with a console — listing users, composing roles, granting scopes,
  managing credentials, reading the audit trail — none of which touch a
  filesystem. Those now live in `@pikku/addon-admin`, which depends on nothing but
  `@pikku/core` and `@pikku/better-auth` and can be wired into a deployed
  serverless unit:

  ```ts
  wireAddon({ name: 'admin', package: '@pikku/addon-admin' })
  ```

  It ships the user directory (`admin:listUsers`, `createUser`, `setUserBanned`,
  `removeUser`, `revokeUserSessions`, `setUserPassword`), role and scope
  administration, credential administration and the audit trail.
  `console:getMyAccess` stays where it is: the console reads it to decide what to
  render, and it must not need a second addon wired to boot.
  Each function carries its own `admin:*` scope; the addon deliberately declares
  no `scopes` on `wireAddon`, because addon scopes are required _in addition to_ a
  function's own and an addon-level `admin` would force the umbrella grant on a
  caller granted only `admin:users:list`.

  Breaking for anyone calling these RPCs by name or granting their scopes:

  - `console:getAudits`, `console:getAuditFilters`, `console:scope*` and
    `console:credential*` are now `admin:*`.
  - `pikku:console:audit:read` is now `admin:audit:read`,
    `pikku:console:scopes:{read,manage}` are now `admin:scopes:{read,manage}`, and
    `pikku:console:credentials:{read,manage}` are now
    `admin:credentials:{read,manage}`.
  - The `admin` scope tree gains `credentials:{read,manage}`, `scopes` and
    `audit`. A bare `admin` grant now also covers reading the audit trail and
    administering roles; a role that means to exclude those must spell out the
    leaves it wants.
  - `scaffold.console` gates the console addon on `pikku:console` rather than
    `admin`, since `admin` is now the other addon's tree, and `@pikku/console`'s
    own `AuthGate` requires the same root (`isAdmin` on the auth context is now
    `canUseConsole`). Grant `pikku:console` to whoever should reach the console —
    the two are separate decisions, and a host may hand someone the console
    without handing them the user directory.

  `credentialListUsers` now reports the credentials each user actually holds
  rather than a matrix against the declared set, which is what removed its last
  dependency on the on-disk metadata.

  The `scaffold.userAdmin` generator is superseded by the addon and left in place
  for hosts still on it. Its copy of the `admin` scope tree — and the one exported
  as `ADMIN_SCOPE_TREE` from `@pikku/better-auth` — stay byte-identical to the
  addon's, as pikku still requires of a shared scope root.

- aeef159: fix(cli): let commands that seed a project run outside one

  Every `pikku` invocation loaded `pikku.config.json` before the command was
  dispatched — `createConfig` in the CLI's service factory called
  `getPikkuCLIConfig` unconditionally. In a directory that is not a Pikku project
  the upward search stops at the repo root and throws `Config file
pikku.config.json not found`, so the command never ran. That is right for
  commands that read a project, and wrong for `pikku skills install`, whose entire
  job is to write agent skills into a repo that has no Pikku config yet. The
  command needed the thing it exists to precede.

  `executeCLI` now passes the resolved command path to `createConfig`, and the CLI
  treats `skills` as config-free: it still uses a project config when one is there,
  so behaviour inside a project is unchanged, and falls back to an empty config
  when there is none. Commands that read a project are untouched and still refuse
  to run without one.

  Also stops a lie in the failure path. A config that was found but could not be
  loaded — a missing field tripping the resolver, malformed JSON — was reported as
  `Config file not found: <path>`, naming a file that was sitting right there and
  sending the reader to look for it. It now reads `Failed to load config file`.

- a281de6: A CLI option's type now drives how it is parsed, and it comes from the command function's input schema rather than a second hand-written declaration.

  `CLIOption` gains `type?: 'string' | 'number' | 'boolean' | 'string[]'` (replacing the never-honoured `array` flag). Declared, it wins over whatever the schema says; left unset, the parser reads the type off the command function's input schema — the same schema the function is validated against — falling back to `default` and then to `'string'`. A `'string[]'` option consumes one token and splits it on commas; every other non-boolean option consumes the next token verbatim, so values that begin with `-` (base64url tokens, negative numbers, dash-leading name patterns) parse correctly. A boolean option is a flag: it consumes the next token only when that token is an explicit literal (`true`/`false`/`1`/`0`/`yes`/`no`), so `--watch false` still turns a default-on flag off instead of leaving `false` behind as a positional.

  Because the schema is now what types an option, `pikku serve --console --port 4077` no longer reads `--port` as the value of `--console`, and a numeric option arrives as a number instead of a string. An explicit `type` is mostly needed for options that belong to no function input — the `pikku all` filters, which the config factory reads straight off the CLI data, are declared `string[]`, and the CLI's ad-hoc `parseCommaSeparated` normalisation is gone.

  An array option takes either one comma list or the flag repeated. It never consumes more than one token, because `--tags alpha beta` cannot be told apart from an option followed by a positional; the stray token is reported as an unexpected argument rather than dropped.

- 266e3bc: One door per name: `@pikku/core/ecosystem/*` and the package root are gone

  `@pikku/core` published every module twice. `ecosystem/http` re-exported
  `./http`, `ecosystem/services` re-exported `./services`, and a name was
  reachable through either — so every addition had to be made in two places, and a
  consumer's import said nothing about what it actually used. The package root was
  the same problem at a larger scale: a single barrel of 206 names that no bundler
  could take apart, and the one specifier that revealed nothing at all.

  Both are deleted. Every name now lives on the subpath that owns it, and every
  import carries that subpath — `@pikku/core/http`, `@pikku/core/services`,
  `@pikku/core/errors`, `@pikku/core/types`.

  Deleting the facades meant the raw subpaths had to become a superset of them,
  which they were not: the facade tree had accumulated 25 names with no raw home
  and about 26 more filed under a different area than the module they came from.
  Those names moved to the area that owns them, and three areas were published as
  new entry points rather than left on a root that is going away — `./types` (the
  shared type surface, the largest single destination), `./state` and
  `./classification`.

  `./classification` is one door onto one subject: what a value is and how it must
  be handled. Its three halves would each have been an entry point — the brands
  and manifest types, the stored-form helpers (`hashToken`, `unsafeAsSealed` and
  friends), and `SecretValue` — split by whether a name happens to be a type or a
  value, which is the same defect as the facades. The duration and versioned-id
  helpers went to `./utils`, which already published, and `PikkuRequest` went to
  `./function`: it is the transport-agnostic request base, not an HTTP one — HTTP
  has `PikkuHTTPAbstractRequest`, and the only thing outside core that extends
  `PikkuRequest` is Azure's timer request.

  `./types` inherited the root barrel's habit before it inherited its contents, so
  the names with an owner elsewhere were moved off it. The middleware types and the
  five middleware factories — `pikkuMiddleware`, `pikkuMiddlewareFactory`,
  `pikkuChannelMiddleware`, `pikkuChannelMiddlewareFactory` and
  `pikkuAgentMiddleware`, runtime values on a types entry point — are now
  `@pikku/core/middleware`; the function meta types are `@pikku/core/function`;
  `SerializedError` is `@pikku/core/errors`; and the generic TypeScript helpers
  (`MakeRequired`, `PickRequired`, `PickOptional`, `RequireAtLeastOne`,
  `JSONPrimitive`, `JSONValue`) are `@pikku/core/utils`. What is left on `./types`
  is the vocabulary the wirings share, which no single module owns.

  `pikku` was itself a root barrel — `export * from '@pikku/core'` — and
  now exports only the services it bundles.

  One module survives at the old specifier, and only for the bootstrap:
  `packages/cli` is generated by the _published_ CLI pinned in its `build.sh`, and
  that CLI still writes a bare `@pikku/core` into the files it generates for the
  CLI itself. `bootstrap-compat/root.ts` carries the eight types it names, a test
  in core fails if that list grows, and it goes when the pin moves to a CLI
  released from this branch. The adapter names the pinned CLI reaches for —
  `pikkuState` and `CreateWireServices` — are rewritten to `@pikku/core/state` and
  `@pikku/core/types` by the same `build.sh` patch pass, so no second shim is
  needed for them.

  A guard test keeps the root shut: it parses imports and rejects a bare
  `@pikku/core` rather than grepping for it, because several tests hold a user's
  file as a template literal, where `import … from '@pikku/core'` is fixture text
  rather than an import this repo makes.

  An agent scaffold a project generated under an older CLI is refreshed rather
  than left to fail: `pikku all` already deleted one importing an entry point
  `@pikku/core` no longer publishes, and the `#pikku` hub joins that list.
  Without it a project that scaffolds the agent endpoint but
  declares no agents keeps the old file forever — the generator that would rewrite
  it only runs when agents exist, and the file being present is what stops it
  being regenerated as missing.

  `pikku new addon` also wrote a tsconfig `paths` map naming only the deleted hub.
  An addon's `imports` map points into `dist`, so `paths` is what resolves
  `#pikku/<leaf>` for the addon's own source build — it now names the two leaf
  patterns, in both the addon and its test harness.

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.
- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- bf6c932: `pikku deploy plan` and `pikku deploy apply` now fail with a non-zero exit code when the build pipeline reports a failure, instead of continuing on to plan or deploy against a stale bundle.
- 3b1164a: feat(react,mantine): ship the dev actor switcher instead of making every app copy it

  The dev-only "Sign in as …" control — one click signs in as a declared scenario
  persona, no password — was hand-copied into every app that needed it, because
  `pikku fabric validate` requires any frontend with a login screen to have one.
  The `devActors()` / `signInAsActor()` pair was byte-identical everywhere it
  landed, including the `import.meta.env.DEV` gate that keeps the shared secret out
  of production bundles. That is not a thing each app should be re-deriving from a
  copy-paste.

  Split along the dependency line:

  - `@pikku/react` gains `useDevActors()`, `signInAsActor()` and `parseDevActors()`.
    UI-free, so it stays inside the package's react-only dependency budget.
  - `@pikku/mantine/dev` gains `<DevActorSwitcher />`, built on that hook. It is a
    new entry point rather than part of `/core`, because `/core`'s contract is
    "drop-in alias for `@mantine/core`" and exporting a component Mantine has no
    counterpart for would break it.

  The component takes `onSignedIn` rather than depending on a router, and the
  actors/secret are passed in rather than read from env — how env is spelled is a
  bundler fact (`import.meta.env.VITE_*` vs `process.env.NEXT_PUBLIC_*`), and a
  package that guesses gets it wrong for half its consumers.

  The skills document it in the four places an agent would look: `pikku-better-auth`
  for the `actor` plugin's endpoint (which had only `/dev/quick-login` before, and
  so sent agents to the wrong control), `pikku-scenario` for the actor list being
  the same one a human signs in through, `pikku-react` for the hook, and
  `pikku-fabric` for the validate rule that requires it.

  `fabric validate` now also accepts a `useDevActors()` call site as evidence the
  control is wired, so apps that want their own UI on the shared logic pass. The
  hand-rolled shape still passes too — nothing existing breaks. Its fix text no
  longer tells you to hand-write the helper, which would have become wrong advice
  the day this shipped.

- 20d8a39: Drop better-auth's `admin()` plugin.

  `admin()` bundles three unrelated things: a `role` column, fifteen HTTP
  endpoints authorized against that column, and the enforcement that stops a
  banned user from getting a session. Pikku only ever wanted the third. The
  endpoints were never reachable directly — each sat behind a pikku function with
  its own `admin:users:*` scope — so all the plugin added was a second gate on a
  column that had to be kept in step with the scopes it duplicated. That sync
  (`syncProjectedAdminRole`, run on every authenticated request) is now gone
  along with the column.

  User administration is implemented against better-auth's internal adapter
  instead, exported from `@pikku/better-auth` so `@pikku/addon-admin` and the
  `scaffold.userAdmin` generator share one implementation:

  ```ts
  import {
    createAuthUser,
    deleteAuthUser,
    revokeAuthUserSessions,
    setAuthUserBanned,
    setAuthUserPassword,
  } from '@pikku/better-auth'
  ```

  Ban keeps its schema and its enforcement, in a plugin that does nothing else:

  ```ts
  import { ban } from '@pikku/better-auth'

  betterAuth({ plugins: [ban()] })
  ```

  `ban()` adds `banned`, `banReason` and `banExpires` to `user`, refuses to create
  a session for a banned user, and lapses an expired ban at the sign-in that would
  otherwise be refused. It makes no authorization decision of its own, so it never
  needs to know about scopes.

  Breaking:

  - Remove `admin()` from your better-auth `plugins`, and add `ban()` if you ban
    users. `pikku db generate` writes the migration; `user.role` and
    `session.impersonatedBy` are no longer declared by anything.
  - `callAdminApi`, `AdminApiHttpWire`, `syncProjectedAdminRole`,
    `projectedAdminRole` and `ADMIN_ROLE_SCOPES` are removed. `ADMIN_SCOPES`,
    `ADMIN_SCOPE_ROOT` and `ADMIN_SCOPE_TREE` are unchanged.
  - The `scaffold.userAdmin` codegen no longer fails without `admin()`. It now
    fails only when there is no better-auth at all, and warns when `ban()` is
    missing — banning is one capability of six, so the other five still generate.
  - The scope on each function is now the whole authorization decision. Anywhere
    that relied on `user.role` as a backstop no longer has one.

- 727671b: Make the public surface an artifact the CLI produces.

  `@pikku/cli` now ships `surface.json`, computed when the CLI is built by
  generating one application and one addon and reading what each `#pikku/*` leaf
  exports, plus a curated `@pikku/core` entry point for people building on the
  ecosystem. Consumers resolve it as `@pikku/cli/surface.json`.

  `pikku all` writes the matching per-project overlay to
  `<outDir>/surface-usage.gen.json`: how often each export is imported and which
  source areas it was seen in. The counting happens inside the sweep the inspector
  already makes over every source file, so a prebuild pays no extra pass.

- f25f4a2: Fix seven defects found taking one project through `pikku fabric` to deploy

  **`deploy plan` rewrote the project's own scaffold.** Per-unit codegen re-runs
  `pikku all` with `--outDir` pointed at a unit's `.pikku`, and scaffold imports
  are computed against `config.outDir` — so `console.gen.ts` came back importing
  `../../../../../.deploy/cloudflare/units/<unit>/.pikku/pikku-types.gen.js` and
  the source stopped typechecking until the next ordinary `pikku all`.

  A guard for this already existed in four generators and had never once fired:
  `LocalVariablesService.get` runs values through `JSON.parse`, so
  `PIKKU_DEPLOY_CODEGEN=1` arrived as the number `1` and every `=== '1'` test
  was false. The comparison is fixed behind a shared `isDeployCodegen`, and the
  real guard now sits in the file writer, which refuses writes _and removals_
  under the scaffold directory for the duration of a per-unit run. Guarding the
  writer rather than each generator matters here: seven further generators had no
  guard at all, several write scaffold source and `.pikku` artifacts in the same
  pass (so an early return would skip too much), and the legacy-scaffold pruners
  delete from the source tree without going through a generator.

  **`fabric validate` passed on a project that could not deploy.** Deploy clones
  the repository, so a `pikkufabric.config.json` that exists only in the working
  tree is absent exactly when it is needed, and the build container aborts with
  `pikkufabric.config.json not found in repository root`. Validate now reports
  that as an error, and its success line distinguishes "can be linked" from
  "will deploy" instead of reporting unqualified success at a project that is not
  linked yet.

  **`description` reached `infra.json` as raw source.** `getPropertyValue` fell
  back to `node.getText()`, which is indistinguishable from the value for a lone
  literal — so nobody noticed that a description written as `'a ' + 'b'` arrived
  with the quotes and the `+` still in it, and rendered that way in the console.
  Compile-time constant strings are now folded, checker-free, so a node that
  cannot be resolved statically still takes the old path.

  **A wired addon that was not installed failed silently.** A missing package
  makes `resolveAddonMeta` return null, which was caught and downgraded to a
  warning; every `ref('<namespace>:…')` then resolved to nothing and the surface
  was dead at runtime with nothing in the build output saying why. The generated
  console is the common case. `wireAddon` now requires its package to be
  installed (`PKU340`), the mirror of the existing `wireRemoteAddon` check whose
  own docs already described this half as if it existed.

  **The audit-table check demanded an unquoted identifier.** Kysely's schema
  builder always quotes, so `create table "audit"` read as missing on the
  projects most likely to have it. Both this and the better-auth table checks now
  share one matcher that accepts each dialect's quoting — matched pairs only, so
  `"audit'` is not a hit — plus an optional schema qualifier.

  **Cloudflare bundles kept `pg`.** `getStubModules()` named `postgres` and
  `kysely-postgres-js` but not `pg`, which is the more common driver in
  application code, equally unreachable on a Worker, and additionally pulls at
  `net`/`tls` and `pg-native`, which a Worker build cannot resolve at all.

  **The deploy plan listed one secret twice.** Two `defineSecret` calls may
  legally share a `secretId` under different local names — the auth scaffold's
  `betterAuthSecret` alongside a hand-written one is the everyday case — and the
  manifest mapped them straight through, so the plan printed two identical
  `create` lines for one resource and `countUnchanged` counted it twice. Secrets
  and variables are now deduplicated in the manifest itself, where variables were
  already being collapsed by accident downstream.

- 20d8a39: Generate the schemas a first build used to leave out.

  A contract type reaches the schema generator only through a file that imports
  it, and for a type exported by nothing but its own function file that file is
  the RPC internal map — which `pikku all` writes _after_ schemas. On a first
  build there is no map to read yet, so those schemas came out missing from a run
  that otherwise succeeded, and the RPC failed with `MissingSchemaError` on its
  first call in a deployment. A second `pikku all` fixed it, which is why this
  only ever bit fresh checkouts and CI.

  `pikku all` now re-inspects and re-generates schemas when the build that just
  wrote the RPC internal map for the first time left contract references
  unresolved — the condition PKU463 already reports. Confined to that build: a
  project whose references are unresolved for some other reason would otherwise
  pay a second inspection on every run for a re-generation that cannot help it.

  `@pikku/inspector` exports `unresolvedSchemaReferences(state)`, the check behind
  PKU463, so the decision can be made without re-deriving it.

- 8e6b661: Emit the gateway surface into `#pikku/gateway`

  `wireGateway` had meta codegen but no types codegen, so the only way to wire a
  gateway was to import `@pikku/core/gateway` directly. It now generates
  `#pikku/gateway`, carrying a project-typed `wireGateway`, `GatewayWiring`, a
  `PikkuGatewayAdapterFactory` that receives the project's own `SingletonServices`,
  and the adapter/message types an implementation needs.

  It gets its own barrel rather than joining the `pikku-types.gen.ts` hub, so the
  generated surface does not repeat the root-barrel duplication it replaces.

- 3561d67: feat(graph): per-item `forEach` fanout for declarative workflow graphs

  A graph node can now run once per element of an upstream array:

  ```ts
  postVideo: {
    forEach: 'getMyVideo',              // or (ref) => ref('getMyVideo', 'rows')
    mode: 'sequential',                 // optional, defaults to 'parallel'
    input: (ref, template, $item) => ({ url: $item('URL VIDEO') }),
  }
  ```

  Each element runs as its own step instance (`postVideo[0]`, `postVideo[1]`, …)
  and the node's result is the ordered array of per-item results, so a fanned node
  chains straight into another `forEach`. Downstream nodes wait for every item. A
  non-array source fails the run loudly instead of coercing.

  The change is additive: `forEach` and `mode` are new optional node fields, and
  `$item` is appended after `template` so existing `input: (ref) => …` and
  `input: (ref, template) => …` nodes are unchanged.

- 9537f74: Every definer an app calls is now reachable through its `#pikku` leaf.

  `defineCredential` had no generated door, so a credential file had to name
  `@pikku/core/credential` directly — the one import in an otherwise
  `#pikku`-only wiring that reached past the leaf. It is now generated into the
  project's own `.pikku` alongside `defineSecret`, `defineVariable` and
  `defineScope`, and `cors` joins the names the `#pikku/http` leaf carries.

  A leaf index re-exports every entry file the leaf has rather than only the
  first, so the definer and the typed service map are both reachable through
  `#pikku/<leaf>` instead of one of them being left behind a relative path into
  `.pikku`.

  The definition types are also generated before the leaf indexes are written,
  not after. They read only `config`, so nothing held them back to the inspected
  pass, and running them there left the first codegen after an upgrade with a
  `#pikku/credentials` that resolved but was missing `defineCredential`.

- 892100b: Generate the meta service under `services/` and reach it through `#pikku`

  `pikku-meta-service.gen.ts` was written loose at the root of the output dir
  while every wiring type sat in its own subdir, and both call sites that consume
  it reached past the `#pikku` imports map to a relative path into the generated
  tree — `e2e/src/services.ts` with a static import, the `functions` template with
  a dynamic `await import('../.pikku/pikku-meta-service.gen.js')`. It now lands at
  `services/pikku-meta-service.gen.ts` and is imported as
  `#pikku/services/pikku-meta-service.gen.js`, matching the `<dir>/pikku-<x>.gen.js`
  shape the rest of the generated tree already uses. Bootstrap prunes the old root
  file, since a project generated before the move would otherwise keep compiling
  it. The console addon's "metaService is required" error names the new path.

  The `functions` template had no `imports` map at all, so its generated-code
  imports were all relative; it now declares `"#pikku/*": "./.pikku/*"` and its
  `services.ts` goes through it.

- 892100b: Make the generated `NodeConfig` narrowing reach the place people write `node:`

  An addon declares its categories in `pikku.config.json`, and the CLI generates a
  `NodeConfig` whose `category` narrows to that union. It never checked anything:
  `pikkuFunc`'s config came straight from `CorePikkuFunctionConfig`, whose
  `node?: CoreNodeConfig` types `category` as `string`. The narrowed type was
  generated for two sibling barrels — the workflow and scenario configs import it
  — and for nothing else, so the one position a user writes a `node:` block was
  typed by core all along. `PikkuFunctionConfig`, `PikkuFunctionSessionlessConfig`
  and both schema-overload variants now omit core's `node` and re-add it as
  `NodeConfig`, so an undeclared category is a compile error rather than only a
  codegen critical.

  Second half of the same bug: the config key that carries those categories moved
  from a top-level `node` block to `addon` when node was renamed to addon, and
  eight config files in this repo were never migrated — every e2e addon,
  `@pikku/addon-graph`, the `function-addon` template and the registry verifier.
  `addon` accepts `boolean | object` and the stray `node` key was silently
  ignored, so each of them shipped `"package": {}` in its generated addon
  metadata: no displayName, no description, no icon, no categories, and
  `pikkuNodesMeta`'s category validation never ran. They now sit under `addon`.

  With that validation live for the first time, `@pikku/addon-graph`'s `readFile`
  and `writeFile` turned out to declare a `Files` category the package never
  listed. `Files` is now declared.

- 2b57ca8: A persona can name the `app` they sign into, and a browser run takes a url per app (`--app-url <app>=<url>`, or `appUrls` on the environment). Each actor's browser context navigates against its own app's base, so a product that is more than one frontend can be proved in one run — including a scenario that crosses from one app to the other. A run whose personas name an app nobody gave a url for is refused rather than browsing the wrong app's pages.
- 266e3bc: `#pikku` is a namespace, not a module: one subpath per wiring

  The bare `#pikku` specifier resolved to `.pikku/pikku-types.gen.ts`, a hub that
  re-exported all twelve wiring leaves with `export *` — undoing the split the
  leaves exist for, each of which still says so in its own generated header
  ("HTTP-specific type definitions for tree-shaking optimization"). Reaching that
  hub put 33 distinct `@pikku/core` subpaths into the module graph, and neither
  consumer could drop them again: bundlers keep `export *` chains because the app
  declares no `sideEffects`, and Node and tsx do not tree-shake at all, so an app
  with no queues still executed `@pikku/core/queue` at boot.

  The hub is gone. An app now imports the leaf the name belongs to —
  `#pikku/function`, `#pikku/http`, `#pikku/workflow` — and a project's `imports`
  map declares two patterns, because both resolvers pick the more specific one:

  ```json
  "#pikku/*.js": "./.pikku/*.ts",
  "#pikku/*": "./.pikku/*/index.ts"
  ```

  A source tree names the `.ts` on both. Webpack, esbuild and Bun all rewrite a
  `.js` specifier to the `.ts` beside it for a relative import but not for an
  imports-map target, so a `.js` target there resolves to a file that does not
  exist. The two places that keep `.js` are the ones where it is the real file: a
  published addon, whose map points into `dist`, and a project that imports a
  declaration-only generated file such as `pikku-rpc-wirings-map.gen.d.ts`, where
  naming the `.js` lets the type resolver's own mapping reach the `.d.ts`.

  `pikku` generates the leaf indexes and removes the hub, and `pikku validate`
  reports a barrel import as an error. The split also turns the addon boundary
  from advice into a rule: an addon never generates the wiring leaves, so
  `#pikku/http` fails at the specifier rather than yielding "no exported member"
  from a hub that quietly dropped the re-export.

- 892100b: Stop generating `console/pikku-node-types.gen.ts`

  The file held two aliases and nothing else: `NodeCategory`, which was `never`
  unless a project declared addon categories, and `NodeRPCName`, which was
  `keyof FlattenedRPCMap` — the RPC map the user already imports. Neither had a
  consumer anywhere in the repo, the templates or the verifiers, and both are
  derivable at the point of use, so the codegen step existed to write a file that
  was re-exported through `#pikku` and then never named.

  Gone with it: the `pikkuNodeTypes` command, its two `all` workflow steps, its
  `bootstrap` invocation, and the `nodeTypesFile` config entry. The function-types
  command deletes any copy left at the old path, since `tsc` compiles every file
  in the output tree whether the hub re-exports it or not.

- 9fce0f1: Give a persona step its actor instead of making it unwrap one

  `requireActor(scenarioStep)` was the first line of every step that acts as
  somebody, and it existed because the actor lived on the `scenarioStep` wire as
  an optional property. A property of a wire member is either optional for every
  binding or required for all of them, so the only expressible answer was
  "optional", and each step paid for it with a guard.

  The actor is now its own wire member, `wire.actor`, injected by the runner. Wire
  members can be required per binding, so a step declares whether it runs as
  somebody and the type follows:

  ```typescript
  export const buysAnApple = pikkuScenarioStep<
    { qty: number },
    { orderId: string }
  >({
    name: 'buysAnApple',
    actor: true,
    default: async (_services, { qty }, { actor }) =>
      actor.invoke('placeOrder', { qty }),
  })
  ```

  A `browser` binding implies it — a window is opened as somebody, so every
  binding of a step that has one gets the actor too. A step that declares neither
  has no `actor` on its wire at all, rather than an optional one: a pure assertion
  over what an earlier step returned has nobody to be, and `attemptsSignIn`
  deliberately posts credentials instead of reusing an actor's established
  session. That distinction is why the requirement is declared per step rather
  than inferred from the step being a persona step — "persona step ⇒ has an actor"
  is false, and a guard built on it rejects the 61 steps in the e2e suite that
  correctly run without one.

  Dispatching a step that declared an actor without `{ actor: actors.x }` now
  fails before the body runs, with `ScenarioActorRequired` naming the step.
  `ScenarioBrowserActorRequired` is replaced by it, and `requireActor` is gone
  from `@pikku/core/scenario` and the generated `#pikku/scenario` barrel.

- 83683a0: Give the scenario test surface its own `#pikku/scenario` entry

  Scenario files are app code, so they belong inside the generated alias — but
  they are a distinct surface from wiring, and folding ~11 test-only names into
  the main hub would crowd it for every app that never writes a scenario. They
  get their own sub-entry instead.

  The generated scenario barrel now re-exports the helpers a step file reaches
  for — `requireScenarioEnv`, `createCookieJar`, `pollUntil`,
  `createScenarioRunner`, `postScenarioJson`, `readScenarioHttpResponse` and the
  types beside them — so a scenario file has one specifier to import from and
  never has to know whether a helper is typed against this project or shipped by
  the framework. The names come from the `@pikku/core/scenario` and
  `@pikku/core/persona` subpaths that own them.

- 456c88b: Scenario runs are now kept, and the console reads them back.

  Every `pikku scenario run` files a record: the run's outcome and counts, each
  scenario's result with the prose of the steps as they read at the time, and the
  screenshots and video it left behind. The steps are snapshotted rather than
  referenced, so a run still reads correctly after the scenario that produced it
  has been rewritten.

  `ScenarioRunStore` is the interface, `FileScenarioRunStore` the on-disk
  implementation the CLI writes to — one folder per run, `run.json` beside its
  artifacts, under `<outDir>/scenario-runs`. It is a store in its own right rather
  than a corner of the workflow service, so a hosted console can keep the same
  records in a database and its footage in object storage without the functions
  that read them knowing the difference.

  The console's Scenarios page gained a Runs view (`?view=runs`) listing past
  runs, with a run's results, its step ladder, failures, and the screenshots and
  video inline. Reading and deleting runs are gated by the new
  `pikku:console:scenarios:read` and `pikku:console:scenarios:manage` scopes.

- 456c88b: Scenario runs now record video by default and keep the footage that is worth watching.

  Playwright decides recording when a window opens, which is before anyone knows
  whether the scenario passed — so `--video failed` (the new default) records every
  scenario and discards the passes. `--video all` keeps everything, `--video off`
  records nothing. Recording costs ~0.1-0.5s per actor context, nearly all of it
  finalising the file on close; only kept videos are encoded, so a green run pays
  no encoding at all.

  Kept recordings are filed under `<run>/<scenario>/<actor>` alongside that
  scenario's screenshots, rather than landing in one flat folder under
  Playwright's own generated filenames.

  Encoding is now h264/mp4 rather than VP9/webm: measured on scenario footage it
  runs ~11x faster and lands ~30% smaller, and mp4 plays in every browser.

  `--screenshots` is unchanged and still opt-in.

- 892100b: Give scenarios their own barrel, and stop two generated files sharing a name

  `#pikku/workflow/pikku-workflow-types.gen.js` carried the whole scenario
  surface — `pikkuScenario`, `pikkuScenarioStep`, `pikkuFeature`, the hooks, the
  step-surface bindings and `TypedScenario`. A scenario is a testing primitive, so
  every project that only ships workflows was importing it anyway. Scenarios now
  live in `#pikku/scenarios/pikku-scenario-types.gen.js`, beside the scenario
  bootstrap that already had its own directory, and the workflow barrel keeps only
  `pikkuWorkflowFunc`, `pikkuWorkflowComplexFunc`, `pikkuWorkflowGraph`,
  `TypedWorkflow` and the graph machinery.

  The two barrels share exactly one name across the boundary: `TypedScenario`
  extends `TypedWorkflow`, so the scenario file imports it. The config shape is
  _not_ shared — the workflow's own config type is private, and exporting it just
  so the scenario barrel could `Omit` from it would put a name back on the public
  surface to serve a generator-internal relationship. The common fields are
  emitted from one definition in the generator instead.

  Second fix in the same area: `pikku-personas.gen.ts` existed twice, under
  `scopes/` and under `workflow/`, holding different things — `definePersonas`
  in one, the runtime `TypedPersonas` in the other — which made them impossible to
  tell apart by import path. The runtime one moves to
  `#pikku/scenarios/pikku-personas.gen.js`, next to what uses it, and the workflow
  command deletes the copy left at the old path so `tsc` does not keep compiling
  a stale file nothing imports.

  Also removes the `WireAddonConfig` / `WireRemoteAddonConfig` / `RemoteAddonAuth`
  pass-through from the function barrel: `wireAddon` and `wireRemoteAddon` both
  return `void`, so those three were parameter types with no reader.

- 727671b: Keep wiring out of an addon's `#pikku` surface

  The leaf barrel is a blanket `export *`, so every `wire*` a generator emitted
  became importable from an addon — where it cannot reach the host's registry and
  so could only fail. An addon build now emits the `define*` / `pikku*Func` half
  only, the way `#pikku/cli` already disappeared for addons: `wireHTTP`,
  `wireHTTPRoutes`, `wireChannel`, `wireQueueWorker`, `wireScheduler`,
  `wireTrigger`, `wireTriggerSource`, `wireMCPResource`, `wireMCPPrompt`,
  `wireGateway`, `wireAddon` and `wireRemoteAddon`.

  `VARIABLES_META` and `SECRETS_META` are gone from `#pikku/variables` and
  `#pikku/secrets`. They existed only to keep the metadata sidecar import from
  being elided, and nothing imported them — a host reads the sidecar off disk. A
  side-effect import now anchors the .json instead.

- c127273: fix: type `wire.getCredential` from the generated `CredentialsMap`

  `wire.getCredential('slack')` now resolves its value type from the project's
  credentials codegen, the way `services.credentials.get('slack')` already did.
  `PikkuWire` takes a `TypedCredentials` parameter and the generated function
  types bind `CredentialsMap` into it; a name the map does not know stays callable
  with an explicit type argument.

- 9d9949c: Keep the generated surface to types a user cannot derive

  A generated type earns its export in exactly one case: it is reachable from an
  exported factory's return type _by name_, so declaration emit in the user's own
  module has to name it. Everything else is private — users reach types through
  `ReturnType<typeof fn>` or `typeof myValue`, which keeps the factory the single
  entry point and keeps the documented surface small.

  "By name" is the load-bearing part, and it is narrower than it looks: for an
  alias to an object literal or an intersection, TypeScript writes the shape
  structurally into the `.d.ts` and never mentions the alias, so being a return
  type is not on its own enough. Only `tsc --declaration --emitDeclarationOnly`
  can tell the two apart — `--noEmit`, which is what `pikku --tsc` runs, cannot
  surface TS2883 at all.

  Four kinds of name lose their export:

  - **Overload-parameter shapes**, which only name the `config` argument inside an
    overload signature: `PikkuFunctionConfigWithSchema`, `PikkuAuthConfig`,
    `PikkuAuth`, `WiredAuthServices`, `WiredSingletonServices`, `TriggerWiring`,
    `TriggerSource`, `PikkuTriggerFunction`, `PikkuTriggerFunctionConfig`,
    `EmailTemplateVariables`, `RenderEmailInput`, `EnvironmentName`,
    `TypedPersona`, and the workflow/scenario config shapes.
  - **Generated id unions** that nothing derives and nothing consumed —
    `PersonaId`, `RunnablePersonaId`, `SecretId`, `VariableId`, `CredentialName`
    and `WorkflowNames` are no longer emitted at all, since an unexported type
    that nothing references is an unused-local error.
  - **Raw `@pikku/core` re-exports** that rode along beside a factory:
    `defineScope`, `defineSystemRole`, `defineSecret` and `defineVariable` all
    return `void`, so `CoreScopes`, `CoreScopeNode`, `FlatScope`, `CoreSystemRole`,
    `CoreSystemRoles`, `SystemRole`, `CoreSecret`, `CoreVariable` and the
    `*DefinitionMeta` / `*DefinitionsMeta` metadata shapes were only ever
    parameter types or console internals. The generated files that genuinely need
    them already import them straight from the `@pikku/core` subpath that owns
    them.
  - **Names with no reader at all** — `PikkuListFunction`, referenced by nothing,
    not even `pikkuListFunc`; and `template`, which a graph never reaches for by
    name because the `input` callback is handed it as its second argument,
    `(ref, template) => ...`.

  Types imported across generated barrels stay exported — `PikkuFunction`,
  `NodeConfig`, `RequiredWireServices` and `SystemRoleName` are each named by a
  sibling `.gen.ts`, which is the same declaration-emit constraint one step out.
  `pikkuVoidFunc` gains the explicit `PikkuFunctionConfig` return type its sibling
  factories already declare.

- 727671b: `wireAddon` and `wireRemoteAddon` move from `#pikku/function` to `#pikku/addon`.

  Installing an addon and authoring one are the same concept from opposite ends,
  so they are one import: an application's `#pikku/addon` carries the two install
  functions, an addon package's carries `pikkuAddonConfig`, `pikkuAddonServices`,
  `pikkuAddonWireServices` and `AddonBaseServices`.

  Two generation fixes came with it:

  - `CredentialsMap` is generated as a type alias rather than an interface. An
    interface has no implicit index signature, so it was never assignable to the
    `Record<string, unknown>` that `GetCredential` is constrained by, and every
    generated project reported two errors on its own function types.
  - An unresolved `SingletonServices` type is now `PKU724` instead of a services
    map with no entries in it. Written out, the empty map made every service
    optional and the real failure resurfaced as unrelated "possibly undefined"
    errors in files nobody had touched.

- 91975ed: fix(cli): read `pikku audit --outdated` update rows the way bun actually prints them

  Two bugs in how `bun outdated` output was turned into the audit report:

  - bun annotates the section a dependency comes from in the Package cell —
    `@types/node (dev)`. That annotation was kept as part of the package name, so
    nothing downstream could match on it: the console's "Update dependency" action
    looked for `@types/node (dev)` in package.json and reported it was not a direct
    dependency, and an advisory against a dev dependency never joined to its update
    and so was offered no version to move to. A package depended on from two
    sections was also listed twice.
  - `semverLevel` compared major, minor and patch independently, so `2.0.0 → 1.9.9`
    came out as a `minor` update. The console presents `patch` and `minor` as the
    safe one-click bump, so a downgrade could be offered as the reassuring option.
    Components are now compared in order, stopping at the first that differs.

- Updated dependencies [ab52d8e]
- Updated dependencies [7722ceb]
- Updated dependencies [375c1ff]
- Updated dependencies [20d8a39]
- Updated dependencies [02a70cd]
- Updated dependencies [aeef159]
- Updated dependencies [a281de6]
- Updated dependencies [266e3bc]
- Updated dependencies [02a70cd]
- Updated dependencies [786dae5]
- Updated dependencies [6eef0a0]
- Updated dependencies [3b1164a]
- Updated dependencies [20d8a39]
- Updated dependencies [727671b]
- Updated dependencies [f25f4a2]
- Updated dependencies [20d8a39]
- Updated dependencies [3561d67]
- Updated dependencies [a91c433]
- Updated dependencies [02a70cd]
- Updated dependencies [9537f74]
- Updated dependencies [2b57ca8]
- Updated dependencies [266e3bc]
- Updated dependencies [456c88b]
- Updated dependencies [9fce0f1]
- Updated dependencies [83683a0]
- Updated dependencies [456c88b]
- Updated dependencies [9fce0f1]
- Updated dependencies [456c88b]
- Updated dependencies [c127273]
- Updated dependencies [727671b]
  - @pikku/inspector@0.12.61
  - @pikku/core@0.12.85
  - @pikku/n8n-import@0.0.7
  - @pikku/skills@0.12.11
  - @pikku/better-auth@0.12.26
  - @pikku/bun-server@0.12.8
  - @pikku/node-http-server@0.12.11
  - @pikku/schedule@0.12.7
  - @pikku/ws@0.12.8
  - @pikku/ai-vercel@0.12.12
  - @pikku/kysely@0.13.17
  - @pikku/knowledge@0.12.7
  - @pikku/kysely-node-sqlite@0.12.6
  - @pikku/openapi-parser@0.12.20
  - @pikku/playwright@0.12.78
  - @pikku/deploy-cloudflare@0.12.12

## 0.12.105

### Patch Changes

- 7406bfe: Rename the agent runtime from `AI*` to `Agent*` (#596)

  `AI` described the model provider, not the thing being named. Every symbol that
  belongs to the agent runtime now says `Agent`; the symbols that genuinely wrap a
  model provider — `AIEmbeddingService`, `AIProviderOptions`, `AIEmbedParams`,
  `AITranscriptionParams`, `AIGenerateImageParams` and their siblings, and the
  `@pikku/ai-vercel` / `@pikku/ai-deepinfra` / `@pikku/ai-voice` packages — keep
  their names.

  **Wiring**
  - `pikkuAIAgent` → `pikkuAgent`, `pikkuAIScorer` → `pikkuAgentScorer`,
    `pikkuAIJudge` → `pikkuAgentJudge`
  - `CoreAIAgent` → `CoreAgent`, `AIAgentInput` → `AgentInput`, `AIAgentStep` →
    `AgentStep`, `AIMessage` → `AgentMessage`, and the rest of the agent types
  - `AIAgentRunnerService` → `AgentRunnerService`, `AIStorageService` →
    `AgentStorageService`, `AIRunStateService` → `AgentRunStateService`

  **Entry points**

  `@pikku/core/agent` → `@pikku/core/agent`, `@pikku/core/agent-scorer` →
  `@pikku/core/agent-scorer`.

  **Queues**

  The scorer queues are now `agent-score-fast` and `agent-score-slow`. Drain the
  old `ai-score-fast` / `ai-score-slow` queues before deploying — jobs still
  sitting on them when the new workers start will never be picked up.

  **Scaffolds**

  The agent scaffold pikku wrote for your project — `<scaffold>/agent/agent.gen.ts`
  and its schemas file — imports `@pikku/core/ai-agent`, which no longer exists. A
  scaffold is normally written once and then left alone, so `pikku all` would find
  it present and leave the broken import in place. It now deletes an agent scaffold
  importing either removed entry point and regenerates it in the same run. Anything
  you added to that file goes with it, so move local edits out first.

  **Database**

  The agent tables are renamed: `ai_threads`, `ai_message`, `ai_tool_call`,
  `ai_working_memory`, `ai_run` and `ai_run_score` become `agent_threads`,
  `agent_message`, `agent_tool_call`, `agent_working_memory`, `agent_run` and
  `agent_run_score`, along with their indexes and the `ai_working_memory_pk`
  constraint. The same rename applies to the MongoDB collections.

  `ensurePikkuSchema` creates tables it cannot find, so an existing database will
  get empty `agent_*` tables and leave the old data stranded in `ai_*`. Rename
  them before the first boot on the new version:

  ```sql
  ALTER TABLE ai_threads        RENAME TO agent_threads;
  ALTER TABLE ai_message        RENAME TO agent_message;
  ALTER TABLE ai_tool_call      RENAME TO agent_tool_call;
  ALTER TABLE ai_working_memory RENAME TO agent_working_memory;
  ALTER TABLE ai_run            RENAME TO agent_run;
  ALTER TABLE ai_run_score      RENAME TO agent_run_score;
  ```

- 7406bfe: Declare `better-auth` as an optional peer dependency of the CLI.

  `pikku db generate` resolves `better-auth` with `require.resolve` from the CLI's
  own module so it can read the auth schema, but the CLI never declared it. Under
  a hoisted install it happened to resolve through `@pikku/better-auth`, which
  declares it as a peer; under a strict layout it does not resolve at all. Optional
  so the vast majority of projects, which do not use Better Auth, still install
  nothing extra — the same shape `@pikku/playwright` already has here.

- eadea64: Keep the app's own config readable while `pikku dev` regenerates.

  Codegen needs the CLI's config, so `pikku dev` overlays it onto the live
  singleton services for the length of a regeneration. The services around it were
  overlaid key by key, but the config was swapped wholesale — so for as long as
  codegen ran (tens of seconds on a large project) every function reading
  `services.config` saw the CLI's `pikku.config.json` instead of what
  `createConfig` returned. A webhook's host allowlist would vanish mid-flight and
  the delivery be refused as an unsafe host.

  The config is now overlaid the same way: the CLI's keys win where the two name
  the same thing, and the app's survive where they don't.

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- a7fcd2e: Declare dependencies that were imported but missing from `package.json`

  `@pikku/openapi-parser` and `@pikku/better-auth` imported `zod`, `@pikku/next`
  imported `path-to-regexp`, `@pikku/cli` imported `kysely`, and
  `@pikku/assistant-ui` imported `rxjs`, none of which were declared. Each
  resolved through Yarn hoisting inside the monorepo and would fail for anyone
  installing the package on its own.

  `rxjs`, `kysely` and `path-to-regexp` reach consumers through public
  signatures — `Observable<BaseEvent>` is the return type of a published method,
  and `createCoercionPlugin` returns a `KyselyPlugin` — so they are runtime
  dependencies rather than build-only ones.

  `@pikku/assistant-ui` pins `rxjs` to the exact `7.8.1` that `@ag-ui/client`
  pins, rather than a caret range. The two packages exchange `Observable`s, so a
  range that floats to a second copy gives them two incompatible `Observable`
  types.

  `@pikku/kysely` also drops `SqliteSerializePlugin`, an alias of
  `SerializePlugin` that has been marked `@deprecated` in favour of it. Use
  `SerializePlugin`.

- e7e5319: Add `pikku semver`, which derives a release's semver from a diff against a deployed surface and writes `.pikku/changes.gen.json`

  A function or client-facing wiring that disappeared is major, an addition is minor, and a surface that did not move is patch. Where the generated JSON Schemas are available the verdict goes below the id level: a removed field or a newly required input field is breaking, an added optional one is not — direction-aware, so an output field going optional counts even though the same change on an input does not. `versions.pikku.json` is consumed, so a `@v2` bump does not read as a removal while v1 is still published.

  The baseline is `--against <path|url>`: another `.pikku` directory, a snapshot file, or a snapshot published by `pikku semver --emit`. `--fail-on <level>` turns the verdict into a CI gate.

- 411f89a: Add `pikku update`: report which `@pikku/*` dependencies can move forward, and which peers those versions need.

  Reporting only by default. `--update` writes the new ranges into every covered package.json — the project root plus every workspace it declares — and then runs an install with the package manager the project names (`--no-install` to skip). `--update-peers` additionally writes the ranges unsatisfied peers require; it is separate because a peer bump can cross a major of a third-party package.

  Peers are read off the version the run lands on rather than the one installed, so an update that needs a companion bump says so before it is applied. Ranges that cannot be substituted into (`workspace:*`, `file:`, unions, x-ranges) are reported and left alone, and a package the registry could not answer for is reported as unresolved rather than current.

- eadea64: fix(scenario): a scenario that cannot run on the requested surface fails the run instead of skipping it

  `pikku scenario run` held back two very different things under one SKIP and exited
  0 for both. A `skip` on the scenario is the project quarantining it on purpose and
  should stay green. A scenario with no binding for the run surface and no `default`
  to fall back to is nothing of the sort — it was asked for and could not run, which
  is a misconfigured run.

  Reporting both as skips made "62 held back" and "62 passed" indistinguishable at
  the exit code. That is not hypothetical: the e2e console suite ran `--tags console`
  without `--run browser`, so every browser scenario had no runnable binding, and the
  job passed for months having executed four scenarios out of sixty-six.

  Unrunnable scenarios now name themselves and set a non-zero exit code, pointing at
  the two ways to resolve it — run them on the surface they are written for, or hold
  them back explicitly with `--exclude-tags`.

  `--no-browser` is gone. It was meant to be the blunt form of `--run default` for a
  machine without a browser, but the only branch that consulted it required
  `--run browser` to have been passed already, so it never fired in any invocation;
  `--exclude-tags` says the same thing about what is not being run, and says it
  explicitly.

- b3c77f5: Fail validate when a workspace subpath import cannot resolve through the owning package's exports.

  `exports` does not probe file extensions the way a bundler alias does, so a map
  like `"./pikku/*": "./src/pikku/*"` resolves `pkg/pikku/client.gen` to a file
  that was never written — the real one is `client.gen.ts`. Nothing surfaces it
  while the consumer carries a `resolve.alias` for the same specifier: the alias
  wins wherever that config is loaded, and the broken map only bites somewhere
  else — another app in the repo, a different bundler, plain node, or a generated
  vite config that never merged the app's own.

  The new check pairs every workspace-internal subpath import with the owning
  package's `exports` and reports the ones that resolve to nothing, matching
  Node's pattern precedence (longest literal prefix, then longest suffix) and
  following fallback arrays so a declaration-only subpath still counts as
  resolvable. It runs once at the workspace root, where both halves are in view,
  and reports each broken subpath once rather than once per importer.

- 5e4105e: fix(ws): cap the frame size every Pikku-owned WebSocketServer accepts

  `ws` defaults `maxPayload` to 100MB, and every `WebSocketServer` Pikku
  constructed omitted the option — so each one inherited that ceiling. A single
  unauthenticated upgrade could make the process buffer a 100MB frame, which no
  Pikku message needs: the channel protocol carries JSON control frames, not bulk
  payloads.

  `@pikku/ws` now exports `DEFAULT_WS_MAX_PAYLOAD` (1MB), and the servers Pikku
  owns are constructed with it — the `pikku dev` / `pikku serve` runner, the entry
  `@pikku/deploy-standalone` emits, and the `ws` template. Refusal is already
  defined by the protocol, so an oversized frame is closed with 1009 (message too
  big) rather than buffered.

  A server that genuinely needs to accept a larger frame now has to set
  `maxPayload` explicitly at its construction site. `yarn check:ws-max-payload`
  enforces that, so a new server cannot silently fall back to the 100MB default.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
- Updated dependencies [a7fcd2e]
- Updated dependencies [e7e5319]
- Updated dependencies [411f89a]
- Updated dependencies [5e4105e]
  - @pikku/core@0.12.84
  - @pikku/deploy-cloudflare@0.12.11
  - @pikku/inspector@0.12.60
  - @pikku/n8n-import@0.0.6
  - @pikku/ai-vercel@0.12.11
  - @pikku/kysely@0.13.16
  - @pikku/skills@0.12.10
  - @pikku/better-auth@0.12.25
  - @pikku/bun-server@0.12.7
  - @pikku/node-http-server@0.12.10
  - @pikku/playwright@0.12.77
  - @pikku/schedule@0.12.6
  - @pikku/ws@0.12.7
  - @pikku/openapi-parser@0.12.19

## 0.12.104

### Patch Changes

- 3a4d50a: feat(console): one scope per console area, under `pikku:console`

  The console gated itself on a single `admin` scope declared on `wireAddon`, so
  one grant covered reading a secret, rewriting a function body and reading the
  audit trail alike — and the secret and variable brokers, which the CLI emits
  into the app's own scaffold rather than the addon, were not covered by the addon
  gate at all and carried no scope of their own.

  Every console function now declares the area it belongs to:

  ```
  pikku:console:secrets      read | write
  pikku:console:variables    read | write
  pikku:console:addons       read | install
  pikku:console:credentials  read | manage
  pikku:console:scopes       read | manage   (was pikku:scopes:*)
  pikku:console:audit        read            (was pikku:audit:*)
  pikku:console:wirings      read
  pikku:console:security     read | run
  pikku:console:workflows    read | manage
  pikku:console:agents       read | manage
  pikku:console:db           read
  pikku:console:knowledge    read
  pikku:console:emails       read | write
  pikku:console:code         write
  ```

  `pikku:console` grants the lot, and `pikku` still grants that — the generated
  `PIKKU_CONSOLE_TOKEN` session carries `['admin', 'pikku']`, so an external
  console keeps working untouched.

  **Migration.** `admin` no longer reaches the console: it is a different tree.
  Grant `pikku:console` alongside `admin` to keep an administrator's access as it
  was, or grant the individual areas to hand out less. The two existing console
  scopes moved: `pikku:scopes:read` / `pikku:scopes:manage` are now
  `pikku:console:scopes:*`, and `pikku:audit:read` is now
  `pikku:console:audit:read`.

- 3a4d50a: Five `console:scope*` descriptions and two `pikku *-prune` warnings promised a
  grant or revoke "takes effect on their next request — no re-login". That is
  only true when `withResolvedScopes` actually resolves, and it skips resolution
  whenever `mapSession`/`mapKey` has already set `scopes` — which is
  authoritative and deliberately never overridden.

  So an app whose `mapSession` derives scopes from something like
  `result.user.role` — the shape the `wire-scope` scaffold teaches — can grant a
  scope from the console, see it stored, and have it never reach a session. The
  revoke direction is worse: `roles prune` and `scopes prune` reported that users
  lose the scopes on their next request when in fact they keep them.

  Copy only; no behaviour change. The docblock on `withResolvedScopes` now states
  that the propagation guarantee is conditional on resolution running at all, so
  the next person copying that sentence into UI copy carries the caveat with it.

- Updated dependencies [3a4d50a]
- Updated dependencies [eba75ea]
  - @pikku/better-auth@0.12.24
  - @pikku/playwright@0.12.76

## 0.12.103

### Patch Changes

- 02c4fe5: fix(core,inspector): let a host grant an addon secrets it could not declare

  Scoping an addon's `SecretService` to its `declaredSecrets` left generic addons
  with nothing readable: `declaredSecrets` is derived from the addon package's own
  source, but the secrets an addon like `@pikku/addon-graph` reads are named by the
  consuming app's workflow nodes at runtime. Every authenticated `graph:httpRequest`
  threw.

  `wireAddon` now takes `secretGrants: string[]` and `credentialGrants: string[]`,
  completing the grant family alongside `secretOverrides` (grant + rename) and
  `globalSecrets` (grant everything, with a reason). Grants name the secret as the
  addon reads it, since the scope check runs before the override map renames it —
  which is also why an override's key grants and its value does not.

  A grant naming a secret the project does not declare is an `INVALID_VALUE`
  critical at codegen, resolved through the override map before lookup.

- b5fa1e5: Enumerate addon secret and credential grants in the deployment manifest.

  `wireAddon`'s `secretGrants` / `credentialGrants` widen an addon's scope the same
  way `globalSecrets` does, only narrower — but the manifest reported the exemption
  and not the grant, so a deployment could not see the secrets an app had lent an
  addon. `grantedSecretAddons` and `grantedCredentialAddons` now list them by name,
  including override keys, since scoping is checked before an override renames.

  The `pikku-addon` skill documents the whole grant family and the scoping rule
  behind it, rather than the override fields alone.

- 438b776: Move the scenario and feature surface off `@pikku/core/workflow` and onto
  `@pikku/core/scenario`. Scenarios extend workflows, so the production workflow
  wiring no longer names a scenario module in its import graph. Feature and
  scenario types are declared in their own `scenario.types.ts` rather than in
  `workflow.types.ts`. Import `requireActor`, `requireScenarioEnv`, `pollUntil`,
  `createCookieJar`, `addFeature`, `ScenarioHttpResponse` and the rest from
  `@pikku/core/scenario`; `HttpPersonasConfig` now comes from
  `@pikku/core/persona` rather than `@pikku/core/services`.
- ad63f47: feat(cli): warn before codegen when a linked dependency splits a package's type identity

  `pikku all` now runs the split-type-identity check as a preflight, beside the
  existing `@pikku/core` one, and warns with `PKU719` naming each package, both
  versions and both paths.

  It has to run _before_ the work rather than after it fails. The failure it
  explains is a V8 heap OOM, which aborts the process — `process.on('exit')`,
  `uncaughtException` and `finally` never run, so nothing printed after the fact is
  ever seen. By the time there is a symptom, the only thing that can help is
  already on screen above it. Without this the user sees a codegen step that dies
  of memory pressure with no indication that two copies of one package are the
  reason, and the obvious next move is to raise `--max-old-space-size`, which
  hides it further.

  Warns rather than throws: a skewed linked dependency is a strong signal, not a
  certainty, and refusing to build on a heuristic would break working setups.
  `PIKKU_SKIP_TYPE_IDENTITY_CHECK=1` silences it, matching
  `PIKKU_ALLOW_DUPLICATE_CORE`. It also swallows its own errors — it runs on every
  codegen, so it must never be the reason a build stops.

- 4f80918: perf(cli): only resolve symlinks when scanning for external dependencies

  The split-type-identity check called `realpath` on every installed package.
  `realpath` lstats every component of the path it is given, so the scan scaled
  with the install layout rather than with anything interesting: 143ms on a
  hoisted tree (1781 packages at the root) against 7ms on an isolated one (35).

  A path that traverses no symlink cannot leave the project, and `readdir` already
  hands back the entry type, so ruling a package out costs nothing. Now 45ms
  hoisted and 3.5ms isolated — cheap enough to consider running before codegen
  rather than only in `validate`, which matters because the failure it detects
  kills the process rather than failing it.

  The two-hop case is what makes this fiddly, and it is the common one: bun links
  `node_modules/@scope/pkg` into an in-project store and the link out of the tree
  is the `dist` inside that target, so the first hop lands inside the project and
  proves nothing.

- 689ae0c: feat(cli): validate catches a linked dependency that splits a package's type identity

  A dependency linked into the project from another checkout (`link:`, `portal:`,
  or a hand-made `dist` symlink) resolves its own imports from that other tree's
  `node_modules`. When both trees carry the same package at different versions,
  TypeScript ends up with two unrelated declarations of the same interface and
  structurally compares them wherever they meet — which inside a generic
  inference chain compounds badly. Fabric's `api-functions` went from
  1.3GB/13s to a typecheck that never finished (8GB and 12GB heap ceilings both
  died, 7.7M types, single assignability checks taking eight seconds) because one
  package's `dist` pointed at a sibling checkout carrying its own `better-auth`.

  The failure mode is what makes it worth a check: it presents as "codegen is
  slow" or an out-of-memory crash, never as a version mismatch, and no existing
  check looked at it. Both `pikku validate` and `pikku fabric validate` now report
  `split-type-identity-<dep>-<pkg>` for each type-identity-sensitive package
  (`better-auth`, `@better-auth/core`, `@pikku/core`, `kysely`, `zod`) that a
  linked dependency resolves at a different version than the project does, naming
  both versions and both paths.

  Nothing about this is fabric-specific — linking a package from a sibling checkout
  is the normal way to develop a pikku package against a consuming app, which is
  exactly the population that hits it — so the check lives in the shared registry
  and runs for any project.

  It runs at the workspace root only: a linked dependency is a property of the
  install as a whole, so running it per workspace package would report the same
  pair once per package.

  This is distinct from the existing duplicate-copy check, which is about two
  physical copies of the _same_ version splitting module state at runtime. Dependency
  lookup probes workspace package directories as well as the root, so it also works
  under isolated/pnpm-style installs that never hoist to the root `node_modules`.

- Updated dependencies [02c4fe5]
- Updated dependencies [b5fa1e5]
- Updated dependencies [bba64c7]
- Updated dependencies [438b776]
- Updated dependencies [438b776]
- Updated dependencies [ad63f47]
  - @pikku/inspector@0.12.59
  - @pikku/core@0.12.83
  - @pikku/skills@0.12.9
  - @pikku/knowledge@0.12.6
  - @pikku/playwright@0.12.75

## 0.12.102

### Patch Changes

- ce66bf8: Give a CLI channel command the real singleton services

  The generated `cliRaw` is itself a pikku function, so its body receives
  `secrets` as a throwing accessor — and it passed that same object down as the
  **singleton** services for every command run on the channel. A command's
  middleware is entitled to `secrets`, but inherited the strip from one level up
  and failed with `'secrets' is not available inside a pikku function`.

  It now reads the singletons through `getSingletonServices()`. Each command is
  still stripped by its own runner, so nothing gains access it would not have
  over HTTP.

- ce66bf8: `pikku dev` now serves MCP.

  The dev server has always logged how many MCP endpoints an app declares, and
  both transports have always known how to mount them — but `dev` never handed
  one the generated manifest, so `mcpJson` was undefined and `initMCP` returned
  before mounting anything. Every app with MCP wirings announced a surface at
  startup and answered 404 on `/mcp`, and the only way to exercise a tool was to
  deploy. `deploy-apply` carries a comment describing the deployed bundle as
  matching "the dev server", which had never served it either.

  The manifest goes to the transport through the runner's _options_, not through
  its config. `PikkuBunServer` and `PikkuNodeHTTPServer` both read `mcpJson` off
  their third argument, and the runners forward a hand-picked set of fields — so
  a value placed in `config` type-checks, arrives nowhere, and mounts nothing
  without an error. `DevServerOptions` now carries `mcpJson` and both runners
  forward it, which is the same shape `contentSigningJWT` already needed.

  Reading the manifest is best-effort: an app with no MCP wirings has no
  `mcp.gen.json` and mounts nothing, and an unparseable one warns rather than
  failing the dev server.

  This also makes MCP tools testable. They are not reachable over RPC — the
  generated type union offers their names, but the runtime serves only
  `expose: true` functions — so before this change an MCP tool could not be
  invoked by a scenario, a browser or an MCP client without a deploy.

  **Note on auth.** An MCP call over HTTP carries the caller's request, so the
  app's own session middleware runs and a tool fronting a session-requiring
  function is authenticated like any other wiring. Two cases still reach a
  function anonymously, and mounting `/mcp` in dev makes them visible rather than
  introducing them:
  - **A requestless transport.** Stdio has no request to derive a session from, so
    everything it serves runs anonymous.
  - **A tool fronting a sessionless function.** It requires no session by
    construction, so it is callable by anything that can reach the mount — a
    mutating one included. Give it the scope its HTTP sibling has, and protect the
    mount at the transport where the surface is not meant to be public.

- ce66bf8: Import global middleware into deployed units when its entries are factory calls

  Per-unit codegen emitted the side-effect import for an `addGlobalMiddleware`
  source file only when the instance's `isFactoryCall` was false. That flag
  distinguishes `mw()` from `mw` as an array element; it does not mark a
  registration deferred behind an exported factory, and `addGlobalMiddleware`
  registers at module evaluation under either form. A global registration written
  in the ordinary way — `addGlobalMiddleware([sessionMiddleware()])` — was
  therefore left out of every deployed unit and silently no-opped at runtime,
  which for a session bridge or an auth gate fails open.

  Every existing test for this path used the identifier form, so the guard was
  never exercised.

- ce66bf8: MCP calls now carry the caller's HTTP request, so an MCP tool can require a session.

  Every auth middleware opens with `if (!http?.request) return`. The MCP runner
  never put an `http` on the wire, so all of them bailed on their first line and
  an MCP call reached the function with no session — no cookie, no bearer token,
  no API key, whatever the app had registered. A tool fronting a session-requiring
  `pikkuFunc` could therefore only ever answer `Authentication required`, and a
  tool fronting a sessionless one was callable by anyone who could reach the mount.

  Almost nothing was missing. Global middleware already ran for MCP wirings, and
  the runner already built a `PikkuSessionService` and the middleware session wire
  props. Only the request was being dropped — twice: `RunMCPEndpointParams` had
  nowhere to put one, and `createFetchHandler` received the caller's `Request` and
  discarded it.

  `RunMCPEndpointParams` gains an optional `http`, which the runner places on the
  wire, and the fetch handler wraps the incoming `Request` in a
  `PikkuFetchHTTPRequest` and threads it through tools, resources and prompts. The
  request is cloned before wrapping, because the MCP transport reads the body and
  both would otherwise compete for one single-use stream; only headers and cookies
  are wanted, since a tool's input arrives in the JSON-RPC params.

  Transports with no request to offer — stdio, and the long-lived stdio/SSE server
  paths — pass nothing and stay anonymous. That is a property of those transports
  rather than a default chosen here, and it is now visible in the type.

  The generated auth middleware moves from `addHTTPMiddleware('*')` to
  `addGlobalMiddleware`. Carrying the request is necessary but not sufficient:
  session middleware registered as HTTP middleware runs for HTTP wirings only, so
  an MCP call still met no middleware and still had no session. Both entries —
  the Better Auth session and the console bearer token — resolve a session from
  whatever request the call arrived on, which is not an HTTP routing concern.
  Wirings with no request are unaffected, since each middleware returns
  immediately without one.

  That move also retires a hazard the old shape carried: the two entries had to
  share a single `addHTTPMiddleware('*')` call because the inspector keys
  route-middleware groups by pattern, so a second `'*'` registration from another
  file would silently displace the first. Global middleware is an append-only
  list.

  **Regenerate the auth scaffold after upgrading** — an app still carrying the
  `addHTTPMiddleware('*')` form keeps anonymous MCP calls.

  Two consequences worth planning for:
  - **A tool fronting a session-requiring function starts working.** It previously
    could not run at all.
  - **A tool fronting a sessionless function is unchanged and still anonymous.**
    Scopes and permissions now apply to MCP calls exactly as they do elsewhere, so
    audit any tool that mutates state and give it the scope its HTTP sibling has.

  `PikkuHTTP` is now exported from `@pikku/core/http`; it is part of this contract
  and was previously only reachable as a type on other exported shapes.

- 3ad2131: Name models by what they are for, and switch them all in one place

  A `models` table in pikku.config.json maps an alias to a provider-qualified
  model, so a declaration can say `model: 'cheap'` and the project repoints every
  use of that tier at once instead of editing each agent. A model containing `/`
  is still concrete and used exactly as written, which is how an agent that needs
  one specific model pins it — aliases are opt-in.

  The table is baked into codegen rather than read at runtime, so it applies to
  deployed units and not just local runs, and `pikku dev`/`pikku serve` take
  `--model cheap:openai/gpt-5-nano` to repoint a tier for one run without editing
  the config.

  Because the inspector already holds every agent's model literal, a bare name
  with no matching alias now fails the build (PKU146) naming the aliases that do
  exist, rather than reaching a provider as an unknown model.

  Aliases resolve for every modality, not just agents: image, speech,
  transcription, embedding and reranking all reach a provider through the same
  point in the Vercel runner.

- c247733: Declare `pgliteExtensions` in pikku.config.json's `db` block rather than in
  `createConfig`. It only ever configured the CLI's embedded PGlite databases, and
  reading it from the runtime config meant a project pointed at a server through
  `DATABASE_URL` lost its declaration — the shadow database the CLI migrates is
  PGlite either way, so the extensions went missing exactly where they were needed.
  `pikku db export` now picks them up too.

  ```json
  {
    "db": {
      "pgliteExtensions": ["@electric-sql/pglite-pgvector", "hstore"]
    }
  }
  ```

- b930dca: Remove the `secretBroker` escape hatch and scope addon secrets and credentials

  `secretBroker` let three named console functions receive the real `SecretService`,
  against the rule that a function never sees one. It is gone: the inspector allowlist,
  the `FunctionRuntimeMeta` flag, the runner branches, and the `WiredSecretBrokerServices`
  type. Console secret administration moved into the console addon, where a
  `SecretAdminService` holds the `SecretService` and the functions hold none.

  Addons are now scoped rather than trusted. The CLI emits each package's declared secret
  keys, and the host wraps the `SecretService` in a `ScopedSecretService` and the
  `CredentialService` in a new `ScopedCredentialService` before the addon's service factory
  runs — so an addon reads only what it declared, cannot write secrets, and cannot enumerate
  the app's users. `wireAddon({ globalSecrets, globalCredentials })` waives this, taking the
  reason as its value; only the consuming app can grant it, and the deploy manifest reports
  every grant under `unscopedSecretAddons` / `unscopedCredentialAddons`.

- 8978fbd: feat(workflow): let an approval gate declare who may answer it

  `workflow.approval()` gains `approvers` (`'any' | 'owner' | 'not-initiator'`)
  and `approverScope`, so a gate can require four-eyes sign-off, restrict itself
  to the run's initiator, or require the decider to hold a named scope.

  Both are enforced when the workflow replays the gate — the same place, and for
  the same reason, the decision payload is validated: the policy is a value on
  the workflow, and a decision can be recorded before the run has ever reached
  the gate. A decision that fails the policy is discarded and the gate stays
  closed. Where the run has already published its policy, the check also runs at
  submission time so the caller gets a 403 rather than silence.

  An answer is now recorded where it can be answered for later. The settled
  decision carries `decidedBy` and `decidedAt` in its `ApprovalOutcome`, so who
  signed reaches `workflowStep.result` and `workflowStepHistory` rather than
  living only in mutable run state. Every answer — accepted, refused at the door,
  or cleared on replay — is also written to the audit sink as
  `workflow.approval.decided`, which outlives the run: `deleteRun` cascades to
  steps and history, and a refused attempt never reaches a step at all. Projects
  with no audit service wired are unaffected.

  **This loosens the default.** `approveStep` previously refused anyone but the
  run's initiator, unconditionally. A gate that declares no `approvers` now
  accepts a decision from anyone the approve entrypoint admits — restore the old
  behaviour per-gate with `approvers: 'owner'`, or gate the approve route with
  `auth`/`permissions`. Ownership still governs _reads_ of a run unchanged.

- Updated dependencies [063f43a]
- Updated dependencies [8ad051c]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [0ab1a88]
- Updated dependencies [5599a27]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82
  - @pikku/better-auth@0.12.23
  - @pikku/knowledge@0.12.5
  - @pikku/skills@0.12.8
  - @pikku/inspector@0.12.58
  - @pikku/ai-vercel@0.12.10
  - @pikku/bun-server@0.12.6
  - @pikku/deploy-cloudflare@0.12.10
  - @pikku/fetch@0.12.9
  - @pikku/kysely@0.13.15
  - @pikku/kysely-node-sqlite@0.12.5
  - @pikku/n8n-import@0.0.5
  - @pikku/openapi-parser@0.12.18
  - @pikku/playwright@0.12.74

## 0.12.101

### Patch Changes

- 8427cdb: `rpc.agent.run` and `rpc.agent.stream` rejected every optional field of
  `AIAgentInput`. The generated RPC map declared its own local copy of the
  interface carrying only `message`, `threadId` and `resourceId`, so `model`,
  `temperature`, `attachments` and `context` — all of which the runner reads and
  acts on — were type errors at the call site with no way to pass them from typed
  code. The map now imports `AIAgentInput` from `@pikku/core/ai-agent` instead of
  restating it, which also stops the two definitions drifting again the next time
  the input grows a field.
- e110c55: Wire `pikkuAIScorer` / `pikkuAIJudge` through the inspector and codegen, and let an agent name the scorers that grade it.

  The inspector reads a scorer's lane off which constructor was called rather than
  off a field, so the two lanes cannot disagree with the code that produced them,
  and refuses a scorer with no name or description — the meta is the only thing
  that names it at runtime. An agent naming a scorer that was never declared is a
  build error (`PKU155`) rather than an agent that quietly grades nothing forever.

  Codegen emits a `ScorerName` union, so `scorers` on an agent is checked against
  the scorers the project actually declares, plus the scorer wirings and meta.
  `pikku validate` now also flags a scorer declared outside a `*.scorer.ts` file,
  for the same reason scenarios have to live in files named for them: a rubric
  buried in an agent definition is one nobody reviews as a rubric.

- e110c55: Emit `pikkuAIScorer` and `pikkuAIJudge` from the generated agent types so a
  project can declare scorers, and read a run's grades from the console.

  A tool that threw now reports its reason only on the step record's `error`; the
  result replayed to the model stays the generic `Error: Tool execution failed` it
  was before scorers needed the reason.

- e110c55: Add `scenario.expectScore` — grade a finished agent run with a declared scorer and assert on it.

  An agent's answer cannot be matched against a fixed string, so a scenario grades
  it instead. `expectScore(step, runId, scorer, { atLeast, atMost, reference })`
  runs one declared scorer against the run the scenario just triggered and fails
  with the reason the judge gave. The default bound is `atLeast: 0.5`, so an
  unqualified assertion still fails a run graded zero.

  Grading goes over the new `pikkuScenarioGradeRun` instrumentation RPC, which the
  dev server registers alongside the coverage and stub RPCs — so it exists only in
  processes that should have it, and never in a deployed bundle. It grades from
  the snapshot the runtime already took when the run finished, which is what makes
  a scenario's grade the same measurement production's sampler makes rather than
  an approximation of it: a run's prompt, answer and tool calls are spread across
  a thread's messages, where the boundary of one run is not recoverable.

  Two things differ deliberately from live scoring. The sample rate is ignored — a
  scorer grading 1% of traffic still grades every scenario run — and the grade is
  returned rather than recorded, so a test's score never lands among the
  production figures. `reference` supplies the answer key a `requiresReference`
  judge grades against, which is the only way such a judge is reachable at all.

- e110c55: Add runtime scoring for AI agents: `pikkuAIScorer` for heuristic grades and
  `pikkuAIJudge` for LLM-judged ones, graded off the request path on two queue
  lanes so a slow judge cannot starve the cheap checks. Grades are sampled
  deterministically per `(run, scorer)` and persisted to `ai_run_score`.
- 2f15aad: `pikku workspace validate` is now `pikku validate`, and it checks addon packaging

  The command no longer needs to be told what kind of project it is looking at.
  Each check declares the condition under which it means anything and runs
  wherever that condition holds, so a repo that is an app, a pile of publishable
  addons, or both gets exactly the checks that apply — and a run that found
  nothing to check says so instead of printing a tick.

  The new checks are for addons, and both state the same property at a different
  level: every relative import in a shipped generated file, and every `exports` or
  `imports` target, must resolve to a file the package actually publishes.

  That property was false in every published `@pikku/addon-*`. They shipped
  `dist/.pikku` without the `types/application-types.d.ts` those files import —
  14 typecheck errors inside `node_modules` for any app depending on one — and
  they published a second, dead copy of `.pikku` at the root whose imports reached
  for a `src/` and `types/` the tarball did not contain, behind the very subpath
  consumers import their bootstrap through.

  Addons now point every entry point at the built copy under `dist`; the addon's
  own build resolves `#pikku` through tsconfig `paths`, so nothing has to reach
  into the source tree. `pikku new-addon` scaffolds that shape, and the addon
  skill teaches it.

- c524adf: fix(cli,core): make scenario captures reachable, filed per scenario, and findable

  `--screenshots` and `--video` were read by `scenario run` but never declared as
  options, so both flags were rejected as unknown and silently ignored — capture
  could not be switched on from the command line at all.

  A provider's `beginScenario` was never called, so every capture in a run was
  filed under one shared label instead of the scenario that produced it. It is now
  part of `ScenarioBrowserProvider` and called after the per-scenario reset, once
  the previous scenario's context is closed and its video finalised.

  The run also never said where it wrote anything. It now reports `Captures → …`
  after the browser closes, which is the point at which a video exists.

- c524adf: Capture screenshots and video from a scenario run.

  `pikku scenario run` gains `--screenshots` and `--video`, so a run can produce
  something a person looks at rather than only a pass or a fail.

  Screenshots are taken explicitly — `browser.screenshot('description')` — rather
  than automatically after every step. Only the scenario author knows which
  moments are worth a picture, and "after each step" captures the moment a step
  finished instead of the moment that mattered. The description becomes the
  filename, and every capture is stamped with the run and scenario that produced
  it under `.pikku/scenario-runs/<runId>/<scenario>/`. With the flag off, the same
  call returns the bytes and writes nothing, so a scenario that takes pictures
  still runs.

  Video records per browser context, which yields one video per scenario because
  contexts are already closed between them. ffmpeg re-encodes the result when it
  is on PATH — this footage is a near-static page, so it compresses hard — and the
  run warns and keeps the raw recordings when it is not.

  `ActorSession.screenshot()` previously passed its argument to Playwright as a
  file path, so a name without an extension failed with
  `unsupported mime type "null"`. It now takes a description and the SDK owns the
  filename; callers that own the path use `writeScreenshot(file)`.

- e110c55: Register the scenario instrumentation RPCs on `pikku serve` as well as `pikku dev`, so a scenario run can grade and collect coverage against either local server instead of failing with "RPC function not found: pikkuScenarioGradeRun".
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [c524adf]
- Updated dependencies [acc8077]
- Updated dependencies [905f737]
- Updated dependencies [3cc6428]
- Updated dependencies [2f15aad]
- Updated dependencies [c524adf]
- Updated dependencies [c524adf]
- Updated dependencies [e110c55]
  - @pikku/core@0.12.81
  - @pikku/ai-vercel@0.12.9
  - @pikku/inspector@0.12.57
  - @pikku/skills@0.12.7
  - @pikku/kysely@0.13.14
  - @pikku/playwright@0.12.73

## 0.12.100

### Patch Changes

- dad539c: **The generated CLI channel defaults to session-required.** It was emitted with
  `auth: ${auth === true}`, so it was public unless the program explicitly opted
  in — inverting `wireChannel`'s own `auth !== false` default. A CLI program that
  declared no auth got an unauthenticated channel exposing every command. It now
  emits `auth: ${auth !== false}` and the connect-time session guard under the
  same condition, so a channel is public only when the program explicitly sets
  `auth: false`. CWE-306.
- ba422cd: Pin `@pikku/node-http-server` in the CLI bootstrap

  The bootstrap installs published `@pikku/*` packages into a temp directory to run
  codegen, and pinned only `@pikku/core`. `@pikku/node-http-server` arrived
  transitively through the CLI's `^0.12.7`, so it floated to the newest release
  while the pin held core still. When a release wave published node-http-server
  0.12.8 — which imports `@pikku/core/node-host-resolver` — one second before core
  0.12.79, the first core to export that subpath, every bootstrap died on a missing
  export in a package the pin never named.

- 6512384: feat: give scenarios a `scenario.context` their `before`/`after` hooks can read

  A hook only ever received the run's _input_, so teardown could not reach an id
  the scenario body minted — which is exactly what a failing run needs to clean
  up. `wire.scenario.context` is a per-run scratch object shared by `before`, the
  body and `after`. It is typed as a `Partial` of the scenario's output, because a
  run that failed early has none of it.

  ```ts
  pikkuScenario<void, { projectId: string }>({
    func: async (_services, _data, { scenario }) => {
      const { projectId } = await scenario.when('creates a project', 'createsProject', …)
      scenario.context.projectId = projectId
      …
    },
    after: pikkuScenarioHook<void, { projectId: string }>(
      async (_services, _data, { scenario, actors }) => {
        if (scenario.context.projectId) {
          await actors.admin.invoke('deleteProject', { projectId: scenario.context.projectId })
        }
      }
    ),
  })
  ```

  Deliberately not a world: it is scoped to a single run, and scenario _steps_
  cannot reach it — state still flows between steps as return values.

  Feature-level `before`/`after` get the same member, scoped to their feature, so
  group setup can hand group teardown what it created. It is a separate object
  from the scenarios' contexts: one bag shared across a group is the invisible
  coupling a Cucumber world had.

- 6dada45: fix(workflow,ai-agent): make a run's owner, entry node and step function authoritative

  A graph run may only start at a node the graph declared in `meta.entryNodeIds`, and
  the generated `POST /workflow/:workflowName/graph/:nodeId` route that let an HTTP
  caller pick the entry node is gone. `startNode` stays for `PikkuTriggerService`,
  which names a declared entry node anyway.

  `StepState` now records the `rpcName` the workflow dispatched a step with, and the
  step claim rejects a queue message naming a different function with
  `WorkflowStepFunctionMismatchError` before mutating any status — a step runs under
  the run owner's identity and without the `expose` gate, so the message must not
  choose what runs.

  `approveStep` takes the caller's session, and the generated status routes and
  streams assert the same `assertWorkflowRunOwner` check: a run started through a
  session may only be read and approved by that session's user. A run with no
  recorded owner (trigger, scheduler, unauthenticated route) has nobody to compare
  against and is still gated by the entrypoint's own `auth`/`permissions`.

  `AIRunStateService.resolveApproval` is now a compare-and-swap returning whether
  _this_ caller made the claim, and both agent resume paths run a tool only for the
  approvals they claimed — concurrent approvals of one tool call no longer all
  execute it.

- Updated dependencies [41c1a95]
- Updated dependencies [ce96383]
- Updated dependencies [7e60867]
- Updated dependencies [f8f1244]
- Updated dependencies [a879ab3]
- Updated dependencies [dcf20cb]
- Updated dependencies [6512384]
- Updated dependencies [e3b4c14]
- Updated dependencies [dbff6ae]
- Updated dependencies [efd0ed1]
- Updated dependencies [cba98fb]
- Updated dependencies [ce96383]
- Updated dependencies [f8f1244]
- Updated dependencies [f8f1244]
- Updated dependencies [6e93a35]
- Updated dependencies [6dada45]
  - @pikku/core@0.12.80
  - @pikku/inspector@0.12.56
  - @pikku/schedule@0.12.5
  - @pikku/better-auth@0.12.22
  - @pikku/node-http-server@0.12.9
  - @pikku/kysely@0.13.13

## 0.12.99

### Patch Changes

- d468b16: Give the console bearer token the scopes the console gates itself on.

  `scaffold.console` emits two things that contradicted each other. The console
  wiring gates the whole addon — `wireAddon({ name: 'console', package:
'@pikku/addon-console', scopes: ['admin'] })` — while the auth scaffold minted
  the bearer session as `userSession: { userId: 'pikku-console-token' }`, holding
  no scopes at all. `verifyScopes` fails closed, so a console authenticating with
  `PIKKU_CONSOLE_TOKEN` was admitted and then refused on every `console:*` RPC,
  reads included, with `MissingScopeError: Missing required scope: admin`.

  An external console could therefore reach a deployment while being unable to do
  a single thing in it, and `console:installAddon` — which carries its own
  `scopes: ['admin']` — could never run. The failure reads as a broken console
  rather than a missing grant, because nothing in the surface names the scope.

  The token session now carries `scopes: ['admin', 'pikku']`: the two roots the
  console addon's own functions sit under. Roots rather than a wildcard, since a
  parent grant already satisfies its children (`admin` covers `admin:*`, `pikku`
  covers `pikku:scopes:*` and `pikku:audit:*`) while `*` would additionally hand
  the token every scope the host application declares.

- 3df4f95: Scaffold virtual user runs as RPCs, backed by a run store.

  `pikku persona run` could already turn a declared persona loose on a running
  stage, but only from a terminal, and the result only existed in that terminal's
  output. There was no way for CI, a console, or a scheduled job to start a run —
  and nothing kept what a run found, so this week's findings could not be compared
  against last week's.

  `scaffold.virtualUser` now generates two RPCs and the function behind them:
  - `runVirtualUser({ persona, goals?, memory?, disposition?, budget?, seed? })
-> { runId }`
  - `getVirtualUserRun({ runId }) -> { status, findings, tally, memory, … }`

  They are gated on separate scopes — `virtualUser:run` and `virtualUser:read` —
  because an adversarial run's findings are working exploits carrying live ids,
  which makes reading them the more sensitive of the two. Production refuses every
  disposition but `accountable`, checked against the effective one so the
  per-run override cannot smuggle another in.

  **A run is not a workflow and not a queued job.** It explores, so no two
  attempts take the same steps and there is nothing to replay; and the record
  already carries the progress a queue would only be holding on the way to the
  same place. `runVirtualUser` writes the record, dispatches without awaiting, and
  returns the id. The cost is stated on the type: a restart mid-run strands a
  record at `running`, so a run older than its budget window and still `running`
  is dead rather than working.

  `@pikku/core` gains `VirtualUserRunStore` (with `virtualUserRunStore` on
  `CoreSingletonServices`), and `@pikku/kysely` ships
  `KyselyVirtualUserRunStore`, which creates its own table on first use like the
  audit sink — the runtime never needs it, so it arrives with the feature that
  fills it rather than in every database.

  Also in core: `prepareVirtualUserRun`, which derives the catalogue, intents,
  scopes and reachable agents in one place. `pikku persona run` reads the
  inspector state and the generated RPC reads `metaService`, and the two have to
  agree — otherwise the same persona and seed explore a different API depending on
  how the run was started. `personaScopes` moved here from the CLI for the same
  reason and is still re-exported from its old home. `PRODUCTION_DISPOSITION` is
  now exported from `@pikku/core/virtual-user`, which it should always have been.

- Updated dependencies [3df4f95]
  - @pikku/core@0.12.77
  - @pikku/kysely@0.13.10

## 0.12.98

### Patch Changes

- a9fe3df: Stop `pikku all` holding on to every inspection.

  The workflow steps that re-inspect the project returned their `InspectorState`,
  and a step's return value is kept as the step result for the life of the run.
  Each state holds a whole `ts.Program`, so a run that inspects four or five times
  — what a cold run does, when `.pikku/` and the schema cache are both empty —
  pinned that many TypeScript programs in memory at once instead of letting each
  one be collected as the next replaced it. Heap use climbed monotonically across
  the run rather than plateauing.

  Those steps now discard the state; anything needing it calls
  `getInspectorState()` directly, which is where the caching already lives, so
  behaviour and generated output are unchanged.

  On a ~86k-LOC project this takes a cold `pikku all` from 2314MB to 1671MB peak
  RSS, which is the difference between dying in a 2GB CI heap and finishing in it.

- 9dddff8: Split a column's at-rest form out of its classification.

  `security: 'encrypted'` sat beside `'secret'` as though the two were
  alternatives, which made the field unanswerable: a token hash and a live bearer
  token are both secret, one must never be encrypted — the digest _is_ the lookup
  key — and the other must always be. A column now carries a second, independent
  `form: 'plain' | 'hashed' | 'wrapped' | 'sealed'` saying how the bytes are held.

  Declaring a form other than `plain` makes the column's INSERT/UPDATE type
  nominal — `WrappedValue`, `SealedValue`, `HashedValue` — so a plain string no
  longer compiles there and the only way to write the column is with something an
  encrypt, seal or hash call produced. `envelopeEncrypt`, `envelopeRewrap` and
  `wrapDEK` now return the brand, and a new `hashToken` produces `HashedValue`, so
  the round trip needs no casts; `column-form.ts` exports deliberately-named
  `unsafeAs*` assertions for backfills, fixtures and values sealed elsewhere.
  Reads are unaffected — the brands widen to `string` and compose with the
  classification brand as `Secret<WrappedValue>`.

  `wrapped` and `sealed` stay distinct because a sealed value is one the
  application cannot read back; storing one where the other belongs is a row
  nobody can open.

  A `secret` column that has not declared a form now warns (PKU483), and a form on
  a non-text column warns and is dropped (PKU484). Both are warnings, so existing
  projects keep migrating — `pikku db --fail-on-warn` opts into the ratchet, and
  an explicit `form: 'plain'` is the acknowledgement that silences it. The legacy
  `security: 'encrypted'` keeps working and now expands to the pair it always
  meant, `secret` + `wrapped`.

- 2ff07e0: Remove `pikku db seed`. Seeding is now a step of `pikku db reset`, which grew `--no-seed`.

  `seed` read like something you might point at any environment. It never was. It exists
  for one job: put enough test data into a **dev** database that the app isn't empty on
  first run. Production and staging are provisioned, not seeded — accounts and their role
  grants come from `pikku persona sync` or a migration, and always have.

  A standalone seed command is also what made seed files unpleasant to write. Because it
  could be run against a database in any state, every seed had to defend itself with
  `INSERT OR IGNORE`, `ON CONFLICT DO NOTHING`, `IF NOT EXISTS`. Folding it into reset
  removes that: `pikku db reset` wipes, migrates, then seeds, so the seed only ever meets
  an empty database and **plain `INSERT`s are correct**. The guarantee is structural now
  rather than a documented convention.

  ```bash
  pikku db reset             # wipe + migrate + test data
  pikku db reset --no-seed   # wipe + migrate, empty — for empty-state and onboarding work
  ```

  Seeding also inherits reset's guards for free: it refuses `NODE_ENV=production`, and
  refuses a database resolved outside the runtime directory.

  The seed file keeps a name that says what it is:
  - `db/postgres-seed.sql` → `db/postgres-dev-seed.sql`
  - `db/sqlite-seed.sql` → `db/sqlite-dev-seed.sql`

  **Migrating:** rename the file, and drop the idempotency guards from it if you like.
  `pikku db seed` no longer exists — use `pikku db reset`. A project that keeps the old
  filename gets no error: reset reports the database is empty, which is the one failure
  mode worth knowing about up front. The Fabric validator's `seed-sql-missing` finding is
  now `dev-seed-sql-missing` and looks for the new name.

- 9dddff8: Read schema-qualified annotations, and let a project name its default schema.

  `DbClassificationMap` nests tables under their schema whenever a project sets
  `db.schema`, but `loadAnnotations` read the sidecar as a flat table→column map.
  It therefore took the schema for a table and each table for a column, found no
  recognised fields, and dropped every annotation on the floor — so a project
  could mark a column `secret` and watch it generate as `private`, with no error
  anywhere. The parser now detects the extra level (a column entry's values are
  primitives; a table's are objects) and flattens it, so both shapes load.

  New `db.defaultSchema` drops one schema's qualifier from the generated types:
  with `defaultSchema: 'app'`, `app.user` is queried as `selectFrom('user')` and
  typed as `User` rather than `AppUser`, matching what a project whose
  `search_path` already resolves the schema actually writes. Tables in other
  schemas stay qualified. Where dropping the qualifier would make two tables
  share a name, the table keeps its qualifier and the codegen warns (PKU485)
  rather than letting one silently shadow the other — queries against the loser
  would have typechecked against the wrong columns.

  The generated key is what Kysely puts in the SQL, so this is opt-in and
  separate from `db.schema`: setting it for a schema the connection does not
  resolve gives you queries that compile and then fail to find their table.

- 1e74b01: Remove `pikku db seed`. Seeding is now a step of `pikku db reset`, which grew `--no-seed`.

  `seed` read like something you might point at any environment. It never was. It exists
  for one job: put enough test data into a **dev** database that the app isn't empty on
  first run. Production and staging are provisioned, not seeded — accounts and their role
  grants come from `pikku persona sync` or a migration, and always have.

  A standalone seed command is also what made seed files unpleasant to write. Because it
  could be run against a database in any state, every seed had to defend itself with
  `INSERT OR IGNORE`, `ON CONFLICT DO NOTHING`, `IF NOT EXISTS`. Folding it into reset
  removes that: `pikku db reset` wipes, migrates, then seeds, so the seed only ever meets
  an empty database and **plain `INSERT`s are correct**. The guarantee is structural now
  rather than a documented convention.

  ```bash
  pikku db reset             # wipe + migrate + test data
  pikku db reset --no-seed   # wipe + migrate, empty — for empty-state and onboarding work
  ```

  Seeding also inherits reset's guards for free: it refuses `NODE_ENV=production`, and
  refuses a database resolved outside the runtime directory.

  The seed file keeps a name that says what it is:
  - `db/postgres-seed.sql` → `db/postgres-dev-seed.sql`
  - `db/sqlite-seed.sql` → `db/sqlite-dev-seed.sql`

  **Migrating:** rename the file, and drop the idempotency guards from it if you like.
  `pikku db seed` no longer exists — use `pikku db reset`. A project that keeps the old
  filename gets no error: reset reports the database is empty, which is the one failure
  mode worth knowing about up front. The Fabric validator's `seed-sql-missing` finding is
  now `dev-seed-sql-missing` and looks for the new name.

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

- 2f72189: Point the `versions check` hints at a command that exists.

  Three different failures told you to run `npx pikku versions-update`. There is
  no such command — `update` is a subcommand of `versions` — so anyone following
  the hint hit "unknown command" at the moment they were trying to repair a
  contract manifest. It now prints `npx pikku versions update`.

  The pikku-versioning skill carried a paragraph warning agents the hint was
  wrong; with the hint fixed, that warning is gone.

- 7b0da5e: Point `versions check` at a command that exists.

  Three of its diagnostics told you to run `npx pikku versions-update`. There is
  no such command — `update` is a subcommand of `versions`, so following the hint
  gets an unknown-command error at the exact moment you have a failing check to
  clear. They now print `npx pikku versions update`.

  The pikku-versioning skill carried a paragraph warning agents off the bad hint.
  With the hint corrected the warning is the only thing left naming a command that
  does not exist, so it goes too.

- Updated dependencies [62ea4cc]
- Updated dependencies [9dddff8]
- Updated dependencies [2ff07e0]
- Updated dependencies [9dddff8]
- Updated dependencies [155528a]
- Updated dependencies [1065b80]
- Updated dependencies [1e74b01]
- Updated dependencies [78b29f0]
- Updated dependencies [95f6144]
- Updated dependencies [facd61f]
- Updated dependencies [2f72189]
- Updated dependencies [7b0da5e]
  - @pikku/core@0.12.76
  - @pikku/inspector@0.12.54
  - @pikku/kysely@0.13.9
  - @pikku/skills@0.12.6
  - @pikku/knowledge@0.12.4
  - @pikku/better-auth@0.12.21

## 0.12.97

### Patch Changes

- fb1d853: Stop `getFileImportRelativePath` doing path arithmetic on bare package specifiers. The bootstrap zero state records core's types as `typePath: '@pikku/core'` — already an import specifier, where every other producer of that field supplies a file on disk — so relativising it produced `../../@pikku/core`: a directory that does not exist, extensionless, which `nodenext` then refuses to resolve (TS2834). The existing node_modules branch could not catch these, having no `node_modules/` in the string to key off. A `to` that starts with neither `.`, `/` nor a drive letter is now returned unchanged.
- a1ab24f: fix(cli): pick the CLI channel client's WebSocket by runtime, and fix the direct-execution check

  The generated CLI-over-channel client always reached for the `ws` module when it had credentials to send, because Node's global `WebSocket` reads its second argument as subprotocols and silently drops custom headers. Bun's honours them, so it now uses the native `WebSocket` there and never loads Bun's `ws` compatibility shim. The runtime is detected once, the same way the CLI picks its dev-server runner.

  Both generated CLI entrypoints also guarded direct execution by comparing `import.meta.url` against a hand-built `file://` path from `process.argv[1]`. That is false for any CLI invoked through a symlinked `node_modules/.bin/<name>` — Node reports the symlink in argv and the realpath in the URL — so the block never ran. It also failed on paths needing percent-encoding, such as one containing a space. Both now use `import.meta.main`, falling back to a realpath comparison on Node before 24.2.

- ea8aabf: Serve `LocalContent` uploads and signed reads under Bun.

  `LocalContent` hands the browser a `PUT <uploadUrlPrefix>/<key>` upload URL and a signed
  `GET <assetUrlPrefix>/<key>` read URL, but it is a `ContentService` and cannot answer
  either — something in the serving path has to. Only `@pikku/node-http-server` did. The
  same project served under Bun handed out upload URLs that 404ed, with nothing naming the
  cause: the config was accepted, the service was constructed, and the URLs looked right.

  `@pikku/core` now exports `createLocalContentRequestHandler` from
  `@pikku/core/services/local-content-request-handler` — the server half of `LocalContent`,
  expressed in Web `Request`/`Response` so every runtime shares one implementation of the
  signature check rather than each re-deriving it. It returns `null` for anything that is
  not a content request, which is the caller's signal to carry on with its normal routing.

  `PikkuBunServer` accepts `config.content` and a `contentSigningJWT` option, mirroring
  `PikkuNodeHTTPServer`, and answers both prefixes ahead of static mounts and routing.
  `BunServerRunner` was dropping `contentSigningJWT` on the floor, which silently disabled
  signed asset reads for every Bun project even once the prefixes were served — the config
  arrived, the service that verifies its signatures did not.

  Signed reads are refused unless every claim matches, the path included: without that, a
  signature minted for one asset would read any other.

- 33e96ab: Make a CLI served over a channel typecheck in a real project.

  Both of these are unreachable for a hand-written `wireChannel`, whose routes are usually
  bare identifiers, and unavoidable for a CLI one, whose routes are command ids.

  `ChannelsMap` emitted route and message keys unquoted. A command id is a kebab or dotted
  name far more often than not — `app-smoke`, `registry.search`, `package.upgrade-pikku` —
  and each one ends the property early, so the generated map is not parseable TypeScript at
  all. One project's map came out with 107 syntax errors from a single CLI channel. Keys are
  now quoted when they are not bare identifiers, and left alone when they are, so existing
  generated output is unchanged.

  `executeRawCLIViaChannel` typed its renderers `Record<string, CorePikkuCLIRender<any>>`,
  whose services parameter defaults to `CoreServices`. The renderers a generated client
  passes are the app's own, typed against its `SingletonServices`, and a function taking
  those is not assignable to one taking `CoreServices` — so the generated client failed to
  compile for any app that adds a service, which is every app.

  Rather than widen the type, it now says what is actually true on that side of the socket:
  a renderer running on the client gets a logger and nothing else, because there is no
  service container there to resolve anything from. `CorePikkuCLIClientRender` and
  `ClientCLIRenderServices` are new exports of `@pikku/core/cli/channel`. They are not
  expressible as `CorePikkuCLIRender`, whose `Services` parameter is constrained to
  `CoreSingletonServices` and so demands a `config`, `variables` and `secrets` the client
  cannot invent. The one cast from the app's renderer type to that shape is localised to the
  generated client, where it is sound: generation refuses to emit the file at all if a
  renderer reaches for a service other than `logger`.

- e40b8f1: `db generate` and `db check` now agree with PostgreSQL about which schema a runtime table lives in, when `db.schema` names one.

  Coverage matching let a copy of a runtime table in another schema satisfy a source whose tables belong in the configured one, so `db generate` could call the source up to date having created nothing there. The generated `ALTER TABLE` delta inserted the schema raw, and PostgreSQL folds an unquoted identifier, so a mixed-case `db.schema` altered a table the runtime never reads. `db check` reported the configured schema's tables as living in `public`.

- fd72e58: Drop `scenario.step` — a scenario step is now always a `given`, `when` or
  `then`.

  `step` rendered no keyword, which made it the phase to reach for whenever a
  step did not obviously fit one of the three. That is exactly the step a reader
  cannot check: a scenario is read by people deciding whether it describes the
  behaviour they wanted, and a row that says what it does without saying whether
  it is setup, action or claim tells them nothing to agree or disagree with. It
  was also the escape hatch from the assertion lint — a scenario with no `then`
  could be made to stop complaining by demoting its steps rather than by
  asserting anything.

  Replace `scenario.step(...)` with whichever of `given`, `when` or `then` the
  step actually is. `then` is not a rename: it makes the step's bindings
  witnesses rather than alternatives, so every declared surface runs and they
  must agree.

- 6280ce4: `pikku fabric validate` now checks that a frontend with a login screen also ships the
  one-click actor sign-in.

  The dev-only "Sign in as …" switcher is what lets anyone open a sandbox and view the app
  as each scenario persona without knowing a password. When a generated app shipped a login
  form and nothing else, the reviewer was locked out of their own project — and nothing
  caught it until someone tried to log in by hand.

  The check fires only when the app actually has a login surface, so an app with no auth is
  left alone. It looks for the canonical fingerprints — a rendered `<DevActorSwitcher />`, a
  call to `signInAsActor()`, or a request to `/auth/sign-in/actor` — and reports
  `app-missing-actor-quick-login-<app>` as an error when a login screen exists without any
  of them. Defining the switcher without rendering it does not count.

  Next.js apps keep their routes outside `src/`, so `app/` and `pages/` are scanned too.

- cabd9dc: Add a `db.schema` CLI config option, so `pikku db generate` can write the runtime tables into a named postgres schema.

  Without it the generator emits unqualified `create table` against the default `search_path` of `"$user", public`. A project that keeps everything in one namespace — `app`, say — gets a second copy of every runtime table in `public` alongside the ones it already has, which is how stray `public.ai_*` tables appear next to the real `app.ai_*` ones.

  `compilePikkuSchemas` takes the schema and binds only the rendered SQL, never the caller's connection: that connection is the throwaway database the declaration was just applied to, and qualifying it would create tables in a schema the scratch database has never heard of.

  Raw SQL is not rewritten by `withSchema`, so `rawStatement` now also accepts a builder taking a `SchemaContext` — the expression index on `credentials` uses it to qualify its own table. Statements otherwise pick the context up from whatever connection they are handed, so a schema-bound connection needs nothing said twice.

  Two fixes fall out of it:
  - The `ALTER TABLE` delta for a partially covered source is written from bare introspected names, so it is qualified explicitly. Unqualified it altered a table in whichever schema `search_path` found.
  - A source was only counted as partially covered on an exact name match, so a project whose migrations already create `app.workflow_step` read as "nothing covered" and had its whole schema re-emitted over tables that were already there. It now matches the schema qualifier the same way the drift diff does.

  `db.schema` is postgres only, and is rejected with an explanation on sqlite, whose `REFERENCES` clause takes a bare table name.

- 4e180ed: validate: warn when a project declares no personas, wires no actor sign-in, or configures no environments

  The checks live in one shared module and run from both `pikku workspace validate` and `pikku fabric validate`, so a project sees them whichever command it uses. Workspace validate now also runs the knowledge-base checks fabric validate already ran. Everything reported here is a warning — a project with no personas is under-tested, not broken.

- 8fe342b: validate: `pikku fabric validate` is now `pikku workspace validate` plus the deploy checks

  The two validators were separate implementations that walked the same project and emitted sixteen identical findings. The shared half moved into one module both call, which also fixes four things the duplication was hiding:
  - fabric validate now checks zod v4 and `packages/functions/package.json`, and reports a corrupt `pikku.config.json` as corrupt rather than missing
  - workspace validate now checks all five scaffold flags, not just `console`
  - the auth checks were gated on `betterAuthSession` and never fired for apps wiring the stateless variant; they now match either
  - they read migrations from `<root>/db/<engine>/`, where `pikku db migrate` reads them, and look for better-auth's own tables (`user`, `session`, `account`, `verification`) instead of `app_user`/`auth_verification_token`, which no scaffold ever generated

  Two finding ids changed as a result: `pikku-config-no-console-scaffold` → `pikku-config-no-scaffold-console`, and `auth-schema-missing-app-user`/`auth-schema-missing-verification-token` → a single `auth-schema-missing-tables`.

  New warning: a project that depends on `@pikku/playwright` but pins `compilerOptions.types` without listing it, since the package types a step's browser bindings by declaration merging and an explicit `types` array never loads it.

  New errors: `pikkuScenario`, `pikkuFeature` and `pikkuScenarioStep` must live in a `*.scenario.ts`, `*.scenarios.ts` or `*.steps.ts` file, and `definePersonas`/`runVirtualUser` in a `*.virtual-user.ts` or `*.vu.ts` file, rather than mixed into application code.

- 4a3bb6d: Declare `SCENARIO_ACTOR_SECRET` from the personas scaffold instead of leaving every project to hand-write it. Nothing in app code reads the actor sign-in secret — the scenario service, `pikku scenario`, `pikku persona`, `pikku persona sync` and the Playwright provider do — so a project that declares personas now gets a generated `pikku-personas-secrets.gen.ts` beside its personas file, and the platform collects the value the way it already collects `BETTER_AUTH_SECRET`. The file is removed again when the last persona goes.

  The post-auth secret/credential/variable re-run is now a post-scaffold re-run, gated on personas as well as auth. Both scaffolds write `defineSecret` calls after `pikkuSecrets` has already read the inspector state, so without it the declaration only appeared on a second `pikku` run — and a cold project would deploy without ever being asked for the value.

- 4f8fd25: Let a project declare the Postgres extensions its embedded PGlite databases need

  The CLI migrates a PGlite shadow database to type and diff a schema, and PGlite
  only has the extensions it was constructed with — pgcrypto, and nothing else.
  A migration doing `CREATE EXTENSION vector` therefore failed every `db` command
  with `extension "vector" is not available`, whatever the real server had, and
  there was no way to say otherwise.

  `createConfig` now takes `pgliteExtensions`. A bare name is one of PGlite's
  bundled contrib extensions and needs no install; anything else is a package the
  project depends on:

  ```ts
  export const createConfig = async () => ({
    postgresUrl: process.env.DATABASE_URL,
    pgliteExtensions: ['@electric-sql/pglite-pgvector', 'hstore'],
  })
  ```

  They are loaded into both embedded databases — the local dev one and the shadow
  — and resolved from the project before the CLI, so the version the project
  installed is the one that runs. Declared for a `postgresUrl` project too: the
  shadow is PGlite whichever server the app itself talks to.

  An extension that is used but not declared now says so, rather than reporting
  Postgres' own message about an unavailable extension with nothing pointing at
  the config that would have loaded it.

- dd19aa7: Drop `scopes` from sessionless functions, rename `selfAuthenticated`, and make both
  escape hatches opt-in.

  **`scopes` are gone from `pikkuSessionlessFunc`.** They are AND-ed and `verifyScopes`
  fails closed on a session that does not exist, so every scope listed on a sessionless
  function rejected the anonymous caller it exists to serve. `CorePikkuSessionlessFunctionConfig`
  now states this once in core, and the generated `pikkuSessionlessFunc` / `pikkuVoidFunc`
  configs derive from it — so the field is absent rather than subtracted.

  `@pikku/addon-console`'s `installAddon` and `installOpenapiAddon` are now `pikkuFunc`.
  Both set `auth: true` and `scopes: ['admin']`, and a test exercises that gate, so the
  scopes were load-bearing — they only compiled as sessionless because the config accepted
  a field it could not honour. No behaviour change: both already required a session.

  **`selfAuthenticated` is now `permissionsInBody`.** It never described authentication:
  what it records is that the permission check lives in the function body rather than in a
  declared `permissions` entry.

  **Both escape hatches must be opted into**, via a new `allow` block in
  `pikku.config.json`:

  ```json
  "allow": { "permissionsInBody": true, "complexWorkflows": true }
  ```

  Unset means unavailable, and using the feature is a build error naming the flag that
  would permit it — PKU576 for `permissionsInBody`, PKU643 for `pikkuWorkflowComplexFunc`.
  Both trade something the tooling can inspect for something only a reader can verify: a
  permission check buried in a body, or workflow steps that cannot be serialized into the
  graph, replayed, or migrated. Both are occasionally right, and both are the path of least
  resistance whenever the declarative form is merely inconvenient. Whoever owns the project
  makes that call once, in writing, instead of every author making it silently at the call
  site.

  **PKU574's message no longer contradicts any of this.** Every function it reports is
  sessionless — that is how the population is selected, not a finding — yet it opened by
  reporting that they "require neither a session", then advised adding scopes. It now names
  them as sessionless and recommends only gates an anonymous caller can meet:
  `permissions`, `auth: true`, `wireAddon({ auth: true })`, or dropping `expose: true`.
  `permissionsInBody` is deliberately absent from that list: a diagnostic should not
  advertise its own escape hatch.

- 75e81b1: `pikku workspace validate` now warns when a project boots its own server instead of using the `pikkuServerLifecycle` hooks.

  It fires only when the root `start`/`dev` script starts a server without `pikku dev` / `pikku serve` **and** no Pikku runtime adapter (`@pikku/express`, `@pikku/fastify`, `@pikku/uws`, `@pikku/lambda`, `@pikku/cloudflare`, `@pikku/next`, …) is installed — depending on an adapter means the hand-rolled entrypoint is deliberate, since `pikku serve` cannot host those runtimes. Scripts that delegate (turbo, nx, `yarn workspace`, npm-run-all, …) are not flagged either.

  Opt out — or escalate to an error — with `"lint": { "customServerBootstrap": "off" }` in `pikku.config.json`.

- Updated dependencies [32277d5]
- Updated dependencies [ea8aabf]
- Updated dependencies [33e96ab]
- Updated dependencies [fd72e58]
- Updated dependencies [d041d5b]
- Updated dependencies [cabd9dc]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [894b2f8]
- Updated dependencies [dd19aa7]
- Updated dependencies [50ec500]
- Updated dependencies [75e81b1]
- Updated dependencies [9d62571]
  - @pikku/core@0.12.75
  - @pikku/bun-server@0.12.5
  - @pikku/inspector@0.12.53
  - @pikku/skills@0.12.5
  - @pikku/kysely@0.13.8
  - @pikku/kysely-node-sqlite@0.12.4

## 0.12.96

### Patch Changes

- 1f750d5: Compile PGlite's WASM modules once per process instead of once per embedded Postgres instance.

  `pikku db migrate` opens several PGlite instances in a single run, each of which
  had PGlite load and compile `pglite.wasm` and `initdb.wasm` for itself. The
  compiled modules are now built once and shared, which takes a 10.5MB compile off
  every run after the first instance. Where the files cannot be resolved — a
  bundled CLI, say — PGlite loads them itself exactly as before.

## 0.12.95

### Patch Changes

- afef587: Close eleven security weaknesses found in a review of `@pikku/core`. Most are
  breaking, and two invalidate data or credentials already in the wild — read the
  migration notes before upgrading.

  **Breaking: AI agent thread ownership now fails closed.** Reading, listing,
  resuming or approving an existing thread or run requires a resolved session
  principal (`userId`, or `orgId` for `sessionScope: 'org'`), regardless of the
  agent's `auth` setting. Previously a request without a session had no ownership
  model at all: the caller-supplied `resourceId` was accepted as the ownership
  key, so any caller could read or resume another party's thread by naming its
  `resourceId`. Worse, `threadOwnerConstraint` returned `undefined` for a
  sessionless caller, and `undefined` means _no filter_ rather than _no rows_ —
  so `getAgentThreads` returned every thread in the deployment. It now returns
  `string[]`, empty for a sessionless caller, which every storage backend already
  treats as matching nothing. Sessionless agents still run one-shot conversations,
  each with a fresh unguessable owner; what they lose is cross-request continuity.
  Wire a session to restore it.

  **Breaking: stored secrets and credentials must be re-entered.** `deriveKey` ran
  a single unsalted round of SHA-256 over the passphrase and used the digest
  directly as the AES-GCM key — roughly one hash per brute-force guess, with one
  rainbow table working against every deployment. It is now PBKDF2-HMAC-SHA256 at
  600,000 iterations over a random salt. There is no compatibility path: every
  value held by the kysely, mongodb and redis secret services and the kysely
  credential service becomes undecryptable. They fail loud, naming the key and
  `key_version`, so the app hard-fails on first secret read until each is re-set.

  The KEK salt is scoped to the key version and stored alongside it, rather than
  per secret, so a bulk read costs one derivation instead of N — `getSecrets` over
  50 secrets went from ~2.3s to ~48ms, and rotation from ~4.6s to ~94ms. This adds
  a salt table (kysely), hash field (redis) or collection (mongodb), created
  automatically on first use.

  **Breaking: `PIKKU_REMOTE_SECRET` must be at least 32 characters.** The
  remote-RPC session envelope moved from PBKDF2 to HKDF, which expands
  high-entropy key material rather than stretching a low-entropy passphrase. That
  took a remote hop from ~269ms to ~0.4ms — PBKDF2 was running twice per request —
  but HKDF supplies no brute-force resistance, so the secret must carry the
  entropy itself. A shorter secret now throws `WeakKeyMaterialError` at both ends.
  Generate one with `openssl rand -base64 32` and roll it out to every service in
  the mesh together: existing bearer tokens are format-incompatible, so a partial
  rollout produces 401s until every instance is updated. The Cloudflare, Lambda
  and Azure deployment services each hand-rolled a copy of `buildRemoteHeaders`
  and now call the shared one, which is what keeps the two sides in step.

  **Breaking: previously signed content URLs stop verifying.** `LocalContent`
  signed only `{signedAt, expiresAt, notBefore}`, so a signature proved when a URL
  was issued but never what it was issued for — any valid token was a skeleton
  key, and swapping the pathname from a public thumbnail to a private document
  still verified. The signature now binds the request path. Separately, the
  verifier returned "valid" when no JWT service was wired, which is how
  `pikku serve` ran: a forged `?signedAt=0&expiresAt=99999999999999` was accepted.
  It now rejects with 403, `LocalContent` requires a `JWTService`, and
  `pikku serve`/`pikku dev` mint an ephemeral per-process signing key so local
  development works without shipping a fail-open path. In-flight signed URLs must
  be re-issued.

  **Request body size limits now apply to every adapter.** The `maxBodySize` cap
  existed only in `PikkuFetchHTTPRequest`. The real hole was uWebSockets, which
  drove `res.onData` itself and concatenated every chunk with no bound and nothing
  downstream able to intervene; it now drops chunks past the limit and replies 413
  before routing. Fastify delegates to its native `bodyLimit` (set only when
  `maxBodySize` is configured, so fastify's stricter 1 MB default is never
  loosened), and `PikkuExpressServer` feeds the limit into its body parsers. Two
  paths can only reject rather than prevent, and are documented as such:
  `express-middleware` mounted on your own app receives an already-parsed body, so
  that deployment must bound its own parser; Next server actions bottom out at
  `experimental.serverActions.bodySizeLimit`.

  **Breaking: the console addon's privileged functions are gated by default.**
  `wireAddon` gains a `scopes` option that applies to every function in the
  addon's namespace, and the console scaffold now generates
  `wireAddon({ name: 'console', package: '@pikku/addon-console', scopes: ['admin'] })`.
  Previously the console's entire privileged surface — around 54 functions
  including `credentialGet`, which returns a resolved OAuth token for an arbitrary
  `userId`, `updateFunctionBody`, and `installAddon`, which shells out to a
  package install — was protected only by an optional host-registered
  `addGlobalPermission`. `resolveGlobalPermissions` returns `[]` when none is
  registered and permission checking then no-ops, so an app that never registered
  one served those functions to anyone, and with the template's default
  `scaffold.rpc: "no-auth"` that meant unauthenticated. All of them now return 403
  `MissingScopeError` without an `admin`, `admin:*` or `*` scope. **Regenerating
  is required** — an app holding an old `console.gen.ts` stays open.
  `installAddon` and `installOpenapiAddon` additionally declare their own
  `auth: true, scopes: ['admin']`, and `getAgentThreads` now scopes its listing to
  the session's own threads unless the caller holds admin.

  Addon scopes are enforced in `runPikkuFunc` rather than at the RPC boundary,
  because a wiring can reference an addon function directly — the inspector
  records the addon's `packageName` on HTTP, channel, schedule, queue, CLI,
  trigger, gateway and MCP wirings — and those paths never call `resolveNamespace`.
  Enforcing at the RPC seam would have covered only the `namespace:function` form
  while reading as complete.

  **Breaking: `wireAddon`'s `auth` and `tags` now apply on direct wirings too.**
  Both were read only by `resolveAddonFunction`, so they had exactly the hole
  scopes had: `wireAddon({ name: 'console', package: '@pikku/addon-console', auth:
true, tags: ['admin'] })` gated `rpc('console:credentialGet')` and gated nothing
  at all on an HTTP route wired straight to `credentialGet`. A consumer who
  reached for the documented way to lock an addon down got a control that was
  silently inert on every wiring except one. Both now resolve in `runPikkuFunc`.
  `auth` merges as an OR — `auth: false` from an addon is ignored on a direct
  wiring, because an addon may require a session the wiring did not but must never
  waive one it did. Addon tags resolve to concrete middleware against the **root**
  tag groups before the call rather than being folded into the function's
  inherited middleware: `addTagMiddleware('admin', …)` is written by the consuming
  app and registers under the root package, whereas `combineMiddleware` would look
  the tag up under the addon's own `packageName`, where it does not exist.

  One consequence worth naming: an addon that wires `auth: true` and also runs its
  own sessionless internal work — a scheduled task or queue worker inside the
  addon calling a sibling function — is now gated where it previously was not,
  because a bare `rpc('fn')` from inside the addon reaches `runPikkuFunc` with the
  addon's `packageName` like any other call. This reverses a decision that
  deliberately scoped the gate to the namespaced boundary; that reasoning held
  only while the boundary was real, and a direct wiring can enter an addon without
  crossing it, so "already inside" is not something the runtime can infer. Such an
  addon should carry authorization on the function via
  `pikkuFunc({ permissions })`, which has always been enforced on every path. A
  follow-up will add execution provenance so an intra-addon call can be
  distinguished from an external one and skip the addon-level check; that needs a
  marker no caller outside the process can set, which is its own design problem
  and does not belong in a security fix.

  **Codegen now warns when an exposed function has no gate (PKU574).** The
  generated `POST /rpc/:rpcName` dispatcher forwards to `rpc.exposed`, which
  refuses anything without `expose: true` — but nothing checked whether the
  target was gated, because a dispatcher cannot know what it dispatches to. The
  console shipped ~54 privileged functions through that gap and the toolchain was
  silent. The inspector now reports every function that is exposed, sessionless,
  and carries no `auth`, `scopes` or `permissions` of its own and none from a
  governing `wireAddon`. It is a `warn`, not a critical: `expose: true` on an
  ungated sessionless function is correct for a genuinely public endpoint, so it
  blocks a build only under `--fail-on-warn`.

  Two pieces of metadata were missing for this to be answerable statically, and
  both are now recorded. A `pikkuSessionlessFunc`'s own `auth: true` was read at
  runtime but never written to function meta, so a self-gated function was
  indistinguishable from an ungated one — `sessionless` carries the baseline, and
  `auth` now carries the tightening. And `wireAddon`'s `scopes`, `auth` and `tags`
  were not parsed at all: the inspector recorded the addon's `rpcEndpoint` and its
  secret, variable and credential overrides, and dropped every one of its gates.
  An addon whose gates are not statically knowable is treated as gated, because a
  false positive on a correctly-secured addon costs more than the one case it
  would catch.

  **Breaking: an application's global permissions now apply inside addons.**
  `resolveGlobalPermissions` read only the bucket matching the function's own
  package, but the generated `addGlobalPermission` wrapper takes no package
  argument and always registers under the root. An app-wide rule like "every
  request needs a signed-in user" therefore stopped at the addon boundary, and the
  bucket an addon's functions did read was one no host could write to — which is
  why the console addon's recommended `addGlobalPermission([isAdmin],
'@pikku/addon-console')` was never a gate anybody could actually install. A
  function now resolves the root bucket and its own package's, root first.
  Unioning is safe in a way nothing else here would be: globals AND, so adding the
  root ones can only tighten. Package buckets stay one-way — a package's globals
  never reach root functions, or an installed addon could gate the whole
  application. Apps with both a root global and addon-provided functions will see
  those functions gated where they previously were not.

  **Codegen now records whether each HTTP route requires a session, and warns
  about inert addon tags (PKU575).** Four separate things can demand a session —
  the function's `sessionless`, its own `auth`, the route's (or its group's)
  `auth`, and the addon it belongs to — and answering "which routes are open?"
  meant joining all four by hand and knowing which wins. Each route's meta now
  carries the resolved `requiresSession` alongside the route's own `auth`. Scopes
  count as requiring one, since they are matched against the session's and fail
  closed. Anything not statically knowable resolves to `true`, matching PKU574:
  a route that looks stricter than it is costs less than one that looks open and
  isn't. Separately, `wireAddon({ tags: ['admin'] })` reads like a gate and is
  applied like one right up until no `addTagMiddleware('admin', …)` exists, at
  which point it resolves to an empty list and gates nothing; that now warns.
  Only addon tags are reported — a tag on a function is as likely to be
  organizational, and warning about those would bury the case that matters.

  **Object-shorthand permissions were missing from meta.** The inspector visited
  `ts.PropertyAssignment` but not `ts.ShorthandPropertyAssignment`, so
  `permissions: { canAdminOrg }` — enforced identically to the longhand form at
  runtime, since `verifyPermissions` has a non-array branch — was recorded as _no
  permissions at all_. That is the most dangerous direction for meta to be wrong
  in: an audit reading it sees an open door where one is shut. It cost this review
  a false IDOR report across ~35 billing and org functions before the source
  contradicted the metadata.

  **Functions that authorize in their own body can say so.** A webhook receiver
  verifying a signature, or a handler redeeming a signed invite, is genuinely
  closed while carrying no session, scope or permission — indistinguishable in
  meta from one nobody remembered to gate, and so warned about forever by PKU574.
  `selfAuthenticated: true` on the function config records the claim and silences
  the warning for that function. It is declarative only: nothing at runtime reads
  it and it grants nothing. Detection was rejected deliberately — inferring it
  from the body means a function that _looks_ like it checks something silences
  the warning while checking nothing, and a warning that is usually wrong stops
  being read.

  **Breaking: `scaffold.<feature>` is now `boolean | { auth?, path? }`, and `true`
  means authenticated.** The old `'auth' | 'no-auth' | false` read like a
  starter-file preference while being a live authorization decision, set three
  directories from the functions it governed — the shape the console incident
  took. A surface now becomes public only by writing `{ auth: false }`, so
  omitting a field can never open anything: the failure mode of a forgotten flag
  is a locked door. `{ path }` additionally overrides where the file is
  generated, which previously could only be set for all features at once via
  `pikkuDir`.

  The legacy strings are **refused, not coerced**. `resolveScaffoldFeature` throws
  naming the key and its replacement (`"rpc": "no-auth"` → `"rpc": { "auth":
false }`), and it does so at config load, not downstream. An earlier design used
  a bare `string` for the output path, under which `"no-auth"` would have parsed
  as a file named `no-auth` and every unmigrated config would have silently
  produced nonsense; the object form makes any string invalid, so the failure is
  loud.

  The collapse is deliberately not uniform in effect. For `rpc` the flag was a
  blanket "no anonymous RPC in this app" set on a dispatcher that cannot know what
  it dispatches to; for `userAdmin` it was redundant, since the generated
  functions are already `pikkuFunc` with `scopes: ['admin:users:list']`. But for
  `agent`, `workflow`, `events` and `scenarios` it is the only gate — those
  generate real endpoints the app never authors — so `true` keeps them
  authenticated rather than opening them as a side effect of a config cleanup.
  `webhook` and `remoteRpc` have no auth dimension at all (`serialize-remote-rpc.ts`
  hardcodes `auth: false`), so an `{ auth }` on them is ignored. The three
  configs in this repo are migrated preserving their current behaviour exactly.

  **Queue job identities are signed.** A job carried the producer's `pikkuUserId`
  as a plain string and the worker resolved a session from it with no
  verification, so write access to the queue backend was act-as-any-user. The
  identity is now `pq1.<claim>.<hmac>`, HMAC-SHA256 over the claim and the
  canonicalized job payload, keyed by HKDF expansion of a new
  `PIKKU_QUEUE_IDENTITY_SECRET`. Producers opt in by wrapping their queue service
  with `SignedQueueService`. This fails safe rather than closed: with no secret
  configured the identity is dropped and jobs still process, warning once per
  process, so no existing deployment breaks on upgrade — it simply loses queue
  identity until the secret is set. The payload rather than the job id is bound
  because SQS, Cloudflare Queues, Azure and the in-memory service all mint ids
  after `add` returns.

  **Workflow inline state is read from the run record.** `isInline` consulted a
  process-local `Map`, while `WorkflowRun.inline` is durable. Any instance that
  did not start a run disagreed with the record, so one instance could dispatch a
  queued job for a workflow another was already executing in-process. It is now
  async and resolves through the durable identity, cached only when a context
  already exists so a passive reader allocates nothing. The same `Map` also leaked:
  `nextStepKey` fabricated replay state on every step, and `releaseContext`
  refused to free anything carrying it, so runs whose steps executed outside a
  `beginReplay` bracket — the step-worker queue path — stranded their context and
  step state for the process lifetime. Contexts are now released by an explicit
  execution counter. Step ordinals reset per execution rather than accumulating
  across step-worker invocations in one process, which makes step naming
  independent of how work was distributed.

  **Secret reads fail loud in every store.** `MongoDBSecretService.getSecrets`
  skipped rows that failed to decrypt, and the redis equivalent dropped every
  rejection via `Promise.allSettled`, including the "No KEK available for
  key_version N" configuration error. Both now throw, naming the key and its key
  version, matching the kysely behaviour. This matters most alongside the KEK
  change above: without it, an upgrade surfaces as a partial secrets map and an
  opaque downstream failure instead of an error naming the secret to re-enter.

  **A second middleware registration for a pattern no longer erases the first.**
  `addHTTPMiddleware`, `addTagMiddleware` and `addChannelMiddleware` groups are
  keyed by pattern or tag and held one source file each, so a second file's call
  overwrote the first's. Codegen emits its imports from what is stored, so the
  losing file was never imported and its middleware never registered — the
  runtime composes repeated registrations for a pattern happily, and only codegen
  dropped one. Adding an unrelated `addHTTPMiddleware('*', …)` to an app was
  enough to silently unregister the generated better-auth session bridge, which
  fails open and gives no sign until a request arrives without a session. A group
  now carries every registration made for it, and all of them are imported.

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
- Updated dependencies [6a6675c]
- Updated dependencies [8075f6a]
  - @pikku/core@0.12.74
  - @pikku/kysely@0.13.7
  - @pikku/node-http-server@0.12.7
  - @pikku/knowledge@0.12.3
  - @pikku/inspector@0.12.52
  - @pikku/n8n-import@0.0.4
  - @pikku/skills@0.12.4

## 0.12.94

### Patch Changes

- c984df6: Give an agent's tools back the descriptions their authors wrote

  A tool's description is what the model is told the tool does, and the main
  thing it chooses between tools on. It was not reaching the model. `description`
  is classed as a verbose field, so it is stripped from the metadata bundled into
  the generated bootstrap — the copy `pikkuState('function', 'meta')` is built
  from. `buildToolDefs` read the description from there, found it always
  undefined, and fell through to the tool's own name. Every agent has been
  choosing between bare identifiers. The same fallback was offering an addon's
  MCP tools under their names, for the same reason.

  Tool definitions now resolve descriptions through `metaService`, which reads
  the verbose metadata and falls back to the minimal copy, so the authored text
  is recovered wherever the generated `.pikku` directory is readable. Where it is
  not — no `metaService`, or a deployment shipping only the stripped copy — a
  tool falls back to its name, which is what it did before. Addon metadata is
  likewise loaded verbose-first. `title` is no longer part of the chain: a title
  labels a tool in a UI, it does not tell a model when to reach for it.

  An addon has to ship the verbose file for any of this to reach it. `tsc` only
  emits the JSON it sees imported and nothing imports the verbose meta, so the
  bundled addons now copy it into `dist` explicitly.

  `ref()` is resolved at build time. It used to be pushed through codegen as an
  opaque string, so `ref('todos:doesNotExist')` generated cleanly and failed only
  when the agent ran. The inspector now resolves each reference against the
  project's functions, or — using the namespace-to-package mapping `wireAddon`
  already provides — against the addon's own metadata, and reports an unwired
  namespace (`PKU152`) or a missing function (`PKU153`) at codegen. An addon that
  has not been built yet contributed no metadata and is skipped rather than
  reported missing.

  New `pikku --strict-meta` additionally fails the build on any agent tool with
  no description (`PKU154`), including tools reached through an addon. It is off
  by default, so nothing that builds today stops building; turn it on to hold a
  project to the metadata its agents actually run on.

- 63ff32b: Run a CLI's commands on the server, over the connection the client opened

  A CLI that talks to a service has to ship the service's command tree, so the
  two versions drift: the binary someone installed months ago still believes in
  flags and commands the server has since changed. This makes the command tree
  the server's, and leaves the client holding only a socket.

  `wireCLI` gains `auth`, and a program wired with a channel entrypoint now
  generates a `__raw` route: the client forwards argv untouched, the server
  parses it, runs the command, and streams the output back as it happens. The
  terminating frame carries the exit code, so a failed remote command still exits
  non-zero locally. Renderers stay on the client and are matched by the command
  id the server reports; an unrecognised command falls back to JSON rather than
  failing.

  Every channel gains `channel.remote(...)`: calling a function on the peer at
  the other end of the connection and waiting for its answer. A channel is
  otherwise fire-and-forget in both directions, so this is what reaches a peer
  that has no address of its own — a CLI on a laptop, a browser tab, a sandbox
  behind NAT. It is on `channel` rather than `rpc` because it is bound to one
  connection: which peer answers is the socket the call goes out on, not
  something the RPC map could resolve. Any `wireChannel` gets it — a client
  registers what it is willing to answer to, and a name outside that list is
  refused.

  Requests are correlated by id, time out, and fail fast when the socket closes
  rather than waiting out the timeout. Replies are taken off the socket ahead of
  routing, so a channel needs no route for them and an answer can never be
  mistaken for a new message; the transport is created on first use and released
  when the channel closes, which is also what fails anything the departing peer
  still owed an answer to. Channels that only flow one way — SSE, an agent's
  output stream, a locally-run CLI — refuse the call outright instead of waiting
  for an answer that was never going to come.

  What a peer answers with is its word, so it is checked before a caller sees it
  — against the schema codegen already generated from the function's declared
  return type, the same one an agent tool or an HTTP response is checked against.
  A capability is declared with `pikkuRemoteChannelFunc`, which takes the usual
  `title` / `description` / `input` / `output` but no `func` — this side owns the
  contract, the peer owns the body. It registers under its name like any other
  function, so `channel.remote` is typed off the same generated map as
  `rpc.remote` and no caller has to cast, and a local call throws rather than
  missing: reaching it locally means a command asked the server for something
  only a client knows. A client on an older build fails the call it answered
  rather than the caller failing later somewhere with no reason to expect a bad
  shape; a name with no declared contract is left alone. Both frame guards
  validate the whole envelope rather than the action tag alone, and a failure
  payload with a non-string name or message falls back rather than being attached
  to an `Error`.

  The arguments going the other way are checked too, against the schema for the
  capability's declared input, before anything is registered or sent. That is not
  a boundary — the peer runs the code and has to check what it was handed, and a
  caller that meant harm would send arguments that pass. It catches drift, where a
  server built against a newer capability signature calls a client that predates
  it, and fails it here rather than inside someone else's process.

  A channel-driven CLI command uses this to ask its caller for machine-local
  facts mid-run — a git sha, a working tree, a local file. The CLI wire's own
  channel is synthetic (it exists so a command can stream progress without
  knowing where that goes), so it delegates `remote` to the connection the
  command actually arrived on.

  Because that runs code on someone's machine at a remote caller's request, the
  capability map says what _can_ run and approval says whether a particular call
  _should_. A capability may be declared `{ execute, needsApproval }`, sharing
  `ApprovalPolicy` — `needsApproval` and `approvalDescriptionFn` — with
  `AIAgentToolDef`, which has carried both since before channels could call back:
  both are an allowlist of named callables invoked by something other than the
  code that wrote them. The runtime around them is deliberately not shared, since
  an agent suspends its run and resumes it later while a reverse call is a live
  await with a person at the other end.

  A capability written as a bare function is unclassified, and unclassified means
  approval is required — the annotation nobody got round to writing is the one
  most likely to matter, so it fails closed. Declare
  `{ execute, needsApproval: false }` for a capability that may run unattended.
  Nothing infers this: core cannot tell a read-only capability from a destructive
  one, so `needsApproval: false` is the author asserting it, and the assertion is
  the only thing standing between a remote caller and the machine.

  The default is the opposite of `AIAgentToolDef`'s, where absence means "do not
  ask" — a tool is written by the same people who run the server it executes on,
  and a capability is not.

  `executeRawCLIViaChannel` reads `--auto-approve` and
  `--dangerously-auto-approve` out of argv (or `PIKKU_AUTO_APPROVE` /
  `PIKKU_DANGEROUSLY_AUTO_APPROVE`) and strips them before argv reaches the
  server — what may run on this machine is this machine's decision, and a flag
  the server can see is one the server could act on. `--auto-approve` permits the
  classified-safe set and refuses the rest; `--dangerously-auto-approve` permits
  everything and says so once on stderr. Interactively the user is asked per
  call, with `y` / `n` / `a`, where `a` is remembered for that one capability for
  the rest of the run and never written to disk — widening it to the session
  would quietly turn an interactive run into `--dangerously-auto-approve`. A run
  with no terminal and no flag refuses rather than assuming yes, because CI is
  exactly where an unattended `git push` would otherwise happen. The tiers are
  meaningful here in a way they would not be for an agent: the caller is a
  deterministic program whose source can be read, so "these calls are always
  fine" is a claim someone can actually justify.

  A peer that is asking a human sends a pending frame first, which stops the
  caller's timeout. Without it any approval slower than the timeout would fail
  the call and then discard the decision when it finally arrived. The call is
  still failed the moment the socket drops — what actually happens when a peer
  dies mid-prompt — and a peer that sends the frame dishonestly can do nothing
  but keep its own call waiting. A refusal is sent as an answer, so a denied call
  fails its command immediately rather than hanging.

  Fixes found on the way, each of which broke this path:
  - A websocket upgrade wrote middleware headers (CORS, on every request)
    straight onto the socket, so the first bytes a client saw were headers rather
    than `ws`'s `101` status line and the handshake failed to parse. Header
    writes are now buffered and flushed behind a status line only when the
    upgrade is actually being rejected.
  - An upgrade socket had no error listener while the channel opened, so a client
    that gave up mid-handshake took the whole server process down with an
    unhandled `ECONNRESET`.
  - `onConnect` and `onDisconnect` never saw the session established during the
    upgrade, so a channel could not tell who had just connected.
  - Setting the routing key on a channel result mutated the value in place, which
    throws for a primitive under ESM strict mode.

- a7b26c5: rename the inspected declarations to `define*`: `wireScope` → `defineScope`, `wireSecret` → `defineSecret`, `wireVariable` → `defineVariable`, `wireCredential` → `defineCredential`

  `wire*` meant two unrelated things. A transport wiring attaches a function to
  something that can invoke it — `wireHTTP`, `wireChannel`, `wireScheduler`,
  `wireQueueWorker` and the rest — and the thing it wires runs. These four wire
  nothing: they are no-ops that exist only so the call typechecks, they are
  tree-shaken out of the build, and their whole job is to be found by the
  inspector's AST pass and turned into a type union. One word for both left the
  declaration reading like a registration with a runtime.

  So the vocabulary splits: **`wire*` is a transport, `define*` is an inspected
  declaration.**

  ```ts
  import { defineScope } from '@pikku/core/scope'
  import { defineSecret } from '@pikku/core/secret'
  import { defineVariable } from '@pikku/core/variable'
  import { defineCredential } from '@pikku/core/credential'

  defineScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })
  ```

  **Breaking:** no alias is kept. Rename the four call sites; the module subpaths
  (`@pikku/core/scope`, `/secret`, `/variable`) are unchanged.

  The inspector matches these by identifier text, so a stale `wire*` call is not a
  type error — it is silently not extracted, and the generated union comes back
  empty. That fails as "this scope isn't declared" on code that was fine a moment
  ago, nowhere near the declaration. Grep for the old names rather than trusting a
  clean build.

  An addon published with `.pikku` output generated before this release re-exports
  `wireSecret` from `@pikku/core/secret` and will not typecheck against this core
  until it is rebuilt and republished.

- 457cb25: Add `definePersonas()`: the people a project's scenarios and virtual users run
  as, declared in code.

  There used to be three names for two-and-a-bit things — an _actor_ in
  `scenarios.actors`, a _persona_ in `scenarios.personas`, and a _virtual user_
  declared separately against an actor. In practice almost every actor was its own
  kind, so the second set carried no information and the third was a third place
  for a name to drift. There is now one declaration:

  ```ts
  definePersonas({
    shopper: {
      name: 'Sam Shopper',
      jobTitle: 'Shopper',
      personality: 'Buys in a hurry and leaves tabs open',
      roles: ['customer'],
      disposition: 'careless',
      goals: ['Buy something without reading anything'],
      account: {},
    },
  })
  ```

  A persona is a person: what they are like, what they want, the roles they hold,
  and **one** account they sign in with — `account: {}` plus `linkedAccounts` for
  the rare case of more, modelled on how better-auth does linking. A persona with a
  `disposition` is a virtual user; `runnable: false` marks someone who only ever
  exists to be acted upon — banned, shared with, reset — and is never handed a
  session.

  **A persona names roles, never scopes.** Scopes come from `defineSystemRole()`
  expansion, so the build fails if a persona names a role nobody declared, and
  fails again if a role confers a scope no `defineScope` declares. Running one only
  ever has to check that its roles are still valid.

  **Addresses are computed, never declared.** `personaEmail(id, domain, runId)`
  derives `<id>[+runId]@<domain>` from `scenarios.emailDomain`, so a seed, a
  scenario run and a virtual-user run cannot disagree about who they are signing in
  as. `scenarios.actors` and `scenarios.personas` are gone from
  `pikku.config.json` — only `emailDomain` remains.

  `actor` survives in exactly one place: the name of a **slot in a scenario step**,
  which is the role a persona is cast in for that step. `pikkuVirtualUser()`,
  `kind`, `grants` and the `actor` field are removed; the `actors` service is now
  `personas`, and the CLI's `virtual-user` commands are now `pikku persona list` /
  `pikku persona run`. `budget` and `allowApprovalRequired` moved to run flags —
  how much you will spend today is not a fact about a person.

  `@pikku/cucumber` drops its `Actor` class and `ActorDispatchContext`: a
  hand-rolled cookie jar that a persona's own typed session replaces outright.

- f7567ad: Add `defineSystemRole()`: roles that ship with the product, declared in code.

  A system role is to a console-composed role what an AWS managed policy is to a
  customer-managed one — the console may show and grant it, but not rename,
  re-scope or delete it. The CLI extracts declarations by AST and generates a
  `SystemRoleName` union, so naming a role that does not exist fails the build,
  and a role granting a scope no `defineScope` declares fails it too.

  Removal is additive on the same terms as `defineScope`: deleting a declaration
  leaves an inert row rather than revoking everyone's grant mid-deploy.

  `ScopeService` gains `syncSystemRoles`, `findStaleSystemRoles` and
  `pruneSystemRoles`; `Role` gains `system` and `declared`. Implementations
  enforce immutability through the shared `assertRoleIsMutable` /
  `assertRoleNameAvailable` guards rather than each inventing the rule.

- a2e21e5: Keep the persona runtime off the production barrels

  `@pikku/core/services` exported `HttpPersona`, `createHttpPersonas` and
  `readScenarioHttpResponse` as values, and `@pikku/core/workflow` exported
  `readScenarioHttpResponse` and `postScenarioJson`. Both are barrels a production
  server imports, and `http-personas` reaches the actor-flow conversation runner
  and through it the agent runner — so signing-in-as-a-persona machinery sat in the
  module graph of every app that imported services.

  Tree-shaking only removes that if you bundle. An unbundled Node or Lambda deploy
  loads whatever the graph names, which is the case this matters in.

  The values now come from `@pikku/core/persona`, which is where the rest of the
  persona API already lives. **Types stay exactly where they were** — `import type`
  erases, so it costs a bundle nothing, and moving them would put core in a cycle
  with the code that describes its own function types.

  `serialize-personas` generates the new import, so a regenerated
  `pikku-personas.gen.ts` picks it up with no edit. Anything importing these four
  values from `@pikku/core/services` or `@pikku/core/workflow` changes the
  specifier to `@pikku/core/persona`; the names and signatures are unchanged.

  A test walks each barrel's value-import graph and fails if scenario runtime
  reappears, so this cannot regress quietly.

- 457cb25: Let a persona do a real job in production, and say where it may act.

  A persona was only ever a test subject: something you pointed at a stage to find
  out what the product does wrong. But the same declaration — a name, a job, the
  roles it holds and what it is trying to get done — describes a teammate doing
  the work for real, and nothing about the engine cared which one it was.

  Four changes make that difference explicit and enforced.

  **`environments` moves to the top level of `pikku.config.json`**, out from under
  `scenarios`. It was never a scenario's anything: `persona run` targets one, and
  now so does `persona sync`. An environment may be flagged `production: true` —
  a flag rather than a reserved name, because projects call it `prod`, `live` or
  `eu-prod`, and more than one environment can be production.

  **A persona may name its `environments`.** Omitting them means every configured
  environment _except_ the production ones, so nothing reaches production by being
  forgotten. Naming a production environment requires `disposition: 'accountable'`.
  The rule is checked twice, on purpose: the inspector refuses to generate a
  declaration that breaks it, and sign-in re-checks against the environment
  actually resolved — the build check trusts the file, and the run check does not
  trust which artifact got deployed. An unresolved environment fails closed.

  **`disposition: 'accountable'`** is that production disposition. It sits opposite
  `adversarial` on the intent axis rather than the care axis: what it changes stays
  changed, every call is recorded against its name, and it stops to ask rather than
  acting and reporting afterwards. Alongside it, **agents now appear in a persona's
  computed catalogue**, gated by the same scopes as the RPCs — an agent is reached
  rather than declared, so a persona finds the specialists its roles unlock and
  chooses between calling the API itself and handing the work over. That also fixes
  a latent gap: `talkTo` was wired at the target but never advertised in the
  instructions, so it was never used.

  **`pikku persona sync <environment>`** provisions them: it creates each account
  and applies the roles it declares, additively, and never revokes. Seeding is test
  data and `db seed` does not run in production; a teammate doing a real job still
  needs an account and its grants. It needs both halves of an environment — its API
  to sign the person in, its database to write the grants — and `--dry-run` reports
  who would be provisioned, with what, and why anyone was skipped.

  In the console, a virtual user now says where it may act — the environments it
  named, or the rule when it named none — and its dossier carries the `sync`
  command alongside the `run` one, because the account is not a by-product of a
  run. `accountable` reads as a disposition like the rest.

- 86a50b9: scenario: replace `browser: true` + `func` with per-surface bindings on `pikkuScenarioStep`

  A step now declares one implementation per surface it can be driven through:

  ```ts
  export const buysTheItem = pikkuScenarioStep<{ sku: string }, { orderId: string }>({
    name: 'buysTheItem',
    description: 'buys the item',
    browser: async (services, data, { browser }) => { ... },
    default: async (services, data, { rpc }) => { ... },
  })
  ```

  `pikku scenario run --run browser|cli|default` picks which surface the run drives,
  and the two phases resolve bindings differently:
  - **Actions** (`given` / `when` / `step`) run exactly one binding — the run
    surface if it has one, otherwise `default`. A step with neither now fails with
    `ScenarioNoSurfaceBinding` instead of silently running server-side.
  - **Assertions** (`then`) are witnesses, not alternatives: every declared binding
    runs and they must agree. Two surfaces reporting different things fails the run
    with `ScenarioWitnessDisagreement` rather than reporting a pass. An assertion
    with no witness the run can execute at all fails with `ScenarioNoWitness` —
    without it the step returns `undefined` and renders as a tick, reporting a pass
    for something nobody checked.

  A scenario written as a step ladder that never calls `then` is now a **PKU680**
  critical. It proves only that nothing threw, so an assertion-free ladder of
  browser-bound actions would score perfect coverage while checking nothing.

  The report gains a surface-coverage line — `n/m steps ran on browser`, counted
  over every step, so an action that fell back to the server lowers the ratio
  rather than needing a footnote. That also makes surfaces comparable over one
  denominator: a scenario is `4/4` on a default run and `3/4` on a browser one.
  Assertions that fell back are named separately and gate `--strict`, since a
  sentence claiming the actor saw something nobody looked at is a different problem
  from an action taking a shortcut.

  **Breaking:** `browser: true` and the third `B extends boolean` type argument are
  gone. Rename `func` to `default` (or to `browser` where the step drove a browser)
  and drop the type argument.

- 0e0f6eb: Add virtual users: LLM-driven synthetic users that work a real stage in
  character.

  A scenario proves a path somebody thought of. A virtual user works the same
  ground without the script — it signs in as a declared persona over the app's own
  auth, is handed the scenarios' BDD prose and the schema of every endpoint it may
  reach, and decides for itself what to do. It asserts nothing; a run produces
  findings, and their absence only ever means "not this time, not with this seed".

  There is nothing extra to declare. A persona with a `disposition` is a virtual
  user, and running it is what makes it one — see the `definePersonas` changeset
  for the declaration itself. Listing, describing or running one never loads the
  app: the inspector reads the literal declaration, the CLI writes
  `scopes/pikku-personas-meta.gen.json`, and `MetaService.getPersonasMeta()`
  serves it.

  **Dispositions are engine dials, not prose.** Each carries its own intent weights
  (continue / suspend / resume / abandon), temperature, re-read and repeat rates,
  and switches: `careless` puts things down and picks them up in the wrong order,
  `newcomer` starts with no memory, `auditor` is never offered a mutation,
  `adversarial` is shown the catalogue its roles do not cover — being offered a
  call it should not be able to make is the test — while those roles stay live as
  the oracle, so a success outside them is authorization drift rather than a pass.

  **Nothing is retrieved against.** The whole reachable catalogue goes into the
  instructions (~8k tokens on a 430-RPC project, cached for the run), because a
  ranking function would make the user only as adventurous as the ranking and lose
  exactly the endpoints worth stumbling into. Schema first: an endpoint must be
  described before it may be called.

  **No money in core.** The engine counts steps, calls, mutations and tokens; what
  they cost is the app's to decide through `stop(tally)`.

  CLI: `pikku persona list` and `pikku persona run <environment> [name]`, with
  flags overriding a declaration for reproduction (`--seed`, `--steps`,
  `--disposition`). Spending is a run flag too — `--steps`, `--mutations` and
  `--duration` bound a run, because how much you will spend today is not a fact
  about a person. Console: a Virtual Users screen beside Scenarios, built out of
  core's own derivation functions so it shows a run's actual inputs rather than a
  second implementation of them.

  `dev-ai-runner` now ships its own `@pikku/ai-vercel` and
  `@ai-sdk/openai-compatible` instead of requiring them from the project. Behind a
  proxy one openai-compatible provider answers for every prefix, so there was never
  a per-vendor package worth making somebody install; the project's copies still
  win when it has them, and both load from the same place or neither does.

- Updated dependencies [c984df6]
- Updated dependencies [63ff32b]
- Updated dependencies [ba6cc08]
- Updated dependencies [d007191]
- Updated dependencies [45859cf]
- Updated dependencies [a7b26c5]
- Updated dependencies [457cb25]
- Updated dependencies [f7567ad]
- Updated dependencies [ba6cc08]
- Updated dependencies [a2e21e5]
- Updated dependencies [457cb25]
- Updated dependencies [86a50b9]
- Updated dependencies [0e0f6eb]
  - @pikku/core@0.12.73
  - @pikku/inspector@0.12.51
  - @pikku/ws@0.12.5
  - @pikku/better-auth@0.12.20
  - @pikku/skills@0.12.3
  - @pikku/openapi-parser@0.12.17
  - @pikku/playwright@0.12.72
  - @pikku/knowledge@0.12.2

## 0.12.93

### Patch Changes

- e14c530: Dropped the OpenCode-specific discovery guidance from the bundled agent skills.

  Every skill's discover step told the agent to "prefer OpenCode tools such as `pikku-meta` when available; otherwise run the relevant `pikku meta ... --json` command" — a distinction that no longer holds, so the step now just points at the `pikku meta` command. The `pikku-fabric` skill loses the same framing around its `pikku-meta` and database sections.

  This is documentation shipped inside the package; `pikku skills install` still supports `--agent opencode`.

- 1d6c1e2: Drop the unused `verboseMeta` config option

  `verboseMeta` was declared on `PikkuCLIConfig`, and so appeared in the generated
  `cli.schema.json` as a supported option, but no code path ever read it. Setting
  it did nothing; leaving it unset withheld nothing.

  The verbose meta files it appeared to gate are written unconditionally:
  `writeMetaFiles` emits `<name>-verbose.gen.json` whenever the meta actually
  carries verbose fields, alongside the stripped `<name>.gen.json` that runtime
  imports. Consumers pick the verbose file up from disk when it is there —
  `metaService` prefers it and falls back to the minimal one, and the scenario
  coverage RPC reads `pikku-functions-meta-verbose.gen.json` at request time.

  The option's only real effect was to mislead: the `pikku-scenario` skill
  documented it as required for live coverage, so a `null` coverage report sent
  you to a config flag instead of to the actual cause — the verbose meta not
  being deployed next to the app. The skill has been corrected.

  Removed from the config type and from the templates and verifiers that set it.
  Projects carrying `"verboseMeta": true` should drop the key: the generated
  schema sets `additionalProperties: false`, so an unknown key fails validation.

- cfb828d: Escaped display names and descriptions in generated and scaffolded sources.

  A `displayName` is the human-facing label a developer writes — "Stripe's live key" — and it was interpolated raw into a single-quoted string in `pikku-secrets.gen.ts`, `pikku-variables.gen.ts`, and `pikku-credentials.gen.ts`. An apostrophe terminated the literal and the whole generated file stopped parsing, with `tsc` reporting a cascade of syntax errors in generated code rather than anything about the name. The three serializers now emit the value through `JSON.stringify`, which also covers a quote or a backslash — the same treatment the workflow map keys already get.

  `pikku new-addon` had the same hole: `--display-name "Bob's CRM"` scaffolded an addon that did not compile before its author had written a line of it. Its prose now goes through the same escaping, composed with the words around it so a message stays one literal, and through a template-literal-aware escape where the scaffolded code interpolates a response status.

- b89d3b3: Bring the knowledge base into OSS: a package, a CLI gate, a console browser and a skill

  `knowledge/` is where a project records the things `pikku meta` cannot tell you —
  what a slice is for, which rule was chosen and what it rules out, what is still an
  open question. Tables, routes, schemas and permissions are generated, so a note
  that repeats them is a copy that will drift, and the profile refuses the sections
  where that happens.
  - **`@pikku/knowledge`** (new) reads the notes, builds the link graph in both
    directions, and validates the app-project profile: every note typed, every
    section indexed, every slice carrying a third-person gherkin scenario and at
    most three entities, and every `resource:` URI resolving against the generated
    meta. The resource check fails closed on drift and open on ignorance — a prefix
    whose meta is absent is skipped rather than called dangling.
  - **`pikku knowledge validate`** and **`pikku knowledge index`** replace the dead
    three-flat-files check. Both exit non-zero on an inconsistent base, so a
    pipeline can stop on one; `index` refreshes each `index.md` listing while
    leaving the prose around it alone, and now gives a section that holds only
    sub-sections an index of its own instead of leaving it unreachable.
  - **The console** gains a read-only Knowledge page: notes grouped by section,
    a rendered document with its tags, resources, links in both directions and the
    findings against it, and intra-bundle markdown links that open the linked note
    instead of leaving the page. Read-only by design — a note is edited in the repo,
    in the same commit as the code it describes.
  - **The `pikku-knowledge` skill** documents the format for agents, and Fabric
    builds on it rather than restating it.
  - **`@pikku/inspector`**: a zod schema imported from a built workspace package
    resolved to that package's `.d.ts`, which has no runtime exports at all, so
    every schema in it was reported missing. The emitted JS beside it is imported
    instead.

- Updated dependencies [384e484]
- Updated dependencies [b5a73fb]
- Updated dependencies [6be5ab0]
- Updated dependencies [b89d3b3]
- Updated dependencies [b89d3b3]
- Updated dependencies [e14c530]
  - @pikku/core@0.12.72
  - @pikku/knowledge@0.12.1
  - @pikku/inspector@0.12.50
  - @pikku/skills@0.12.2

## 0.12.92

### Patch Changes

- 837c2a5: Generated files are written atomically, and unchanged schemas are not rewritten.

  `writeFile` truncates before it writes, so anything reading a generated file during codegen can see it empty. That reader is real: `pikku scenario run --spawn` bundles the registers while the dev server it just spawned is regenerating them, and esbuild fails the entire run with `Unexpected end of file in JSON` on whichever schema it caught mid-write. The scenario schema split made this reachable in practice — a project with hundreds of scenario schemas rewrote every one of them on every run, right as the runner was loading the register that imports them.

  Codegen now writes to a temp file and renames it into place, so a concurrent reader gets either the previous complete file or the new one. Schema files whose contents are unchanged are not rewritten at all, which removes the window entirely for the common case and stops file watchers waking on output that did not change.

- 826af9f: `pikku db generate` now writes a wholly-new table from the source's own SQL, instead of rendering it from a column list.

  When a schema source the migrations already cover grows a table — enabling a Better Auth plugin, upgrading an addon, a new `@pikku/kysely` runtime service — the generator took the diff path, which only had names and types to work from. The table it emitted had no primary key, no foreign keys and no indexes, and carried a `-- REVIEW:` note telling you to go copy the real statement by hand. Applied unreviewed, which is what an automated build does, it left a permanently degraded table.

  The source already ships the correct DDL, and the first-time path already used it. Now the new-table case does too: its `CREATE TABLE`, its indexes and any `ALTER TABLE` that constrains it are lifted out of the source's SQL in the order it wrote them. Column-level changes to a table that already exists still go through `ALTER TABLE … ADD COLUMN`, and the `-- REVIEW:` note for a `NOT NULL` column with no default is unchanged.

- 7586408: `pikku db migrate` now fails when a migration declares a camelCase column or table.

  Pikku's Kysely runs with `CamelCasePlugin`, so `priceCents` in TypeScript is `price_cents` in SQL and nothing else. A migration that spells the column `priceCents` half-works, which is what made it expensive: `.selectAll()` compiles to `SELECT *` and never names an identifier, so the table reads back perfectly, while the first query that names the column asks for `price_cents` and gets `no such column`. The plugin looks broken, and the fix looks like a raw `sql` template.

  Every `.sql` file in the migrations directory is now parsed before anything is applied, and every camelCase identifier a `CREATE TABLE` column list or an `ALTER TABLE … ADD COLUMN` declares is reported at once with its file, table and snake_case name. Comments, string literals, quoted identifiers and nested parens (`NUMERIC(10,2)`, `CHECK (…)`) are all read as SQL rather than as text, so prose mentioning `createdAt` does not trip it.

  There is no exception to opt out of. The generated Better Auth schema is snake_case for the same reason, because Better Auth is handed the app's own Kysely.

- 4c59a92: `db/pikku-db-schema.gen.json` now records who declared each table. Every entry carries a `source` — `app`, `better-auth`, `pikku-runtime`, or an addon's package name — and framework-declared tables also carry the `origin` prose from their migration header.

  The console's Database view filters on that instead of guessing from a table-name prefix. The old guess (`workflow_`, `ai_`, `pikku_`) missed Better Auth's `user`, `session`, `account` and `verification`, the secrets, credentials, channel and webhook-delivery tables, and every addon's, all of which rendered as if the project owned them. A schema JSON generated before this change still falls back to the prefix guess, so an un-regenerated project sees no behaviour change.

  Provenance is read back out of the generated migrations at codegen time — each one already names its source in its filename and its origin in its header — so `db migrate` needs no new inputs and does not have to load the project's Better Auth config.

- 66598d4: `pikku fabric secrets set` now seals the value on this machine before sending it. The CLI fetches the stage's public key, encrypts against it, and sends only the sealed blob — so the plaintext never reaches fabric, and the value can be opened by the stage's own worker and by nothing else. `secrets list` returns names and write times; there is no value to show, which is the point.

  Both commands were previously calling RPCs fabric no longer serves (`setStageSecret`, `listStageSecrets`) and failing at runtime. `getFabricRPC` returned `any`, so nothing caught it — it is typed now, which is also what surfaced `getDeveloperLiteLLMKey` missing from the bundled RPC map.

- ede74d7: `pikku fabric secrets rotate` retires a stage's sealing key so the next deploy issues a new one. This is the way out of the one dead end in client-side sealing: a worker that does not hold the stage's private key cannot read that stage's secrets, and fabric cannot hand it the key because fabric keeps no copy. Rotating makes every secret already set on the stage unreadable — fabric cannot re-seal values it cannot open — so it requires `--force` and says exactly that first.
- c335f73: `LibsqlWebDialect` now encodes a `Date` bind parameter as an ISO-8601 string and an array or plain record as JSON, instead of throwing `libsql: unsupported argument type object`.

  This closes a dev/prod split that broke every write in a deployed libsql app. The CLI's `node:sqlite` dev runtime already coerced dates and objects before binding them, so a query that stamps a `createdAt` or writes a JSON column passed under `pikku dev` — and then threw on the same code path once the app was deployed to a Worker, where this dialect is the one in use. Reads were unaffected, so the symptom was an app whose every insert and update failed while every list and get worked.

  Both runtimes also stop accepting objects JSON cannot faithfully represent. A `Map`, a `RegExp` or a class instance stringifies to `"{}"` or to a partial view of itself, so binding one used to persist an empty JSON blob where the caller meant something; it now throws. Only arrays and plain records (including null-prototype ones) are JSON-encoded. The two coercions are deliberately identical — a value that binds under `pikku dev` binds the same way once deployed, which is the property whose absence caused the original bug.

  Unsupported values now name their constructor — `unsupported argument type Map` rather than `unsupported argument type object`.

- 426610a: Scenario instrumentation is no longer scaffolded into projects, and no longer deploys.

  `scaffold.scenarios` generated four functions — `pikkuScenarioTakeLiveCoverage`, `pikkuScenarioResetLiveCoverage`, `pikkuScenarioResetStubs`, `pikkuScenarioGetStubCalls` — into the project's own source. As project source they were indistinguishable from application code: registered in the app bootstrap, listed in the app's function and RPC meta, and shipped `expose: true` inside every deployed bundle. Coverage and stub inspection are things you do to a development server; production carried two endpoints that fingerprint the build and one that resets a global tracker, gated only by whether a metadata file happened to sit beside the bundle.

  `pikku dev` now registers the implementations itself, after the app bootstrap. Nothing is generated, nothing is written to the project, and a bundle cannot carry what was never in its bootstrap — `pikku serve` and every deployed unit have no trace of them. The scenario runner reaches them over `/rpc/<name>` exactly as before.

  Also:
  - The inspector ignores these four names wherever it finds them, so a project that has not regenerated — and still has the scaffolded file checked in — stops deploying it immediately. Codegen deletes the retired scaffold on its next run.
  - They no longer count towards a project's function total, so `pikku scenario --coverage` stops reporting four permanently-uncovered functions that were never the project's to cover.
  - The instrumentation no longer carries schemas (there was nothing to validate but one optional string), which drops the `zod` dependency the scaffold silently required of every project that enabled it.
  - They are registered sessionless, so `scaffold.scenarios: true` — as opposed to `'auth'` — now genuinely means "no session required". As a sessioned `pikkuFunc` with `auth: false`, it demanded a session anyway and logged a warning saying so.

- fc84daf: `pikku scenario run` can now target a URL that only exists at run time.

  The environment named on the command line was the whole answer: its `apiUrl` and `appUrl` are literal strings in `pikku.config.json`, frozen when the config was written. A suite that wants to run against something provisioned moments earlier — a freshly deployed sandbox with a unique origin — had nowhere to put that address short of synthesising a config file per run.

  `--api-url` and `--app-url` now override the named environment's URLs for one invocation. The environment is still looked up by name and must still exist, so the flags override a target rather than inventing one, and the override is applied once where the environment is resolved: actors, raw-HTTP steps, the browser driver and a `--spawn`ed server all see the same address. A value that is not an absolute http(s) URL is rejected where it was typed, and `--spawn` with a non-local `--api-url` is refused instead of trying to bind a server to a host this machine does not own.

  Browser steps get the same reach. A driver that knows the target from its own environment — `@pikku/playwright` reading `SANDBOX_HOSTNAME`, `E2E_APP_URL` or `APP_URL` — is now allowed to supply the `appUrl` when the config names none; previously the runner refused before the driver was ever consulted. The check still fires when nothing resolved a real target: a driver reporting `appUrlSource: 'default'`, as `@pikku/playwright` now does for its `http://localhost:5001` placeholder, fails the run exactly as a missing `appUrl` always did.

- 09973b9: Scenarios, features and steps no longer reach a deployment.

  Steps were already held back from the app bootstrap, so a deployed server never imported a step body. Everything _about_ a scenario still travelled with the application: a `pikkuScenario(...)` is a function, so its name, schemas and hashes sat in the app function meta; the schemas it and its steps validate against sat in the app's `register.gen.ts` — on one project 458 of the 582 registered schemas belonged to tests; its name sat in the internal RPC meta; and because a scenario is _also_ a workflow, the inspector synthesised a `wf-orchestrator-<scenario>` queue worker for each one. The deploy analyzer, which reads inspector state rather than the partitioned codegen output, then read all of it back as application code: a unit per scenario, a `WorkflowDefinition` per scenario, and a real queue per scenario. A 13-scenario suite turned into 13 production queues named after tests, waiting for a provider to create them.

  The existing scenario/app partition is now applied everywhere it was missing. `FunctionRuntimeMeta` gains a `scenario` marker (the counterpart of `scenarioStep`) so a scenario body is recognisable without walking the workflow graph; scenario bodies join their steps on the scenario side of the function-meta and registration split; schemas only a scenario or step needs are written and registered under `.pikku/scenarios/schemas/` and imported by the scenario bootstrap alone; scenario names are dropped from the internal RPC meta; no orchestrator queue worker is synthesised for a scenario; and the deploy analyzer drops both scenario functions and scenario workflows before it decides what a deployment contains.

  The MCP metas are keyed by wiring rather than by function, so a scenario wired as an MCP tool, resource or prompt was the one id that still reached the manifest after the function and workflow filters — as an endpoint on the gateway plus a gateway dependency on a unit that was never emitted. Those ids are now filtered too.

  `scenarioSchemaDirectory` is rejected when it resolves to the same directory as `schemaDirectory`. A schema write owns its directory — it emits `register.gen.ts` and prunes every schema file its own required-set does not name — so sharing one would replace the application register with the scenario-only one and delete the app's schema files, which nothing downstream can detect.

  Nothing changes for `pikku scenario run` — the scenario bootstrap still registers every scenario, feature, step, meta and schema. What changes is that a bundle stops carrying them.

- 637e668: Move the bundled agent skills out of `@pikku/cli` into a new MIT-licensed `@pikku/skills` package.

  The skills are the open core — the instruction set any harness reads to build, wire and deploy a Pikku project — but they shipped inside `@pikku/cli`, whose `files` array carried `skills/` under BUSL-1.1 with no carve-out. Their terms now stand on their own package and no longer depend on the CLI that installs them.

  This also fixes `pikku skills install` on the native binaries. `bun build --compile` only bundles the JS import graph, so 81 markdown files reached through `readdir` never made it in: every Homebrew install failed with `Could not locate bundled skills directory`, while npm installs worked. `@pikku/skills` ships both the `skills/` directory and an embedded path → contents manifest, and reads prefer the directory when one exists — so skill edits stay live in development, and the binary falls back to the manifest it now carries.

  No skill content changed, and `pikku skills install` takes the same flags.

- Updated dependencies [637e668]
- Updated dependencies [8a2c993]
- Updated dependencies [a261006]
- Updated dependencies [426610a]
- Updated dependencies [fc84daf]
- Updated dependencies [09973b9]
- Updated dependencies [637e668]
  - @pikku/deploy-cloudflare@0.12.9
  - @pikku/core@0.12.71
  - @pikku/kysely@0.13.6
  - @pikku/inspector@0.12.49
  - @pikku/playwright@0.12.71
  - @pikku/skills@0.12.1

## 0.12.91

### Patch Changes

- dbac607: Stop the generated workflow and scenario meta files importing `@pikku/inspector`. `@pikku/inspector` is a build-time package a generated app has no reason to depend on, so the import only resolved where a package manager happened to hoist it — under bun it did not, and every bun template failed `tsc` with `TS2307: Cannot find module '@pikku/inspector/workflow-graph'`. The cast these files need is now `WorkflowsRuntimeMeta` from `@pikku/core/workflow/types`, which the generated app already depends on.
- 5962e51: Give the inspector's program the project's tsconfig path mappings.

  The inspector builds its own TypeScript program rather than reusing the project's, which is what keeps a cold run affordable — but it hand-rolled its compiler options and so had no `paths`. An import the project resolves only through a `paths` entry therefore did not resolve inside the inspector, and the factory the inspected function was passed to came back as `any`. A function whose input type comes from that factory's contextual type — rather than an explicit generic or a named `input:` schema — then recorded no input at all, silently, with no diagnostic.

  `inspect` takes a new `tsconfig` option (the CLI passes `config.tsconfig`, including on a setup-only run, where `schemaConfig` is absent). Only resolution keys are copied across — `baseUrl`, `paths`, `rootDirs`, `pathsBasePath`. Type-inference options such as `strict` deliberately stay the inspector's own, because changing those would change the types it records.

  This was latent rather than live: the generic path reads type _nodes_, the schema path reads an identifier, output types come from the handler body, and JSON schemas are generated by a separate tsconfig-aware program — so nothing in the tree reached the contextual-type fallback. Regenerating the e2e project and the `functions` template produces byte-identical output.

- a1a6816: Let a scenario actor declare the scopes and roles it holds

  `scenarios.actors.<name>` in `pikku.config.json` now takes optional `scopes` and
  `roles`, carried through to `scenarioActorConfigs`. Pikku never applies them —
  which scope store exists and which roles have been created is the app's own — so
  the generated actors file also exports `scenarioActorList`, the registry widened
  to `ScenarioActorConfig`, which is what a seed needs to read an optional field
  off every actor.

- dc3e11e: Generate scenarios, features and scenario steps into `.pikku/scenarios/` with their own bootstrap, so a deployed server never imports a step body.

  A `pikkuScenarioStep` body is an ordinary pikku function and a `pikkuScenario` is an ordinary workflow, so codegen wired both into `pikku-functions.gen.ts` and `pikku-workflow-wirings.gen.ts` — the files every server's bootstrap imports. A project's steps, and whatever a step imports (Playwright, fixtures, assertion helpers), therefore shipped in production. The e2e project's app bootstrap pulled in 20 step modules and 7 scenarios this way.

  Codegen now partitions on the flags that already existed — `scenarioStep: true` in function meta and `source: 'scenario'` in workflow meta — and emits:

  ```
  .pikku/scenarios/pikku-scenario-functions.gen.ts       addFunction for every step
  .pikku/scenarios/pikku-scenario-functions-meta.gen.ts  step meta, merged onto the app's
  .pikku/scenarios/pikku-scenario-wirings.gen.ts         addWorkflow + addFeature
  .pikku/scenarios/pikku-scenario-wirings-meta.gen.ts    scenario meta, merged onto the app's
  .pikku/scenarios/meta/*.gen.json                       per-scenario graph meta
  .pikku/pikku-bootstrap-scenarios.gen.ts                imports the app bootstrap, then the above
  ```

  `pikku scenario run` is the only thing that loads `pikku-bootstrap-scenarios.gen.ts`; `pikku dev` and `pikku serve` keep loading `pikku-bootstrap.gen.ts`. Bundling the e2e app bootstrap now resolves **zero** scenario or step modules.

  Both meta files _merge_ rather than replace — `pikkuState(…, 'meta', value)` is a wholesale setter — and each imports the app meta file it merges onto, so the ordering holds regardless of entry point. Features move wholesale to the scenario side: `serializeWorkflowRegistration` no longer emits `addFeature` at all.

  `LocalMetaService` reads the new locations alongside the old ones (`scenarios/meta` in `getWorkflowMeta()`, `pikku-scenario-functions-meta.gen.json` in `getFunctionsMeta()`), so the console's scenario list and function meta are unchanged — those read from disk, not from the bundle. Scenario meta left behind in `workflow/meta` by an earlier CLI is removed on the next codegen, so it cannot be served as a stale duplicate.

  **Not included:** a scenario step's input/output JSON schemas still register in the app's `schemas/register.gen.ts`. They are inert data rather than a module edge, and splitting them safely means deriving "required only by a step" across every other schema consumer — a wrong answer there unregisters a schema the server validates against.

- 04bfe3f: Scenarios get a fresh browser each time, a failure report worth reading, and a formatter that owns the output.

  Three changes that only make sense together.

  **A scenario no longer inherits the last one's browser.** `ScenarioBrowserProvider` gains an optional `reset()`, called between scenarios: every actor's context — cookies, storage, open pages, in-page listeners — is discarded, while the browser itself stays up. Before this, one browser context per actor lived for the whole run, so scenario 2 started signed in as whoever scenario 1 left behind. The boundary is the context rather than the browser because that is where the isolation actually lives, and re-opening one costs milliseconds instead of a relaunch. `reset()` runs _before_ each scenario, so the last one's window is still there to look at when a headed run stops.

  **A failure says what happened.** The runner reported `run.error.message` and nothing else — which for a browser step is "Timed out waiting for selector" with every useful detail removed. `ScenarioBrowserProvider` gains an optional `captureFailure(label)`, and the driver's page diagnostics (console errors, uncaught exceptions, failed requests, 4xx/5xx API responses) — collected all along and until now thrown away — are reported under the failing step, with a screenshot written to `<outDir>/scenario-failures`:

  ```
    ✗ failed at: Then  the admin sees the edit button
      Timed out waiting for selector button[title="Edit function"]
      browser (admin): http://localhost:4077/console/functions
        console:    TypeError: x is not a function
        api:        500 /api/rpc/console:readFunctionSource
        screenshot: .pikku/scenario-failures/code-editor-admin.png
      at readsFunctionSource (…/code-editor.steps.ts:71:5)
  ```

  Stacks are trimmed to the project's own frames, because the framework's are never the bug; `--trace` keeps all of them. An expected failure (a `PikkuError`) prints its message alone — a stack adds nothing to a deliberate one.

  **A failed scenario now shows its ladder at all.** It did not before, for a reason that took a live run to find: an inline run that fails throws out of `startWorkflow` instead of returning `{ runId }`, so the runner never learned the id of the one run whose steps were worth reading — and fell back to the run error alone. `startWorkflow` gains an `onRunCreated` option, called the moment the run exists, which is the only point guaranteed to happen whether the run goes on to pass, fail or suspend. A failure now prints every step that ran, marks the one that didn't, and names it in `✗ failed at:`.

  A browser timeout's `message` carries its entire call log, so the summary line and the ladder row take its first line only — the block underneath still prints all of it. Three copies of the same paragraph, one of them wrapping mid-table, is not a report.

  **All of that output now goes through one formatter.** `formatScenarioReport(report)` takes a plain serialisable report — no Maps, no meta handles — and returns the lines to print, the way `deploy plan` already works. Joining a run to the prose that declared it stays in `scenario-ladder.ts`, where the inspector state is; laying it out is the formatter's job. A second reporter (JSON, JUnit) is now a function rather than an excavation.

  **Browser drivers are pluggable.** `scenarios.browserDriver` in `pikku.config.json` names the package that drives `browser: true` steps; it defaults to `@pikku/playwright` but nothing requires it. A driver is any package exporting `createScenarioBrowserProvider(options)` — or a provider class — returning an object with `sessionFor()` and `close()`. `reset()` and `captureFailure()` are optional, so a driver written against the earlier interface keeps working: it simply offers no isolation and no diagnostics. A package that is neither says so, instead of failing later in a way nobody can read.

- 5546eb0: Add `--exclude-tags` to `pikku scenario run`.

  `--tags` is match-any with no negation, so a suite could not express "run
  everything except the live-model scenarios" — the shape any project needs once
  one cluster of its scenarios requires a real API key or a browser. Tags listed
  in `--exclude-tags` disqualify a scenario after every other selector has run,
  except when the scenario is named directly with `--flows`, which stays the
  explicit override.

- 5962e51: Add `pikkuFeature`, a grouping primitive for scenarios.

  A feature groups scenarios the way gherkin's `Feature:` groups `Scenario:`, and gets `Examples:` for free as an ordinary loop:

  ```ts
  export const credentialFeature = pikkuFeature({
    name: 'Credential API',
    tags: ['credential'],
    before: startsMockOAuthServer,
    after: stopsMockOAuthServer,
    scenarios: [
      credentialLazyLoadScenario,
      ...['stripe', 'google', 'hmac-key'].map((name) => ({
        scenario: credentialRoundTripScenario,
        data: { name },
      })),
    ],
  })
  ```

  - Scenarios are referenced by **imported identifier**, not by string name, so a renamed or deleted scenario is a compile error rather than a silent skip. A `{ scenario, data }` entry's `data` is typed against that scenario's own input.
  - Feature hooks run **once around the whole group** (`before → a → b → c → after`), not per scenario, and `after` runs in a `finally`. Per-scenario setup stays the scenario's own `before`; gherkin's `Background:` is deliberately not expressible.
  - A scenario's effective tags are its own plus its feature's, so `--tags credential` selects through the feature.
  - New `--features` selector on `pikku scenario run`, and `pikku scenario list` now prints features with their scenarios indented. Every filter narrows the same plan, so narrowing a feature to two of its five scenarios still runs its hooks exactly once around those two.
  - The **feature is the run unit**: `--flows` on a scenario whose every feature entry carries `data` errors and names the features containing it, because the feature is what supplies that data. A scenario referenced bare anywhere, or in no feature at all, still runs standalone.

  `pikkuFeature` infers its scenario list with a `const` generic, so `CoreFeature['scenarios']` is `readonly` — otherwise the emitted `addFeature(id, feature)` call does not typecheck.

  Membership is resolved at runtime by object identity — `pikkuScenario` returns its config verbatim, so a feature holds the very object that was registered. That is what lets the scenario list be built by a loop, which no static analysis could enumerate. It also means a scenario constructed inline inside a feature is never registered, and is reported as unresolved rather than silently running as something else.

- aae6b05: Generate a `pikkuScenarioHook` factory alongside `pikkuScenario`. A hook is
  never registered, so it had only a type — which left it the one scenario
  primitive that could not be written inline without a type annotation, since
  there was no call site for TypeScript to infer the services, input and wire
  from. The factory returns its argument verbatim and exists purely to provide
  that call site.
- 5962e51: Add `before` / `after` hooks to `pikkuScenario`, and make an unextractable scenario a hard error.

  A scenario config now takes `before` and `after`. Both have the same signature as `func` — `(services, data, wire)` — with the return value discarded, so there is no new type to learn and a hook reaches the app the same way the body does, through `wire.actors`:

  ```ts
  export const credentialScenario = pikkuScenario({
    title: 'A credential is loaded on first use',
    tags: ['scenario', 'credential'],
    before: resetsCredentials,
    after: removesInstalledAddon,
    func: async (services, data, { scenario, actors }) => { ... },
  })
  ```

  - `before` throwing skips the body and fails the run, but `after` still runs.
  - `after` always runs, in a `finally`. Throwing fails a run that would otherwise have passed; on an already-failed run it attaches as the `cause` and never replaces the original error.
  - Neither runs when the run is suspended or waiting — teardown only fires at a terminal outcome.
  - Hooks are not ladder rows: the runner records nothing for them, and a failure is labelled by phase via the new `ScenarioHookError`.
  - Hooks are scenario-only. A `before`/`after` on a `pikkuWorkflowFunc` never runs — a workflow is durable and resumable, so a callback that reran on every replay would have no honest meaning.

  Two fixes that scenarios needed to be safe to write:
  - A closure in a complex-workflow or scenario body is no longer held to the DSL statement whitelist. A single `try`/`catch` inside any callback previously failed extraction, and the fallback path understands `do`/`sleep` but not `step`/`given`/`when`/`then` — so the scenario registered with **zero steps** and passed vacuously, with no diagnostic. Plain DSL workflows still descend into callbacks, which is what validates fanout bodies.
  - New `PKU679`: a scenario that fails DSL extraction is now a critical error and refuses to register, instead of silently registering empty. A scenario that declares no input parameter at all is legitimate and still extracts.

- a436645: Redesign the console's scenarios screen as living documentation of a project's BDD features.

  The inspector now statically extracts `pikkuFeature` declarations — name, description, tags, the scenarios each one groups (including `{ scenario, data }` examples), and whether it declares `before`/`after` — and the CLI writes them to `<outDir>/scenarios/features.gen.json`, which `MetaService.getFeaturesMeta()` reads and the console addon returns from `getAllMeta`.

  The scenarios page reads that back as a document: features on the left, and on the right the selected feature's scenarios, each rendered as the given/when/then ladder of prose its author actually wrote, with repeats shown as `for each x in xs`, `Examples:` tables for parameterised entries, skip reasons stated rather than hidden, and each scenario's cast of personas inline. The Flows/Personas segmented control is gone; tags filter the document the same way `pikku scenario run --tags` filters a run.

- 46cf63e: Scenario personas — the KIND of person, separate from the body that signs in

  `scenarios.actors` conflated two things: who a kind of person is, and which
  synthetic user a step runs as. That works until a scenario needs two of the same
  kind — tenant isolation, peer sharing, a member hitting another member's row —
  at which point the registry grows two near-identical entries and neither says
  they are the same kind of person.

  `scenarios.personas` now declares the kinds:

  ```json
  "scenarios": {
    "personas": {
      "owner": { "description": "Owns their own entries", "primary": true },
      "viewer": { "description": "Someone the owner shares with", "proficiency": "casual" },
      "reminders": { "description": "The app sending reminders", "kind": "system" }
    }
  }
  ```

  A persona carries only what is true of that kind of person for the app's whole
  lifetime — `description`, `primary` (whose experience the product is), `kind`
  (`person` or `system`), `proficiency` (`casual` or `power`). What someone is
  trying to get done, and the circumstances they are doing it in, belong to the
  scenario, not to them.

  Actors are materialised from personas, so the common case — one body per kind —
  needs no `actors` block at all. Declare an actor by hand only for a second body
  of one persona:

  ```json
  "actors": { "ownerB": { "persona": "owner", "email": "owner-b@actors.local" } }
  ```

  A `system` persona mints no actor: there is nobody to sign in.

  Resolution is shared by codegen and `pikku scenario run` (previously three
  independent reads of `config.scenarios.actors`), so the generated
  `scenarioActorConfigs` — and therefore the `ScenarioActorName` union that types
  `wire.scenarioStep.actor` — always matches the registry a run builds. Two actors
  sharing an email is now an error rather than a silently-shared user row, which
  is exactly the bug a second body exists to catch.

  Fully backwards compatible: an actor with no `persona` resolves as its own
  implicit persona, and a project with no `personas` block is untouched.

  Because "persona" now names a config entity, actor-flow no longer uses it for
  "the actor config the LLM plays": `RunConversationParams.persona`/`personaName`
  are now `actor`/`actorName`, and the exported `PersonaLLM` type is `ActorLLM`.
  The `'in-persona'` approval policy value is unchanged — it is the English idiom
  ("stay in character"), not a reference to a declared persona.

- 2c2343e: Stop `pikku scenario run --tags` from narrowing the project it is about to run.

  `--tags` selects which scenarios to run, but it was also being read as the
  inspector's tag filter, which selects which code to generate. A run tagged
  `console` therefore lost every step function that was not itself tagged
  `console`, so no browser steps were found, no browser provider registered, and
  every browser scenario failed. `getInspectorState` gains an `unfiltered`
  argument for commands that run the project rather than generate from it, and
  `scenario list` / `scenario run` pass it.

- 1c841d8: Move the scenario engine off `PikkuWorkflowService` onto a `PikkuScenarioService` the runner constructs, so no production bundle carries it.

  Scenario support was built as members of `PikkuWorkflowService` — the class every Pikku server instantiates. A bundler drops an unused _module_, never an unused class _member_, so every deployed app was shipping the step runner, the lifecycle-hook runner, the actor registry, the browser-provider hooks and the `expectEventually`/`expectError`/`expectService` assertion wire, whether or not it had a single scenario. `resolveScenarioActors` pulled the HTTP actor client — and the AI persona conversation loop behind it — in with them.

  All of it now lives in `PikkuScenarioService`, exported from a new `@pikku/core/scenario` entry point and reached only by `pikku scenario run`:

  ```ts
  import { createScenarioRunner } from '@pikku/core/scenario'

  const { workflowService, scenarioService } = createScenarioRunner()
  ```

  Measured with esbuild against `InMemoryWorkflowService`: the production bundle drops 35 KB and every `sign-in/actor`, `runConversation`, `expectEventually` and `ScenarioHookError` occurrence, along with the scheduler runner that `wire.runScheduledTask` pulled in. The one remaining `scenarioStep` reference in a production bundle is the RPC guard that refuses to expose a step over `/rpc` — a security check, not scenario machinery.

  `PikkuScenarioService` is **not** a workflow service. A scenario is not a different kind of run — it is the same durable run with a step vocabulary on top — so it is installed onto one rather than subclassing it. `PikkuWorkflowService` gains a single `setRunExtension(create)` slot, and calls the installed `WorkflowRunExtension` at six points: `attachRunContext`, `detachRunContext`, `decorateRunWire`, `decorateWorkflowWire`, `onBeforeRunFunc`, `onAfterRunFunc`. Nothing on that interface names scenarios.

  The extension is built from a `WorkflowRunEngine` handle the service hands it — `inlineStep`, `updateRunStatus`, `onChildWorkflowFailed`, `verifyStepName` — which is what lets a scenario record a durable step without any of those becoming public API on the service every production app instantiates.

  ```ts
  const workflowService = new InMemoryWorkflowService()
  const scenarioService = workflowService.setRunExtension(
    (engine) => new PikkuScenarioService(engine)
  )
  ```

  `{ actor }` on a workflow step is deliberately **not** part of the move: `scenario.do(name, rpc, data, { actor })` dispatches through the base wire's `do`, so the actor branch stays in `rpcStep`.

  **Behaviour change:** a scenario started on a _server_ rather than through the runner (the console can start any registered workflow by name) no longer resolves actors or runs `before`/`after` hooks — a server's workflow service is not a scenario service. Run scenarios with `pikku scenario run`.

- 47478a4: Let a scenario declare why it is held out of a default run.

  `pikkuScenario({ skip: 'why' })` keeps the scenario in the plan and reports it as `SKIP <name> (<reason>)` on the ladder, instead of the alternatives available until now: deleting it, commenting it out, or leaving it red. Naming it directly with `--flows` clears the quarantine and runs it; selecting the feature it belongs to does not, because a feature is a group and running the group should not silently drag a quarantined member in.

  The run report's `skipped` list now carries a reason per scenario rather than assuming `--no-browser`, so a browser scenario held back on a machine with no browser reads differently from one the project quarantined itself.

  `@pikku/console` gains a test id on the addon detail page's Setup tab, which was previously only reachable through its translated label.

- 195fbd9: `pikku scenario run --spawn` starts the server for the run, and the server now says when it is ready.

  Running scenarios meant having a server on the environment's `apiUrl` already, so every project had to write its own spawn-wait-kill script. `--spawn` starts `pikku dev` on that URL, waits for it, runs, and kills the process group afterwards; `--keep-alive` leaves it up for a dev loop. Without `--spawn` nothing changes — the environment must already be serving.

  ```bash
  pikku scenario run local --spawn --no-browser
  ```

  The waiting half needed a signal that did not exist. Both `dev` and `serve` do:

  ```ts
  await pikkuServer.start() // logs `listening on …`
  await lifecycle?.afterStart?.(services)
  ```

  so the `listening on …` line is printed while the project's `afterStart` is still running — anything seeded there (users, roles, fixtures) is still pending when a parent process sees it. Both commands now log **`pikku: ready on http://host:port`** once `afterStart` resolves, and that is what `--spawn` waits for. Projects that were polling an application endpoint to guess at this can stop: readiness is no longer something each app has to define.

  A run refuses to start if something is already listening on the target port. A readiness check cannot tell your server from someone else's — both answer on the same address — so a stale server would otherwise silently absorb the run and report failures belonging to code nobody is looking at.

  `@pikku/cli` gains two subpath exports, `./server/spawn-dev-server` and `./server/server-ready`, for test runners that need to do this themselves rather than through `scenario run`.

- 5962e51: Add `template` to `pikkuScenarioStep`, so a step's reported prose names the values it was called with.

  `description` documents what a step does, for the console and for whoever reads the source. `template` is what a reader of the report sees, with `{placeholders}` filled from the input the step was actually called with:

  ```ts
  export const seesAddonCard = pikkuScenarioStep<
    { packageName: string; state?: 'installed' | 'available' },
    { visible: true },
    true
  >({
    name: 'seesAddonCard',
    description: 'sees an addon in the gallery',
    template: 'sees {state} addon {packageName}',
    browser: true,
    func: async (_services, { packageName, state }, { browser }) => { … },
  })
  ```

  ```
  Then  the admin sees at least 10 addons on offer          ✓  3ms
  When  the admin searches for stripe                       ✓  10ms
  Then  the admin sees available addon @pikku/addon-stripe  ✓  77ms
  ```

  Previously the only way to get that was a `description` at every call site, which meant writing the sentence once per call rather than once per step — and a call site that forgot it reported the same sentence three times in a row.
  - A placeholder with no recorded value renders as nothing and the surrounding whitespace collapses, so an omitted optional input reads as a shorter sentence rather than leaking a literal `{state}` into the report. Type placeholder values so they read as words (`state?: 'installed' | 'available'`, not `installed?: boolean`).
  - A call-site `description` still wins, the same way it already won over the step's `description`.
  - `renderStepTemplate` is exported from `@pikku/core/workflow` alongside `composeStepProse`, so the CLI reporter and the console render identically.

  Scenario steps now record their input on the run (`inlineStep` persisted `null` for every inline step, so there was nothing for a reporter to interpolate). This is what `getRunSteps` already exposes as `data` for RPC steps.

  A step called from a loop gets its template too. Its durable name is built at runtime (`sees @pikku/addon-todos`) from a declaration the static meta records verbatim (`sees ${packageName}`), so the two can never match by name — it used to fall back to the bare name, with no keyword, actor or template:

  ```
          sees @pikku/addon-console                              ✓  85ms
  Then    the admin sees installed addon @pikku/addon-console    ✓  92ms
  ```

  The join is by **step function**. A scenario step is dispatched by name exactly as an RPC is, so it now records that name in the run's existing `rpcName` slot — no new field, no schema change in any workflow store. Nothing dispatches off that value anywhere; step identity always comes from the code being replayed.

  To keep the slot honest, a scenario step is now its own **kind of RPC**, alongside public / private / remote: `FunctionMeta.scenarioStep` marks it, and `rpcExposed` refuses it even if something marks it `expose: true`. Steps were already left out of the RPC registry; this makes "never network-callable" a property the runtime enforces rather than one the registration path happens to produce.

  `collectScenarioStepProse` now returns `{ byStepName, byStepFunc }` rather than a bare `Map`, and `buildStepLadder` takes that. The step name still wins; the function index only decides steps recorded under a name no declaration carries, and a function called from several sites that disagree on their prose is left out rather than guessed at.

- 5962e51: Add `pikkuScenarioStep` — named, typed scenario steps whose body is an ordinary pikku function.

  A scenario step is referenced by typed string name, the same way `workflow.do` references an RPC, and is checked against a generated `FlattenedScenarioStepMap`:

  ```ts
  export const buysAnApple = pikkuScenarioStep({
    name: 'buysAnApple',
    description: 'buys an apple',
    func: async (services, data: { qty: number }) => { ... },
  })

  await scenario.given('buys an apple', 'buysAnApple', { qty: 1 }, { actor: actors.shopper })
  // renders: Given the shopper buys an apple
  ```

  - `given`/`when`/`then` are sugar over `step`, setting only the prose prefix. The runner renders a step ladder from the recorded run.
  - Steps default to `retries: 0` — a failed assertion is not retried.
  - Steps are deliberately **not** registered as RPCs, so a browser-driving step is never network-callable.
  - `browser: true` steps receive a browser handle on the wire. `@pikku/playwright` is a new package providing the Playwright-backed provider, signing each actor's browser context in through the same actor path the HTTP actors use. Without a provider, `pikku scenario run --no-browser` **skips** browser scenarios instead of failing them.
  - New diagnostics: PKU677 (a `browser: true` step called without an actor) and PKU678 (a step target that is not a static string literal).
  - Fixes `--no-<flag>` boolean negation in the CLI command parser, which previously parsed as an unknown option.
  - Fixes PKU673 (a scenario func destructuring services), which never fired because it ran before function meta existed; it now runs in post-processing.
  - Fixes scenario/workflow steps nested in `for...of` and `Promise.all` being dropped from workflow meta.

- 61b9bf8: Type a scenario actor's `invoke` over the project's exposed RPC map, and give a step the environment it targets.

  `ScenarioActor` is now generic in the RPC surface it can reach, and the generated `pikku-scenario-actors.gen.ts` binds it to `FlattenedRPCMap` — exactly the `/rpc/:name` surface an HTTP actor can reach. An unknown RPC name or a payload of the wrong shape is a compile error rather than a 400 mid-run, and the result is narrowed instead of `unknown`:

  ```ts
  const listed = await actor.invoke('todos:listTodos', { limit: 5 })
  const todos: string[] = listed.todos
  ```

  `wire.scenarioStep.actor` stops being `any`: `PikkuWire` takes the project's actor registry as a type argument, threaded through the generated function types. The actors file is now written even for an empty registry, so `TypedScenarioActors` is always a resolvable import.

  Alongside it:
  - **`invokeRaw(rpcName, data, { headers })`** on `ScenarioActor`, reporting `{ status, ok, body }` rather than throwing. A refusal is the expected outcome of a permissions or scopes scenario, and `invoke`'s error truncates the body naming which scope was missing. `invoke` is now `invokeRaw` plus a throw on `!ok`. The `headers` option is how a step expresses an identity the actor registry cannot.
  - **`scenarioStep.env`** — `{ apiUrl, appUrl? }`, from `scenarios.environments[<environment>]`. Steps run in the CLI process, where there is no `variables` service, so without this every raw-HTTP step would reach for `process.env`. A run started on a server falls back to its own `API_URL`/`APP_URL`.
  - **`requireActor(scenarioStep)` and `requireScenarioEnv(scenarioStep)`** exported from `@pikku/core/workflow`, replacing the hand-rolled `actorOf(...)` guard each step file was writing. Both name the step and say what to pass.

- 45281a3: Escape workflow and graph node names in the generated workflow type maps

  A scenario step name is free-form prose, so an apostrophe in it is ordinary —
  and interpolated into a single-quoted key it terminated the string and left the
  whole `pikku-workflow-map.gen.d.ts` unparseable. Both map serializers now emit
  the key through `JSON.stringify`.

- Updated dependencies [539ee0b]
- Updated dependencies [04b8607]
- Updated dependencies [7c8f015]
- Updated dependencies [5962e51]
- Updated dependencies [2f88989]
- Updated dependencies [a1a6816]
- Updated dependencies [dc3e11e]
- Updated dependencies [24da616]
- Updated dependencies [04bfe3f]
- Updated dependencies [5962e51]
- Updated dependencies [5962e51]
- Updated dependencies [cd6453c]
- Updated dependencies [a436645]
- Updated dependencies [46cf63e]
- Updated dependencies [9e666bc]
- Updated dependencies [1c841d8]
- Updated dependencies [47478a4]
- Updated dependencies [9e666bc]
- Updated dependencies [2434f1b]
- Updated dependencies [5962e51]
- Updated dependencies [5962e51]
- Updated dependencies [61b9bf8]
  - @pikku/core@0.12.70
  - @pikku/playwright@0.12.70
  - @pikku/inspector@0.12.48

## 0.12.90

### Patch Changes

- fc63c2a: `fabric validate` now type-checks every deployable frontend, the same compile the
  build container runs before it will deploy, so a type error fails locally in
  seconds instead of minutes into a deploy. Pass `--skip-typecheck` for the
  structural checks alone.

  Declared frontends are shape-checked before they are used, so a malformed
  `frontends` entry is reported as a finding instead of throwing part-way through
  validation, and a deployable frontend whose directory does not exist is an error
  even in a project with no `apps/` directory.

  Also fixes `fabric link` / `fabric init` clobbering `pikkufabric.config.json`:
  they wrote a fresh `{ projectId }` object, silently deleting `frontends`,
  `production` and `apiUrl`. Losing `frontends` means the build container deploys
  no frontend at all, long after the link that caused it. The config is now merged,
  and a config that cannot be read at all is left alone rather than overwritten.

- 91077ff: Add `pikku db check` — report how the configured database differs from the schema its migrations define.

  Answers the question nobody can otherwise answer without going and looking by hand: does this database still match what we wrote down? It applies the migrations to a throwaway database (the same scratch mechanism `db codegen` uses) and diffs that against the real one.

  The two halves are deliberately asymmetric. Missing tables and columns mean the database is behind — the fix only ever adds, so the command fails and tells you to run `db migrate`. Tables the migrations never mention are reported but never fail and never dropped: something created them outside the migration history, and no migration can know whether they hold data worth keeping.

  Comparison is on the fully-qualified name, so a second copy of a table in the wrong schema (`public.orders` shadowing `app.orders` — what a runtime that forgot to qualify its DDL leaves behind) is reported rather than mistaken for the table the migrations created.

- 91077ff: `pikku db check` now tells a table the pikku runtime created apart from one nobody can explain.

  `db check` reports tables in the database that no migration creates. Until now every table a `@pikku/kysely` service bootstrapped at boot landed in that bucket, alongside genuine leftovers — which is noise, and the wrong conclusion, because for those the remedy is known.

  The runtime's declaration (`pikkuSchemas`, new in `@pikku/kysely`) is now used to recognise them, and they are reported separately with the fix: `pikku db generate` writes them down so the schema stops depending on which services happened to start.

  Recognising, not requiring — absence of a runtime table is not a finding. A project that never constructs the workflow or AI services is not missing their tables.

  The runtime declaration names Better Auth as a prerequisite, so `db check` applies the project's auth schema into the same scratch database before materializing it. A project that configures no auth is not an error: the schemas that needed it are left out and reported, so an unexplained table is never silently the one that could not be recognised.

  Run against a real project this correctly attributed nine tables: four workflow tables in `app`, and five AI tables that a `pikku dev`/`pikku serve` connection had created unqualified in `public`, shadowing the `app` ones its migrations own.

  ## `db generate` writes down every schema, not just Better Auth's

  `db generate` used to know about one source. It now walks a registry — Better Auth, the pikku runtime declaration, then each wired addon — and writes one migration per source, numbered in dependency order so they can be reviewed and applied independently.

  Three cases per source, and the difference matters. Fully covered is nothing to do. Nothing covered writes the source's own SQL verbatim, which is the one case where the source knows better than any diff: it carries the indexes, constraints and ordering a table-and-column comparison cannot see. Partially covered writes the delta, because re-emitting a whole schema would fail on the tables that already exist.

  The delta is real DDL, not a report. New tables come out as `CREATE TABLE` with a `REVIEW:` note that a column list carries no indexes or foreign keys; new columns come out as `ALTER TABLE … ADD COLUMN`. A column that is `NOT NULL` with no default gets the statement _and_ the problem written above it — it cannot be applied to a table with rows, and what those rows should get is not a generator's decision. Those columns are also listed back to the caller, so the command warns about them by name.

  ## `pikku db baseline`

  Records the pending migrations as applied, without running them. For the database that already contains what they describe — the shape you get when a runtime created its tables at boot and the migration writing them down was authored afterwards. Applying that migration fails on every existing deployment; leaving it pending forever means the history never catches up with reality.

  A separate command rather than a `--baseline` flag on `migrate`, deliberately: a flag pasted into a deploy script would silently stop applying migrations forever.

  It refuses unless the database really is up to date, since that is the entire premise. A database that is behind gets the report `db check` would have given it, because recording migrations that never ran would bury a real gap under a history claiming everything is applied.

  ## Addons can ship a schema — `pikku db export`

  An addon has no database of its own. It runs inside the consumer, against the consumer's, so it must never create tables at boot and must never name a schema.

  `pikku db export` runs in the addon's build and publishes what it needs to `.pikku/db/pikku-db-meta.gen.json` — one more channel beside `.pikku/function` and `.pikku/scopes`, resolved by package name. It materializes the addon's own `db/sqlite` and `db/postgres` migrations into a throwaway database and introspects them, so the artifact answers both "what must exist" and "what creates it" without a second description that drifts. Every dialect the package has migrations for is exported, since an addon is published once and consumed by projects on either engine.

  On the other side, `db generate` folds each wired addon's schema into the consumer's own migration history, where the project reviews it like anything else. A `wireRemoteAddon` addon contributes nothing — it runs on another host, against that host's database. An addon that publishes a schema for a dialect the consumer does not use is reported rather than skipped quietly: its services would fail at runtime.

  ## A project with no migrations directory no longer crashes

  `db generate`, `db check` and `db migrate` read the migrations on disk to work out what is already covered, and threw `ENOENT` when there was no `db/<dialect>` directory to read. That is the first run on a new project — the exact case `db generate` exists to serve. A directory that does not exist means no migrations, which is an answer, not a failure.

  ## The migration tracking table is no longer part of a postgres schema

  `sql_migrations` is the migrator's own bookkeeping and belongs to nobody's schema. The SQLite introspector had always hidden it; the postgres one reported it like any other table, and the two dialects disagreeing had consequences beyond a stray row in a listing.

  An addon exported from a migrated postgres database published `sql_migrations` as one of its own tables. The consumer has that table too, so `db generate` read the addon as _partially_ covered and wrote column deltas instead of the addon's own SQL — silently dropping its primary keys, indexes and constraints. The addon's tables were created, and created wrong.

  Both introspectors now hide it, and both migrators and both introspectors name it from one constant, so the two dialects cannot drift apart again. A postgres project regenerating its types with `pikku db codegen` loses the `SqlMigrations` interface it should never have had — SQLite projects never had one.

- 91077ff: Add `pikku db codegen` — regenerate the database types from the migration files without connecting to a database.

  `pikku db migrate` can only emit types after migrating the configured database, which forces codegen to run late: on a deploy that means the schema has already moved by the time anything is generated, so a build step that needs the table zod (a function schema built from `#pikku/db/zod.gen.js`) cannot run before it. `db codegen` applies the same migrations to a throwaway database — `:memory:` for SQLite, embedded PGlite for Postgres — and introspects that, so `pikku all` can be handed an accurate schema on a machine with no database reachable.

  The generated types describe what the migrations define, which is the contract. Introspecting a live database additionally picks up whatever has drifted into it — tables a runtime bootstrapped at boot, leftovers from a reverted branch — so the two can differ; that difference is the point.

- Updated dependencies [91077ff]
- Updated dependencies [91077ff]
  - @pikku/inspector@0.12.47
  - @pikku/kysely@0.13.4

## 0.12.89

### Patch Changes

- edff232: Make the CLI work when it runs on bun, not just node.

  Projects invoke it as `bunx --bun pikku …` so it inherits bun's `node:sqlite`
  (node only ships that unflagged from 24). Under `--bun` the process is bun, where
  `process.loadEnvFile` does not exist — so `.env` silently failed to load with
  `Could not read .env: process.loadEnvFile is not a function`, and every secret in
  it was lost. Parse the file directly when that method is missing.

  Also turn the bare `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module:
node:sqlite` into a message that names the cause (Node too old) and the two ways
  out (upgrade Node, or run on bun).

## 0.12.88

### Patch Changes

- 24252b8: Emit queue meta for workflow-only projects, so per-workflow orchestrator queues actually work.

  Workflows synthesise their own `wf-orchestrator-*` / `wf-step-*` queue meta during
  post-processing, and those entries have no declaring source file. The queue codegen
  bailed early on `queueWorkers.files.size === 0`, so a project that uses workflows but
  hand-declares no `wireQueueWorker` wrote no queue meta at all — and the generated
  bootstrap therefore never imported it.

  With `queue.meta` empty at runtime, `getOrchestratorQueueName()` never found a
  per-workflow queue and every workflow silently fell back to the single shared
  `pikku-workflow-orchestrator` queue. Nothing failed, but the isolation was gone: one
  long-running workflow step head-of-line-blocked every other workflow queued behind it.

  The codegen now gates on the meta alone. `@pikku/core` additionally warns at wiring
  time when workflows are registered but no per-workflow orchestrator queue is present,
  so this degradation can't recur silently.

- Updated dependencies [24252b8]
- Updated dependencies [e3d4454]
  - @pikku/core@0.12.69
  - @pikku/kysely@0.13.3

## 0.12.87

### Patch Changes

- 6f3cdae: Treat a `__PROJECT_ID__` placeholder as unlinked, so `fabric init` works on a fresh scaffold; report a missing `--branch` instead of "local branch undefined does not exist"; keep the git error when a deploy branch cannot be resolved.
- c1a4ed3: Load `.env` from the working directory before running any command.

  `LocalSecretService` reads `process.env` and nothing else, so a project keeping
  `BETTER_AUTH_SECRET` in `.env` got `Requested secret not found` on its first
  sign-up — an error that names no key and points at no file. This could not be
  left to the package manager: the CLI has a node shebang, so `bunx pikku dev`
  execs node and bun's own `.env` injection never reaches the process.

  Real environment variables still win over the file.

- Updated dependencies [f11675f]
- Updated dependencies [2a7d9b0]
- Updated dependencies [a8f9a7d]
- Updated dependencies [eaabcbf]
  - @pikku/core@0.12.68
  - @pikku/n8n-import@0.0.3
  - @pikku/inspector@0.12.46

## 0.12.86

### Patch Changes

- ae4f59a: Gate admin capabilities on scopes, and scaffold user management

  Admin capabilities were gated on `user.role === 'admin'` — a single text column
  meaning "can do everything". Impersonating a user, rebinding a shared
  credential and reading the user directory are distinct capabilities that one
  user can hold independently, so they are now scopes on an `admin` tree:

  | Gate                                   | Scope                    |
  | -------------------------------------- | ------------------------ |
  | impersonation                          | `admin:impersonate`      |
  | `credentialOAuth`'s `canLinkSingleton` | `admin:credentials:link` |
  | reading the user directory             | `admin:users:list`       |
  | creating a user out of band            | `admin:users:create`     |
  | ban / unban                            | `admin:users:ban`        |
  | delete a user                          | `admin:users:remove`     |
  | revoke a user's sessions               | `admin:users:sessions`   |
  | set a user's password                  | `admin:users:password`   |

  Holding the bare `admin` scope satisfies all of them via pikku's existing
  parent-grant rule, so it is a one-for-one replacement for the old role.

  better-auth's `admin()` plugin is still what implements ban, delete,
  session-revocation and set-password, so it stays. Its `user.role` column is no
  longer something pikku grants: it is _projected_ from the scope store when a
  session is built, and only from the scopes whose capability better-auth's own
  endpoints gate on the caller's role. Someone granted `admin:users:list` can read
  the directory — which goes straight to the auth adapter — without gaining the
  power to ban, and revoking a scope demotes the role on the next sign-in. Scopes
  remain the single source of truth.

  New `scaffold.userAdmin` in `pikku.config.json` generates the whole set —
  `pikkuAdminListUsers`, `pikkuAdminCreateUser`, `pikkuAdminSetUserBanned`,
  `pikkuAdminRemoveUser`, `pikkuAdminRevokeUserSessions` and
  `pikkuAdminSetUserPassword` — into your project. Listing or banning a user is
  ordinary application behaviour and must not require installing the console.
  Codegen fails with an actionable error if better-auth is wired without
  `admin()`. The console's Users page calls these same functions, showing each
  action only where the caller holds its scope.

  Every scaffold now emits a directory named for its domain — `scaffold/admin/`,
  `scaffold/rpc/`, `scaffold/agent/`, `scaffold/auth/`, `scaffold/console/`,
  `scaffold/graph/`, `scaffold/realtime/`, `scaffold/scenarios/`,
  `scaffold/webhook/`, `scaffold/workflow/` — holding its wiring file beside a
  `*.schemas.gen.ts` sibling, and every generated payload is a zod schema instead
  of a TypeScript generic. The schemas have to stand alone: the inspector reads a
  zod schema by importing the module that declares it, which it cannot do for a
  wiring file whose relative pikku-types import per-unit deploy codegen rewrites.

  Resolving a schema by reference rather than by name also fixes the agent HTTP
  surface. `agentCaller` and `agentStreamCaller` take the same payload but had to
  repeat the type literal verbatim in each generic position, because the extractor
  synthesised the schema name from the _function_ name and so recorded an
  `inputSchemaName` with no schema behind it whenever the two shared a named
  alias — every agent call through that alias failed with `MissingSchemaError`.
  One `AgentCall` schema now backs both.

  Where a payload's shape belongs to `@pikku/core` (`WorkflowRunStatus`,
  `FunctionCoverageReport`, `StubCall[]`) the generated function carries no
  `output` schema and the inspector infers it from the handler's return type;
  re-declaring a core type in zod would be a second definition free to drift.

  Upgrading rewrites the layout in place: codegen prunes the pre-directory copy of
  each scaffold file before it inspects the source tree, since the old flat file
  still wires the same routes and leaving it behind would wire everything twice.

  `@pikku/core` gains `hasScopes(required, held)`, the non-throwing counterpart to
  `verifyScopes`, and declares `auth` on `CoreSingletonServices` — the auth
  instance the generated `pikkuServices` wrapper already injected but never typed.
  A scope root declared twice (an addon and its host both contributing the same
  `admin` tree) now flattens to one entry per id instead of emitting it twice.

  BREAKING: there is no role fallback for the scope-gated capabilities. An app
  that relied on the old default must register a `ScopeService` and grant `admin`
  (or a narrower `admin:*` scope). Every gate fails closed and warns when no
  `ScopeService` is registered. `delegatedAuth`'s `defaultRole`/`mapRole` now
  grant a pikku role through the `ScopeService` instead of writing better-auth's
  `role` column, and the `credentialOAuth` platform user no longer sets `banned`.

  BREAKING: the console reads its user directory over the scaffolded
  `pikkuAdminListUsers` RPC (gated on `admin:users:list`, backed by better-auth's
  `$context.adapter`) instead of `client.admin.listUsers`, and
  `UsersTableUser`/`UsersTableLabels` no longer carry `role` — there is no role
  column to render. `@pikku/addon-console` no longer ships a `console:listUsers`
  function: user management is not the console's job, so a host that wants the
  Users page must enable `scaffold.userAdmin`.

- 004f076: Remove generated schema files that are no longer required

  `saveSchemas` rewrites `register.gen.ts` from scratch on every run, so a schema that
  is no longer required stops being registered — but its `<Name>.schema.json` stayed on
  disk indefinitely. That orphan is not inert: it is the artifact tooling reads to answer
  "what does the server validate against?", and it answers with the shape the function had
  at some earlier point. Anything trusting it concludes the schema is correct while the
  running server disagrees, which presents as an unfixable "stale server" that no
  regeneration or restart resolves.

  The schemas directory is now kept in step with `register.gen.ts`: if a schema is not
  imported there, its file is deleted.

- da99ab6: Stop the frontend skills teaching a localhost server URL, and cover TanStack Start

  `pikku-react`, `pikku-react-query` and `pikku-realtime` all showed
  `serverUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000'`.
  `import.meta.env` is a _build-time_ substitution, so any deploy that supplies the
  API URL as a runtime env var or platform binding leaves it `undefined` in the
  shipped bundle — the fallback is then the only branch that ever runs in the
  browser, and every request from the deployed app goes to the developer's own
  machine. It works locally and fails the moment it is deployed.

  The three skills now resolve through one shared `apiUrl()` helper that falls back
  to same-origin `${window.location.origin}/api`, which needs no build-time
  knowledge of the domain and is correct wherever the app is served from.
  `pikku-react` documents the helper and why the localhost fallback is banned.

  `pikku-react-query` also gains a TanStack Start section: the `import.meta.env.SSR`
  branch, building auth clients lazily (Better Auth validates its baseURL with
  `new URL()` at construction, so a module-scope client crashes SSR), the `/auth`
  suffix that Better Auth needs when the base already carries a path, and the
  `pikku tanstack-start` shim.

  Finally, `pikku-better-auth`, `pikku-emails`, `pikku-addon`, `pikku-ai-vercel`,
  `pikku-ai-agent` and `pikku-template-clone` are tagged `installGroups: [core]`.
  They were in no group at all, so `pikku skills install --core` left an agent with
  no guidance on auth, email, addons or the post-clone cleanup — all of which the
  starter template ships with.

- 4bcf8d5: Add the pikku-fabric-debug skill

  `pikku-fabric` covers project layout, database, deploy provider and config, and
  stops at deploy. Nothing covered debugging a stage that is already live, so an
  agent facing a broken deployment had no supported path and would reach for
  whatever it could improvise.

  The new skill documents the actual loop over the existing commands —
  `errors` (filtered, carries the traceId) → `trace <traceId>` (the whole request
  across the stage, in order, with per-event durations) → `metrics` (is this one
  request or the whole stage) → `logs` → `status` (is the running gitSha the one
  you think it is).

  It also records two behaviours that read as app bugs but are not:
  `pikku fabric logs` accepts `--since` and `--deployment` and ignores both, and
  `--follow` is a 2-second client-side poll rather than a server stream.

- 4443361: Open the sign-in page automatically, and stop on a cancelled login

  `pikku fabric login` printed a `/cli-auth` URL and left the user to find it. The
  link now opens in the default browser automatically. It is skipped when
  `SSH_TTY` or `CI` is set, where opening a browser on the wrong machine is worse
  than not opening one, and `--no-browser` disables it. A launch failure warns and
  leaves the printed URL as the fallback rather than failing the login.

  The code is not carried in the link. Typing it is what proves the person
  authorizing the token is the person who ran the command — a URL that carries its
  own code is a one-click grant for anyone who can put it in front of a signed-in
  user. The output leads with the code and treats the URL as the destination.

  `pollCliAuth` can now return `rejected`, which the CLI reports as a cancelled
  sign-in and exits on, instead of polling until the code expires and then
  blaming the timeout.

- Updated dependencies [ae4f59a]
  - @pikku/better-auth@0.12.19
  - @pikku/inspector@0.12.45
  - @pikku/core@0.12.67

## 0.12.85

### Patch Changes

- 2dad759: Scaffold addon test apps with the workspace protocol when inside a workspace.

  `new-addon` generated a test app depending on its parent via `file:..`. Yarn's
  `file:` protocol copies the entire parent directory rather than honouring its
  `files` field, so the copy includes the parent's own `test/node_modules` —
  which already holds a copy. Every install adds another layer. In the pikku
  addons repo this reached 20 levels and ~1.4 GiB before `yarn install` failed
  outright with `ENAMETOOLONG`, and it made `yarn.lock` nondeterministic because
  the `file:` locator checksums changed as the packed contents grew.

  The generated dependency is now `workspace:*`, which symlinks the parent
  instead of copying it, so the recursion cannot occur.

  `workspace:*` only resolves inside a workspace, and `new-addon` can scaffold
  anywhere (`dir || config.scaffold?.addonDir || process.cwd()`). The protocol is
  therefore chosen by walking up from the target directory for a `package.json`
  declaring `workspaces`, falling back to `file:..` when there is none.

- 5f19016: Widen the generated agent HTTP surface, and guard attachment downloads against SSRF.

  `agentCaller` and `agentStreamCaller` declared only `message`, `threadId` and
  `resourceId` (plus `context` on the stream route), so `attachments`, `model`,
  `temperature` — all accepted by `AIAgentInput` — were unreachable over the
  shipped HTTP contract. No deployed app could send an attachment or a per-request
  model override. Both callers now share an `AgentCallerInput` type covering every
  optional field and forward each one to the RPC.

  Both callers declare that shape **inline** in the generic position rather than
  behind a shared named alias: the schema extractor only reads type literals there
  and synthesises the schema name from the function name. Behind an alias it
  records an `inputSchemaName` with no schema generated for it, and every agent
  HTTP call then fails at runtime with `MissingSchemaError`.

  Widening that surface makes caller-supplied attachment URLs reachable, which is
  an SSRF vector: the AI SDK downloads attachment URLs **server-side** whenever the
  model cannot consume them natively, using an unguarded `fetch`. A caller could
  point an attachment at the cloud metadata endpoint or another internal host and
  have the response relayed into the model's context. `VercelAIAgentRunner` now
  passes an `experimental_download` implementation backed by `safeFetch` (which
  refuses private/internal hosts and non-HTTP schemes, and re-validates every
  redirect hop) to both `streamText` and `generateText`. URLs the model supports
  natively are passed through untouched, so the provider still fetches those
  itself.

  The runner takes an optional `allowedAttachmentHosts` allowlist, carried across
  `withApiKey`. `safeFetch` is now exported from `@pikku/core/safe-fetch`.

- de9ae9b: Force `agentRunService` as a required singleton service whenever the AI agent scaffold (`config.scaffold.agent`) is enabled. The generated public-agent permission (`isThreadOwner` in `agent.gen.ts`) always destructures `agentRunService`, but that file is written to disk after `requiredServices` is computed from inspecting hand-written sources, so the inspector never saw that usage. `agentRunService` stayed in `RequiredSingletonServices` as optional, and since `CoreServices.agentRunService` is itself optional, any project generating the agent scaffold failed to type-check with `'agentRunService' is possibly 'undefined'.` in `agent.gen.ts`.
- 4324652: Scope AI agent thread reads to the calling session.

  The generated thread-management functions (`getAgentThreads`,
  `getAgentThreadMessages`, `getAgentThreadRuns`, `deleteAgentThread`) keyed purely
  off a caller-supplied `threadId` and treated `resourceId` as an optional filter,
  so omitting it enumerated every tenant's threads.
  - `listThreads` gains an `owners` **authorization constraint** (distinct from the
    `resourceId` filter): an empty array matches nothing, and it is always derived
    from the session, never from input. Implemented across the Kysely, Redis and
    MongoDB agent run services, with LIKE/regex metacharacter escaping so an owner
    id containing `_` or `%` cannot match a foreign owner.
  - The three `threadId`-keyed functions are now guarded by an `isThreadOwner`
    `pikkuPermission` rather than an in-body check. A thread that does not exist is
    denied rather than 404'd, so it is indistinguishable from one owned by someone
    else.
  - New `@pikku/core/ai-agent` helpers: `canAccessThread`, `threadOwnerConstraint`,
    `sessionPrincipals`, `isOwnedByPrincipal`.

  Services destructured by a wired function are now non-optional inside it.

  The inspector already aggregated the services used by every wired `func`,
  `permissions` and `middleware` into `RequiredSingletonServices`, but the
  generated function types defaulted their service parameter to the raw `Services`
  — so a service declared `foo?: Foo` still arrived as possibly-undefined, forcing
  `if (!foo) throw new MissingServiceError(...)` guards that could never fire.
  Generated types now expose `WiredSingletonServices` / `WiredServices`
  (`RequiredSingletonServices & Services`) and default the `RequiredServices`
  generic of functions, permissions, middleware, auth and approval-description
  helpers to them. Optionality now means only what it should: "this service may
  not be created, because nothing uses it".

- b501612: Enforce authorization consistently across `pikku*` primitives.
  - `pikkuAIAgent` now enforces `permissions` (previously accepted but never
    checked) and gains `auth` and `scopes`. Scopes are checked before permissions.
    `auth` defaults to `false`, matching `pikkuSessionlessFunc`, since agents are
    typically invoked from an already-authenticated function or from sessionless
    contexts such as crons and queue workers.
  - `pikkuWorkflowFunc` / `pikkuWorkflowComplexFunc` schema config gains `auth`
    and `scopes` alongside `permissions`.
  - `pikkuScenario` no longer accepts `auth`, `scopes`, or `permissions` —
    scenarios drive the app as actors and authorize per step.
  - `wireGateway` no longer accepts `permissions`. A gateway proxies to an agent,
    so access is governed by normal auth plus the target agent's own rules.
  - Removed the dead `permissions` field from `CoreWorkflow`, which was never read.

  Closed two paths that reached user code without authorization:
  - Gateway handlers were invoked directly, so a handler's own `auth`, `scopes`
    and `permissions` were never evaluated. Webhook, websocket and listener
    gateways now invoke the handler through the function runner. Handlers are
    sessionless by default (inbound gateway traffic is platform-authenticated by
    the adapter, not session-bearing); declare `auth: true` to require a session.
    A gateway's own `auth` field is now honoured too — it was previously ignored.
    Gateway middleware runs before the gate, so `wire.setSession()` in gateway
    middleware — the idiomatic way to map a verified platform sender to a user —
    is visible to the handler's `auth` and `scopes`.
  - Resuming a suspended agent run (`resumeAIAgentSync`, `resumeAIAgent`) checked
    run ownership but never re-ran the agent's own gate, so a scope or permission
    revoked while a run was suspended did not prevent the caller from resuming it
    and approving its pending tool calls. Both now re-run `assertAgentAuthorized`
    before any state is mutated.

- Updated dependencies [5f19016]
- Updated dependencies [78e4778]
- Updated dependencies [4324652]
- Updated dependencies [de044f8]
- Updated dependencies [cd1a811]
- Updated dependencies [19fa6f0]
- Updated dependencies [b501612]
- Updated dependencies [eb37b1e]
  - @pikku/core@0.12.66
  - @pikku/kysely@0.13.2

## 0.12.84

### Patch Changes

- 1a86d3f: Pin the bootstrap `@pikku/inspector` alongside `@pikku/cli`. Only the CLI was
  pinned, so when the inspector dropped `state.http.routePermissions` the pinned
  older CLI still read `routePermissions.size` and every bootstrap build failed.
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [1a86d3f]
- Updated dependencies [314ace3]
- Updated dependencies [3d76f51]
  - @pikku/inspector@0.12.44
  - @pikku/core@0.12.65

## 0.12.83

### Patch Changes

- c478794: Simplify authorization to be session + function based (#972). Permissions are now function-scoped only: global permissions AND together, a function's own permissions OR together, and the two are independent gates that both must pass — a broad global can no longer satisfy an admin-only function. Removed wire-, tag-, and HTTP-route-level permissions (`addTagPermission`, `addHTTPPermission`, wire-level `permissions` on HTTP/channel/MCP wirings). Tags are now organizational only. `auth` (session presence) and tag/HTTP middleware are unchanged.
- 57d2b09: `pikku new addon <name>` now scaffolds into `addon-<name>/` to mirror the `@pikku/addon-<name>` package name.
- cb079cc: A workflow-graph node's `func` can now reference a registered AI agent by name, dispatched as an agent run like sub-workflows, with `ref()` resolving the agent's output keys.
- cb079cc: `pikkuAIAgent` gains a `workflows: []` capability: a referenced workflow is exposed to the LLM as a tool that runs inline and returns its output.
- 13474a6: Generate a `ScopeId` union from `wireScope` declarations.

  `pikku all` now emits `.pikku/scopes/pikku-scopes.gen.ts` with a `ScopeId` union
  of every declared scope, plus a wildcard form for each node that has
  descendants. A project's generated `pikkuFunc` narrows `scopes` to that union,
  so an undeclared scope is a compile error with editor autocomplete:

  ```ts
  wireScope({ admin: { scopes: { invoices: { scopes: { create: {} } } } } })

  pikkuFunc({
    scopes: ['admin:invoices:create'],  // ✓ autocompleted
    func: ...,
  })

  pikkuFunc({
    scopes: ['admin:invoice:create'],   // ✗ compile error (typo)
    func: ...,
  })
  ```

  The inspector independently rejects undeclared scopes, so a cast that defeats
  the compiler is still caught at build time.

  Also fixes `getArrayPropertyValue` dropping any array behind a cast — idiomatic
  `tags: ['a'] as const` was previously invisible to the inspector and silently
  omitted from meta.

- a309848: Bundle two new `fabric`-group skills: `pikku-software-archaeology` (reverse-engineers a repo into a `.knowledge/` Product Blueprint) and `pikku-product-second-opinion` (turns that blueprint into a plain-language owner's report).
- 739c9f8: Document how to gate the console addon's privileged surface.

  The console addon (`@pikku/addon-console`) exposes privileged RPCs — credential
  read/write, on-disk source editing, package install — with no authorization of
  their own. Since tag-level permissions were removed in #972, a consuming app
  gates the entire surface with a single package-scoped global permission:
  `addGlobalPermission([checker], '@pikku/addon-console')`. Global permissions are
  resolved in the callee's package namespace, so one registration covers every
  console function at once. Apps that register none are unaffected (no globals =>
  allow). The generated console `wireAddon` no longer emits a `console:admin` tag.

- 5a2b0d5: Prune removed addons on `pikku dev` hot-reload. Deleting an addon wiring (`*.addon.ts`) regenerated `.pikku` on disk but left its `wireAddon` entry stranded in the live `pikkuState(null,'addons','packages')` map until a full restart (the reimport path is add-only), so `getInstalledAddons` kept reporting deleted addons. `reloadGeneratedMeta`'s sibling `reconcileAddonRegistry(declaredNamespaces)` now drops any addon namespace the fresh inspection no longer declares, and the dev watcher calls it with `inspectorState.rpc.wireAddonDeclarations`. Routes already reconcile (http meta is replaced wholesale + router reset); function-impl entries are intentionally left since the workflow service registers framework internals there that aren't in the generated set.
- 0de10a5: Stop `pikku dev` re-inspecting the whole project a second time per hot-reload.
  The addon-registry reconcile called `getInspectorState(true)` after codegen, but
  `runAllWithCommandState()` had already produced a fresh post-change inspection —
  the forced refresh only re-ran because codegen's file writes bumped the ts-write
  generation, making the warm cache look stale. Reuse that inspection with a plain
  `getInspectorState()`; the reconcile still sees the current declaration set and
  addon add/delete pruning is unchanged. Cuts reload time ~35% on the e2e fixture.
- 13474a6: feat: propagate an addon's declared scopes to the host

  An addon can now declare scopes with `wireScope`, and a host that wires it picks
  them up: they merge into the host's `ScopeId` union and its declared set, so a
  host function can require an addon scope and the `pikku_scopes` foreign key
  accepts granting one. This mirrors how addon secrets and variables are loaded.

  The generated `pikku-scopes.gen.ts` now imports its metadata sidecar and derives
  `SCOPES` from it, rather than inlining the list. TypeScript only emits a `.json`
  into the build output when something imports it, and an addon publishes only
  that output — without the import, an addon's scopes never reached a host.

- f6b4113: Rewrite 46 bundled skills' frontmatter descriptions as `>-` folded block scalars so pi.dev's strict `yaml` parser stops silently dropping them (was 15/61 loading, now 61/61); the corpus lint now parses with the same parser.
- cb079cc: `pikku import n8n` now batch-imports export arrays, `{ workflows: [...] }` wrappers, and directories of `.json` exports — one slug-named sub-directory per workflow, per-workflow failures skipped.
- cb079cc: `parseN8n` takes an optional `nameHint` and the `pikku import n8n` CLI passes the source filename, so nameless n8n exports no longer all collapse onto the same `importedWorkflow` slug.
- cb079cc: Add `@pikku/n8n-import` and the `pikku import n8n <file>` CLI command, converting an n8n workflow JSON export into a Pikku workflow graph plus a coverage harness.
- 13474a6: fix: ship an addon's secrets and variables metadata

  An addon's `pikku-secrets-meta.gen.json` and `pikku-variables-meta.gen.json`
  never reached its published package, so a host installing the addon could not
  discover its declared secrets or variables — the inspector's addon loaders
  silently found nothing.

  TypeScript only emits a `.json` into the build output when something imports it,
  and an addon publishes only that output. The generated `pikku-secrets.gen.ts`
  and `pikku-variables.gen.ts` now import their sidecars and re-export them as
  `SECRETS_META` / `VARIABLES_META`, so the metadata ships.

- 9f0d0eb: Migrate the `--oauth` addon scaffold off `OAuth2Client`. A scaffolded OAuth2
  addon service used to construct `new OAuth2Client(config, appCredentialSecretId,
secrets)` and do its own token exchange/refresh — the responsibility better-auth
  now owns via the credential service. The `pikku new addon --oauth` scaffold (and
  the OpenAPI `--openapi` generator) now emit a service that receives a ready
  access token: `services.ts` uses `createWireServices` + `wire.getCredential<{
accessToken: string }>(name)` and the service does a plain `fetch` with
  `Authorization: Bearer ${accessToken}`, matching the existing per-user
  bearer/apikey credential scaffold. With no remaining consumers, `OAuth2Client`
  (`@pikku/core/oauth2`) and its test are removed; the `./oauth2` export keeps the
  `OAuth2AppCredential` / `OAuth2Token` types.
- 8601505: Make `wireCredential` the single source of truth for an addon's OAuth2 config: `pikku-credentials.gen.ts` exports `CREDENTIAL_OAUTH2_CONFIGS`, generated services import from it, the OpenAPI importer emits a `wireCredential`, and the inspector now extracts `oauth2.additionalParams`.
- 70fa400: Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
- f5eb5ab: `pikku skills install --agent pi` installs bundled skills into `.pi/skills/` for pi.dev (composes with `--only`/`--core`/`--fabric`/`--update`); per-agent install paths now come from one map, and `--agent` help lists only the agents that work.
- 3d284d2: Fix bundled skills that referenced nonexistent APIs/commands (`getSecretJSON`, `pikku tsc`/`prebuild`/`auth`/`create`, `pikku tests`), rewrite pikku-testing onto scenarios, and add a verifier that rejects references to commands/methods that don't exist.
- 13474a6: feat: `pikku scopes audit` and `pikku scopes prune`

  Scopes sync additively, so a scope removed from code leaves an inert row rather
  than revoking a grant mid-deploy. These commands are the deliberate cleanup
  path.

  `pikku scopes audit` reports scopes in the database that are no longer declared
  in code, along with the roles still holding them. `pikku scopes prune` removes
  them, cascading them out of every role — but only with `--yes`; without it,
  prune just shows the blast radius.

- d2a6eea: Add `wireRemoteAddon` — consume a hosted addon's `remote: true` RPCs transparently over HTTP, with the addon installed as a devDependency (types only). `rpc('ns:fn', input)` dispatches to the host's `/remote/rpc/:rpcName`, authenticating as a client with a token bound from a local source (`{ credentialId }` per-user, `{ secretId }` platform, or a custom `resolve()`), or omitted for a public surface. This is any-machine → hosted-library client auth, distinct from the trusted mesh (`PIKKU_REMOTE_SECRET`). A new `.remote.gen.d.ts` RPC map exposes only the `remote: true` surface to consumers. `pikku` verify errors if a `wireRemoteAddon` package is a production dependency (or missing) instead of a devDependency, and if a bound `credentialId`/`secretId` isn't wired.
- 30e62ee: Add `workflow.approval(reason, { schema, expiry })` — a return-valued, expiring human-in-the-loop gate that stays closed until a decision is recorded (via `workflowService.approveStep` or `POST /workflow/:workflowName/approve/:runId`), unlike the one-shot `workflow.suspend()`.
- Updated dependencies [7ab5287]
- Updated dependencies [e86bc17]
- Updated dependencies [a9b96a0]
- Updated dependencies [3f7fc54]
- Updated dependencies [c478794]
- Updated dependencies [3f04ae4]
- Updated dependencies [b714fd4]
- Updated dependencies [90d9f04]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [0a7db82]
- Updated dependencies [981c4db]
- Updated dependencies [416606c]
- Updated dependencies [739c9f8]
- Updated dependencies [13474a6]
- Updated dependencies [c2a66dc]
- Updated dependencies [ca0d14f]
- Updated dependencies [5a2b0d5]
- Updated dependencies [13474a6]
- Updated dependencies [13474a6]
- Updated dependencies [13474a6]
- Updated dependencies [ee040dc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [13474a6]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [9f0d0eb]
- Updated dependencies [8601505]
- Updated dependencies [13474a6]
- Updated dependencies [13474a6]
- Updated dependencies [70fa400]
- Updated dependencies [3c75366]
- Updated dependencies [7b2ea23]
- Updated dependencies [4b02d73]
- Updated dependencies [13474a6]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64
  - @pikku/inspector@0.12.43
  - @pikku/better-auth@0.12.18
  - @pikku/kysely@0.13.1
  - @pikku/n8n-import@0.0.2
  - @pikku/openapi-parser@0.12.16
  - @pikku/fetch@0.12.8

## 0.12.82

### Patch Changes

- 398e83b: `pikku fabric validate` now flags a `packages/mantine-theme/` package that has no console-readable theme spec. It mirrors the Fabric console's `getSandboxThemes` file logic: a package with only a hand-written `createTheme()` (no `themes/<id>.json` + `active.json`) renders fine but makes the console Design tab report "no theme set" and leaves it uneditable. New info findings: `theme-no-spec` (no `themes/<id>.json`), `theme-no-active` (spec present but `active.json` missing/id-less), and `theme-active-mismatch` (`active.json.id` points at a non-existent spec).

## 0.12.81

### Patch Changes

- 854c342: Fix workspace addon integration: exclude nested pikku projects from inspection (prevents "More than one CoreUserSession/CoreConfig found" when a workspace addon is linked), widen the generated addon service `call()` data param to `unknown` so schema-less function inputs compile, and add `@pikku/inspector` + `@standard-schema/spec` to the generated addon devDependencies so its `.pikku` gen files typecheck.
- Updated dependencies [854c342]
  - @pikku/inspector@0.12.42
  - @pikku/openapi-parser@0.12.15

## 0.12.80

### Patch Changes

- b226948: Scenario context: scenarios now receive a `scenario` wire (was `workflow`) with the scenario-only helpers `expectEventually`/`expectError`/`expectService` plus a new `scenario.runScheduledTask(name)` that fires a cron inline with the system session. `PikkuWorkflowWire` is trimmed to the plain DSL (`do`/`sleep`/`suspend`); the scenario surface lives on the new `PikkuScenarioWire`. Actor calls (`invoke`/`converse`) stay on the `actors` registry. Scenarios are now excluded from `pikku scenario --coverage` totals.
- Updated dependencies [b226948]
  - @pikku/core@0.12.62

## 0.12.79

### Patch Changes

- bb65430: Fail codegen with a clear error when the installed `@pikku/core` violates the CLI's peer range (PKU718).

  Some package managers (bun, yarn) install straight past an unsatisfied `peerDependencies` range instead of failing, so `@pikku/cli` could end up next to a `@pikku/core` outside the range it declares — and the only symptom was a cryptic missing-export crash deep in codegen or at runtime (e.g. `The requested module '@pikku/core/dev' does not provide an export named 'reloadGeneratedMeta'`).

  The existing preflight that catches a _split_ core (two installed versions, `PKU717`) now also validates the _single_ installed core's version against the CLI's own `@pikku/core` peer range, and fails with the exact versions and the fix (`@pikku/cli` and `@pikku/core` move together — bump both to the same release, update any overrides/resolutions pins, reinstall). Set `PIKKU_ALLOW_CORE_SKEW=1` to downgrade the failure to a warning if you have verified the installed pair is compatible, mirroring `PIKKU_ALLOW_DUPLICATE_CORE`.

- Updated dependencies [bb65430]
- Updated dependencies [982d3f5]
  - @pikku/inspector@0.12.41
  - @pikku/core@0.12.61

## 0.12.78

### Patch Changes

- 1f3f510: Warn when a Pikku function body performs a runtime dynamic `import(...)`.

  The inspector now flags any `pikkuFunc`/`pikkuSessionlessFunc` (and friends) whose handler body contains a dynamic `import(...)` call — including nested callbacks — with the new `PKU498` diagnostic. Function bodies run on every invocation, so a dynamic import there adds per-call latency and defeats bundling/tree-shaking; the import belongs at the top of the module or in your services/`wireServices` setup instead.

  Type-only positions like `import('x').Foo` are not flagged. The rule defaults to `warn` — a printed yellow warning that does not fail the build — and is configurable via `lint.functionDynamicImport` in `pikku.config.json` (`'off'` to silence, `'error'` to make it a hard build failure), matching the existing `servicesNotDestructured`/`wiresNotDestructured` lints.

- Updated dependencies [1f3f510]
  - @pikku/inspector@0.12.40
  - @pikku/core@0.12.59

## 0.12.77

### Patch Changes

- 7b17b14: Allow a workflow-graph node's `func` to reference a registered AI agent by name, dispatched as an agent run — exactly like sub-workflows. `executeGraphStep`/`executeGraphNodeInline` now check the agent registry and dispatch matching nodes via the agent-run path (`rpc.agent.run`), so the node's result is the agent's declared output and downstream nodes can `ref()` it. The generated `pikkuWorkflowGraph` wrapper widens its node-func union to also accept `keyof FlattenedWorkflowMap` and `keyof FlattenedAgentMap`, and `ref()` resolves an agent node's output keys.
- 4f92e6f: `pikku db` schema-codegen warnings are now coded diagnostics routed through the CLI logger instead of raw `console.warn`, so they participate in the existing `--fail-on-warn` gate.

  Each warning now carries a PKU code and `warn` severity: `PKU481` (JSON/JSONB column with no concrete `tsType`, degrading to `unknown`), `PKU480` (column named like a date/bool but whose DB type contradicts it), and `PKU482` (a `format` annotation ignored on a non-string column). Running `pikku db migrate --fail-on-warn` (e.g. in CI) now turns these into a hard failure, forcing the `db/annotations.ts` entry — closing the loophole where an untyped jsonb column silently degrades type-safety. Default behaviour is unchanged: the warnings still print, and only fail the build when `--fail-on-warn` is set.

- 746abda: Fix pathologically slow `pikku db migrate` schema introspection on Postgres. Column and foreign-key introspection previously fanned out one query per table via `Promise.all` on a single `pg.Client`, which serialized every round-trip (emitting the `client.query() while already executing` deprecation warning) and scaled O(tables). It now issues a single set-based `information_schema` sweep for all columns and all foreign keys, turning introspection into a constant number of round-trips regardless of schema size. SQLite is unaffected (its introspection is synchronous and in-process).
- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- 08bb644: Fix `pikku db` schema codegen flattening Postgres array columns to scalar types. `text[]`/`int[]`/`uuid[]` columns now generate as `string[]`/`number[]`/`string[]` in `schema.gen.ts` instead of `string`/`number`. The introspector now captures the array element type from `udt_name` (previously every array column was recorded as the opaque `ARRAY`), and `mapType` preserves the `[]` suffix rather than matching the element substring and dropping the array-ness.
- c8aa272: `pikku new addon --auth-config <path>`: pass an auth-config JSON that overrides the spec's securitySchemes (custom auth header, delegated login). With a `delegated` section the credential mode is forced to `bearer`, the generated per-user services check token expiry (`UnauthorizedError` re-auth signal), the credential schema carries `{ token, expiresAt?, tenantId? }`, and the addon exports a ready `authenticate<Name>Upstream()` for `@pikku/better-auth`'s `delegatedAuth()` plugin.
- Updated dependencies [7b17b14]
- Updated dependencies [4f92e6f]
- Updated dependencies [ac4c3f4]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
- Updated dependencies [0f3edd3]
- Updated dependencies [ad26273]
  - @pikku/core@0.12.58
  - @pikku/inspector@0.12.39
  - @pikku/better-auth@0.12.17
  - @pikku/fetch@0.12.7
  - @pikku/schedule@0.12.4
  - @pikku/node-http-server@0.12.6
  - @pikku/ws@0.12.4
  - @pikku/openapi-parser@0.12.13

## 0.12.76

### Patch Changes

- a483501: Tag every scaffold/plumbing wiring with `pikku` so visualizers (e.g. the
  console's woven build view) can tell built-in pieces apart from the user's app.
  Previously the better-auth catch-all routes + handler, the console
  `/workflow-run` route group, the graph-starter workflow route + function, and
  the public/remote RPC HTTP routes (and the remote-RPC queue worker) emitted with
  no `pikku` tag, so anything filtering on the tag missed them.

## 0.12.75

### Patch Changes

- 2404134: Guard `wire.getCredential` in the generated per-user credential addon (`new addon --credential`). `getCredential` is optional on the wire services type, so the emitted `src/services.ts` failed `tsc` with "possibly undefined" out of the box; it now checks before calling.

## 0.12.74

### Patch Changes

- 60ad8cb: fix dev-server hot reload so edited AND new functions/routes apply without a restart
  - `@pikku/core`: the hot reloader fed raw zod `input`/`output` schemas into the JSON-schema map, so `compileAllSchemas` threw `Failed to compile schema` on every reload and the reload aborted (only the function body sometimes swapped, half-updated). It now registers function implementations only and leaves schemas to the codegen JSON output. New function exports are registered too (previously only already-registered names were replaced). Reloads write into the startup functions map directly to avoid a race with the dev watcher's codegen-scoped state swap, and re-import via a uniquely-named sibling copy since neither Bun nor tsx bust the module cache on a `?t=` query.
  - New `reloadGeneratedMeta` (exported from `@pikku/core/dev`) re-reads the regenerated wiring meta + JSON schemas into the running process so new/changed routes, RPCs, queues and agents resolve without a restart.
  - `@pikku/cli`: `pikku dev` now calls `reloadGeneratedMeta` after each watch-triggered codegen pass and re-imports the changed files once fresh meta is in state, so a NEW route in a changed wiring file registers (its `wireHTTP` no longer no-ops on missing meta).
  - `@pikku/schema-cfworker`: `compileSchema` recompiles when a schema's value changes (not only on first sight), so hot-reloaded schemas take effect.

- 60ad8cb: fix `pikku all --tsc`/`--tsc-summary` reporting phantom type errors

  The type-check used the CLI's own bundled TypeScript, which could be a different major than the project's (e.g. TS 6 vs a project on TS 5) and emit diagnostics the project's real `tsc` never would — most visibly 10 phantom `TS2591 Cannot find name 'process'` errors on a project that type-checks clean under its own compiler. `runProjectTypecheck` now loads the project's own installed `typescript` (falling back to the bundled one only when the project has none).

- Updated dependencies [60ad8cb]
- Updated dependencies [8f5c998]
  - @pikku/core@0.12.57

## 0.12.73

### Patch Changes

- 4502ed0: Fix `pikku dev --coverage` on Bun: the istanbul loader returned `undefined` from
  `onLoad` for non-instrumented files, which Bun (≥1.3.14) rejects with
  "onLoad() expects an object returned" — crashing the dev server at boot as soon
  as a `.gen`/`.test`/`.d` (or node_modules) `.ts` file loaded. Non-instrumented
  files now pass through as an object.

## 0.12.72

### Patch Changes

- bcfebf6: Console: accept `Authorization: Bearer <PIKKU_CONSOLE_TOKEN>`

  A console served from another origin cannot carry the session cookie, so
  every `console:*` RPC returned 403. `authBearer` gains a secret-resolved
  token mode (`token: { secretId, userSession }` — resolved through the
  secrets service per request, constant-time compare, no-op while the secret
  is unset), and the auth scaffold wires it with `PIKKU_CONSOLE_TOKEN` when
  `scaffold.console` is enabled — inside the same `addHTTPMiddleware('*')`
  call as the session middleware, since the inspector keys route-middleware
  groups by pattern (pikkujs/pikku#886).
  Set that secret in the server environment and send it as a bearer token to
  authenticate an external console.

- Updated dependencies [bcfebf6]
  - @pikku/core@0.12.55

## 0.12.71

### Patch Changes

- 66f3dae: Move `@pikku/core` from `dependencies` to `peerDependencies` in the last packages that still declared it as a regular dependency.

  `@pikku/core` holds a single `pikkuState` registry and must resolve to exactly one copy at runtime — every wiring (workflows, RPCs, queue workers, middleware) registers into the copy it imports, and the runner reads the copy it imports. 35 packages already declare core as a peer for this reason; these six were the stragglers. Because they carried a regular `@pikku/core` dependency, bumping any one of them could leave a second, older core locked in a consumer's tree, splitting the registry so wirings silently fail to resolve (surfaced as `[PKU717] Multiple @pikku/core versions installed`).

  Making core a peer everywhere means the consuming app provides the one copy (the react/react-dom singleton pattern), so duplication is structurally impossible. `@pikku/core` is also kept as a devDependency in each package so it still builds/typechecks standalone.

  Backward-compatible for consumers that already list `@pikku/core` directly (every template does). A consumer that only pulled core transitively now gets a loud install-time peer warning instead of a silent runtime split — strictly better.

- cd0cff1: Remove the `pikku tests` harness in favour of scenarios (`pikku scenario run` + `pikku dev --coverage`).
  - `@pikku/cli`: `pikku tests init` / `pikku tests coverage` are gone, along with the workspace-validate hints that suggested scaffolding the ftest harness.
  - `@pikku/cucumber`: refactored to e2e-only — keeps `Actor`, the browser world, `createDbUtils`, `PersonaData`, and the `StubTracker` re-export; the in-process function world (`createFunctionWorld`, `registerHooks`, `registerCommonSteps`, stub wires) is removed.
  - `@pikku/console`: the Tests page is removed; Scenarios moves to `/scenarios`.
  - `@pikku/addon-console`: `runFunctionTests` / `streamFunctionTests` / `getFunctionCoverage` RPCs are removed — live coverage via `takeLiveCoverage` / `resetLiveCoverage` (from `pikku dev --coverage`) replaces the file-based report.

- ded4f90: `pikku scenario --coverage` no longer requires the console addon

  The scenario instrumentation RPCs (take/reset live coverage, reset stubs, get
  stub calls) previously shipped inside the console addon, so any project
  without the addon silently lost scenario coverage and stub assertions — and
  core's `expectService` hardcoded a `console:` RPC, assuming an addon was
  installed.

  A new `scaffold.scenarios` feature (`pikku enable scenarios`, or
  `"scaffold": { "scenarios": "auth" }` in pikku.config.json) generates the
  four functions into the project scaffold as `pikkuScenario*` exposed RPCs.
  The scenario runner and `expectService` now invoke those names and the
  addon copies were removed. The source-map-aware coverage mapping (and its
  `@jridgewell/trace-mapping` dependency) moved from the addon into the CLI:
  `@pikku/core` gains only the report types plus an optional
  `CoverageService.takeReport`, which the CLI-booted coverage service
  implements and the scaffolded function calls.

- Updated dependencies [66f3dae]
- Updated dependencies [ded4f90]
  - @pikku/inspector@0.12.38
  - @pikku/core@0.12.54

## 0.12.70

### Patch Changes

- efb0406: Add in-process V8 precise coverage (`pikku dev --coverage` / `pikku serve --coverage`) with per-scenario attribution.
  - `@pikku/core`: new `V8CoverageService` (node:inspector precise coverage with snapshot + reset), exposed as the optional `coverageService` singleton service.
  - `@pikku/inspector`: function meta now records `bodyStart`/`bodyEnd` body spans (verbose meta only) so coverage can be mapped without a runtime TypeScript dependency.
  - `@pikku/cli`: `--coverage` on `pikku dev` and `pikku serve` starts the collector in-process; `pikku scenario run --coverage` resets/snapshots the server between flows and writes `.pikku/coverage/scenario-coverage.json` with per-scenario function coverage.
  - `@pikku/addon-console`: new exposed `takeLiveCoverage` / `resetLiveCoverage` RPCs; V8 ranges are mapped through inline source maps to original TypeScript lines (offset-based, so esbuild/tsx single-line output keeps full resolution).

- 53eeeab: Skip redundant inspector re-runs in `pikku all` when nothing inspectable changed

  `pikku all` unconditionally re-ran the TypeScript inspector up to 3× per run
  (after agents, after workflows, after CLI channel) — the dominant cost of
  codegen. writeFileInDir now tracks a generation counter bumped only when a
  .ts file is actually written or removed, and getInspectorState skips a
  refresh when the generation is unchanged since the last inspection. On a
  no-change run codegen now performs a single inspection (~2× faster; more on
  CPU-constrained machines like sandboxes).

  Watchers (`pikku dev`/`watch`) call the new
  `invalidateInspectorState` service before re-running `all`, since user
  source edits bypass writeFileInDir and must still force a re-inspection.

  Also fixes saveSchemas writing a stub register.gen.ts before every real
  write — the stub→full flip made every run look dirty and kept the
  re-inspect gate (and file watchers) churning on no-op runs.

- bda5809: feat(cli): `pikku all --diff` emits a structural diff of the generated `.pikku` meta

  On a successful `pikku all`, `--diff` prints a `PIKKU_DIFF <json>` line on stdout describing what the run added/removed/changed across functions, HTTP wirings, workflows (incl. userflows/scenarios), emails, schedulers, queues, channels, triggers, MCP and agents. The snapshot is taken before codegen overwrites the meta, so the diff is a couple of small JSON reads rather than a second inspection pass, and it is emitted only on exit 0 (a failed codegen produces no diff). Intended for tooling that wants to surface "what changed" after a codegen run.

- fe4f5ca: Add `stub`/`spy`/`isTestRun` core utils with call recording for scenario assertions.
  - `@pikku/core`: `StubTracker` moves here from `@pikku/cucumber` (which re-exports it), gaining `record`/`getCalls`/`reset`. New plain-import utils backed by a process-wide tracker: `stub(name, impl?)` (recording fake), `spy(name, real)` (record + pass through), `isTestRun()` (reads `PIKKU_TEST_RUN`). Nothing is injected into service factories and no new factory types exist — swap services with a plain `isTestRun()` conditional where needed. New scenario DSL steps: `workflow.expectService('email.send', { calledWith })` asserts recorded stub calls via the console RPC, `workflow.expectError(...)` walks error branches.
  - `@pikku/cli`: `pikku dev --test` sets `PIKKU_TEST_RUN` and wraps the dev-provided default services (email) in recording spies; independent of `--coverage`, absent from production `pikku serve`. `pikku scenario run` resets recorded calls per flow.
  - `@pikku/addon-console`: exposed `getStubCalls` / `resetStubs` RPCs next to the coverage snapshot endpoints.

- Updated dependencies [efb0406]
- Updated dependencies [fe4f5ca]
  - @pikku/core@0.12.53
  - @pikku/inspector@0.12.37

## 0.12.69

### Patch Changes

- 61c9ce9: Add `actor.converse(...)` — actor agents for user journeys (#850)

  An actor can now hold a dynamic, LLM-driven conversation with a target Pikku AI
  agent in its own persona:

  ```ts
  const verdict = await actors.pm.converse({
    agent: 'todoBot',
    task: 'Get a todo created for the launch',
    evaluate: 'A todo about the launch now exists',
  })
  // verdict: { passed, reasoning, transcript }
  // then assert deterministically as the same actor:
  const todos = await actors.pm.invoke('listTodos', {})
  ```

  The actor drives the target over the real transport (the agent's own
  `agentRun` / `agentApprove` HTTP routes, signed in as the actor), plays the
  persona from its `pikku.config.json` config, answers the agent's tool-approval
  requests in-persona (`approvals: 'in-persona' | 'always' | 'never'`), and
  returns its verdict on whether the task was met. Deterministic checks stay the
  caller's job — they already hold the actor.

  The conversation engine is transport-agnostic (persona LLM + injected target
  driver); the persona's own turns run in-process via the configured
  `aiAgentRunner` (`model` from the call or the actors-service default).

  `agent` is typed against the generated agent-name union (`keyof AgentMap`), so
  it's author-time checked and autocompleted in a typed project.

- d4a2503: Serve the console same-origin at /console (#861). Both dev servers gain
  `staticMounts` (prefix → directory static serving with SPA fallback and path
  traversal protection); `pikku serve` / `pikku dev` mount the bundled console
  app at `/console` on the API port whenever it is bundled, so auth cookies are
  first-party and no `?server=` param is needed. The console is built with
  `base: '/console/'` (its router already derives the basename from BASE_URL).
  The separate `--console <port>` static server is removed; `pikku console`
  serves the bundle under /console and redirects the root there.
- bbbb196: Dev quick login for the console when running locally (#857). The better-auth
  catch-all handler now serves `<basePath>/dev/quick-login` when
  `PIKKU_DEV_QUICK_LOGIN` is set AND the request host is a loopback address:
  GET reports availability, POST idempotently seeds an `admin@pikku.dev` admin
  user and returns a signed-in session. `pikku serve` / `pikku dev` enable the
  flag by default (set `PIKKU_DEV_QUICK_LOGIN=false` to opt out), and the
  console login screen shows a one-click "Quick login as admin@pikku.dev"
  button whenever a local server advertises the endpoint.
- f14a7df: Remove the standalone `pikku console` command — `pikku dev` already serves the console at `/console`, and `pikku serve` now does too when passed the explicit `--console` flag.
- 472a349: Rename the userflow concept to scenario (#862). `pikkuUserFlow` becomes `pikkuScenario`, `pikku userflow run/list` becomes `pikku scenario run/list`, the workflow meta flag `userFlow` becomes `scenario`, actor types are now `ScenarioActor`/`ScenarioActors`/`ScenarioActorConfig` (`createHttpScenarioActors`), pikku.config.json's `userFlows` key becomes `scenarios`, the generated actors file is `pikku-scenario-actors.gen.ts` (`createScenarioActors`), the actor sign-in secret env var is `SCENARIO_ACTOR_SECRET`, and the console's User Flows view is now Scenarios.
- c2917eb: Fix: the Pikku CLI no longer force-exits `0`, so a command's `process.exitCode` is honoured (#850)

  `bin/pikku.ts` called `process.exit(0)` unconditionally once a command finished,
  overriding any exit code the command had set. `pikku userflow run` sets
  `process.exitCode = 1` when a flow fails, but the process still exited `0` — so
  CI could not gate on a failed user flow. The CLI now exits with
  `process.exitCode ?? 0`, making failures observable to CI for every command
  (throwing commands already exited non-zero via `CLIError`).

- Updated dependencies [61c9ce9]
- Updated dependencies [f1f39f8]
- Updated dependencies [c45e98d]
- Updated dependencies [d4a2503]
- Updated dependencies [bbbb196]
- Updated dependencies [472a349]
  - @pikku/core@0.12.52
  - @pikku/inspector@0.12.36
  - @pikku/node-http-server@0.12.5
  - @pikku/bun-server@0.12.4
  - @pikku/better-auth@0.12.15

## 0.12.68

### Patch Changes

- b45d102: pikku-kysely skill: add a dense query-builder section (joins, aggregates + groupBy/having, insert/update/delete RETURNING, sql template, expression builder, $if, transactions, jsonArrayFrom/jsonObjectFrom relation helpers) and widen the trigger so the skill fires when writing a non-trivial query in a function body, not only when wiring database services. The skill previously covered only service setup, leaving agents to guess the query API.
- 289706d: Add optional `--tsc` / `--tsc-summary` type-check gate to `pikku all`

  `pikku all` previously never ran the TypeScript compiler for type errors — the
  inspector builds a program only for AST traversal (with `skipLibCheck`,
  `types: []`, no `lib`/`paths`) and never requests diagnostics, so real type
  errors were silently ignored by codegen.

  Two opt-in flags now run a genuine `tsc --noEmit` over the project's own
  tsconfig after codegen completes (so generated `.pikku` files are included,
  matching a real build) and fail the run on type errors:
  - `--tsc` — full diagnostics with code frames.
  - `--tsc-summary` — a compact one-line-per-error render (flattened messages, no
    code frames, `node_modules` filtered, capped at 50) that's cheap for AI
    agents and CI logs.

  Both are off by default (zero cost on a normal run).

- 79cef33: pikku-i18n skill teaches Paraglide (the current template i18n stack) instead of react-i18next

## 0.12.67

### Patch Changes

- 7ebea62: Tree-shake addon registrations in filtered inspector states (per-unit deploy codegen).
  - `filterInspectorState` drops an addon's `wireAddonDeclarations`/`usedAddons` unless something kept actually references it (kept wiring targeting `namespace:*`, kept agent/MCP tool, or a body-level `rpc.invoke('namespace:*')` from a file that still contains a kept function). The generated per-unit bootstrap no longer imports unused addon package bootstraps — previously every deploy unit registered every addon's entire function surface, which pulled dev-only code (e.g. `@pikku/addon-console`'s static `node:fs` imports) into Cloudflare Worker bundles and failed upload with `No such module "node:fs"`.
  - Body-level `rpc.invoke()` targets are now tracked per source file (`rpc.invokedFunctionsByFile`) so wiring-level `ref()` targets no longer pin an addon into every unit.
  - `aggregateRequiredServices` computes addon parent services per used addon function (from the addon's shipped per-function `services` meta) instead of blanket-adding `addonRequiredParentServices` — and matches namespaced ids only, so bare project function names colliding with addon function names no longer force the blanket.
  - Addon builds keep per-function `services` in the shipped `pikku-functions-meta.gen.json` so parent projects can do the above; addons built before this fall back to the blanket.
  - HTTP route meta records `refTarget` for `ref('namespace:fn')`-wired routes, so per-unit filtering keeps the addon registration (and only that function's services) when the route deploys.

- e57dd65: feat(cli): add `pikku audit` — dependency security audit written to `.pikku/audit.json`

  `pikku audit` reports dependency **security advisories** (always) and, with
  `--outdated`, **available dependency updates**. The normalised result is written
  to `.pikku/audit.json` (the config `outDir`) so it rides the same meta pipeline
  as every other generated artifact — uploaded on deploy, readable by tooling.

  Bun is fully supported (`bun audit --json` + `bun outdated`, normalised into a
  single `SecurityAuditReport` with per-severity/per-update-level counts). Other
  package managers are detected but currently stubbed with a `note` field until
  their audit/outdated shapes are normalised. The command never fails a build:
  advisories are informational and a missing/failed audit yields an empty-but-valid
  report.

- e57dd65: console addon: require an authenticated session by default

  All exposed console RPCs are now `pikkuFunc` (require a session) instead of
  `pikkuSessionlessFunc` + `auth: false` — the console is an admin surface, so it
  should never be reachable anonymously. The two SSE streaming routes
  (`/workflow-run/:runId/stream`, `/function-tests/stream`) stay sessionless, since
  their HTTP wiring is intentionally `auth: false`.

  Behaviour change for consumers: a host that mounts `@pikku/addon-console` must
  provide an authenticated session (e.g. via better-auth) to reach console RPCs —
  unauthenticated calls now return `403`. Permission policy on top of "must be
  logged in" (admin-only, org scoping, …) remains host-owned via tag/HTTP
  middleware; the addon only enforces the baseline.

  `@pikku/cli`:
  - `pikku all` now **throws** when `scaffold.console` is enabled but no
    `pikkuBetterAuth(...)` is found in the project — scaffolding the console
    without an auth strategy would produce a console that 403s on every call, so
    `scaffold.console` alone is no longer the minimum.
  - The scaffolded `console.gen.ts` secret/variable RPCs (`setSecret`, `getSecret`,
    `hasSecret`, `getVariable`, `setVariable`) are now generated as `pikkuFunc`
    (require a session) instead of `pikkuSessionlessFunc` + `auth: false` — these
    read/write secrets and must never be anonymous. The two SSE routes stay
    `auth: false`.
  - `scaffold.console` is now always `"auth"` (the `"no-auth"` mode is gone for the
    console): `pikku enable console` writes `"auth"` and ignores `--no-auth`.

- Updated dependencies [7ebea62]
- Updated dependencies [e57dd65]
  - @pikku/inspector@0.12.35
  - @pikku/core@0.12.51

## 0.12.66

### Patch Changes

- 92bd643: User flows in the console: workflow graph extraction now captures
  `workflow.expectEventually` steps and per-step actor names (`{ actor:
actors.x }`), workflow meta carries `actors`/`title` into the serialized
  graph, the CLI emits `user-flow-actors.gen.json` for the new
  `MetaService.getUserFlowActorsMeta()`, and the console Workflows page gains a
  Workflows / User Flows / Personas toggle. Also fixes complex-workflow graphs
  being clobbered by a duplicate basic-extraction pass after successful DSL
  extraction.
- Updated dependencies [35a9bab]
- Updated dependencies [92bd643]
  - @pikku/core@0.12.50
  - @pikku/inspector@0.12.34

## 0.12.65

### Patch Changes

- 194a3e7: fabric validate: error when scaffold.console is enabled but the functions package does not declare @pikku/addon-console — the generated bootstrap imports it, so pikku dev crash-loops in the sandbox without it
- 4c17f7e: user flows: actors move onto the workflow wire + `pikku userflow` command
  - Actors are no longer a singleton service: `startWorkflow(..., { actors })`
    registers them per run and they arrive on the wire —
    `func: async ({ logger }, input, { workflow, actors })`.
  - Inspector enforces user flows are pure remote stories (PKU673): a
    pikkuUserFlow func may only destructure `logger`/`config` from services.
  - New `pikku userflow run <environment> [--flows a,b] [--tags x,y]` runs flows
    against `userFlows.environments` from pikku.config.json (secret from
    USER_FLOW_ACTOR_SECRET env), refusing internal (non-actor) steps so runs
    against staging/production never touch local services; non-zero exit on
    failure. `pikku userflow list` prints names, descriptions and tags.
  - Workflow meta now carries `title` (parity with HTTP routes/functions).

- Updated dependencies [4c17f7e]
  - @pikku/core@0.12.49
  - @pikku/inspector@0.12.33

## 0.12.64

### Patch Changes

- d9e0082: User-flow actor registry in pikku.config.json: `userFlows.actors` (email,
  jobTitle, personality per actor) generates a typed
  `.pikku/workflow/pikku-user-flow-actors.gen.ts` with `userFlowActorConfigs`
  and `createUserFlowActors({ apiUrl, secret })` — wire the result as the
  `actors` singleton service for pikkuUserFlow.
- 8dfddc3: pikkuUserFlow: user flows as workflows. A complex workflow whose steps can run
  as actors over the real transport — `workflow.do(step, rpc, data, { actor:
actors.yasser })` — plus `workflow.expectEventually(...)` for polling async
  effects. Actor steps never queue and never dispatch internally, so auth
  middleware/permissions are exercised end-to-end; flows double as e2e tests and
  staged/production health checks. Ships UserFlowActor types +
  createHttpUserFlowActors (lazy sign-in via `/auth/sign-in/actor` with a
  server-held secret), inspector source `'user-flow'`, and a console badge.
- Updated dependencies [5f2c566]
- Updated dependencies [8dfddc3]
  - @pikku/better-auth@0.12.14
  - @pikku/core@0.12.48
  - @pikku/inspector@0.12.32

## 0.12.63

### Patch Changes

- 59bbef5: fix(cli): default the scaffold directory beside `srcDirectories[0]` (e.g.
  `packages/functions/src/scaffold`) instead of the rootDir-relative
  `src/scaffold`. In a monorepo the old default silently mis-placed generated
  scaffold files (auth.gen.ts, auth-secrets.gen.ts) at the repo root where their
  imports — e.g. `zod` — don't resolve, causing PKU489. Single-package layouts
  (`srcDirectories: ["./src"]`) are unaffected: the derived default is still
  `src/scaffold`. Set `scaffold.pikkuDir` explicitly to override.
- b14df13: `pikku fabric validate`: flag the deprecated Next.js pikku client. Codegen no
  longer emits `nextHTTPFile`/`nextBackendFile` (`nextjs-http.gen` /
  `nextjs-backend.gen`), but a frontend left over from a Next→TanStack migration
  still imports it. That file is gitignored (so `git add -A` never pushes it) AND
  `pikku all` never regenerates it — so it lingers on the dev's disk (validate/tsc
  pass locally) yet is absent in the clean build container, where tsc dies with
  "Cannot find module './nextjs-http.gen'" and aborts the deploy. Validate now
  errors on both the dead config keys and any surviving `nextjs-*.gen` import,
  pointing at the fetch client (`PikkuFetch`/`PikkuRPC` + `createPikku`) generated
  into the functions-sdk.
- 59bbef5: feat(cli): `pikku validate` now checks that `packages/functions` declares
  `zod` v4. pikku's generated schemas and the auth scaffold (auth-secrets.gen.ts)
  both `import { z } from 'zod'`; a missing or non-v4 zod fails codegen (PKU489)
  or type-checking, so surface it as a validation error with a fix hint.
- Updated dependencies [1cd0b2f]
  - @pikku/core@0.12.47

## 0.12.62

### Patch Changes

- 029fe2c: Fail `pikku all` when more than one `@pikku/core` version is installed. A split
  `@pikku/core` produces two separate `pikkuState` registries at runtime, so wirings
  (workflows, RPCs, queue workers, middleware) register into one copy while the runner
  reads the other and they silently fail to resolve (e.g. `WorkflowNotFoundError` for a
  workflow that is clearly registered). The preflight scans the project's `node_modules`,
  and errors (`PKU717`) with the offending versions/paths. Override with
  `PIKKU_ALLOW_DUPLICATE_CORE=1` to downgrade to a warning.
- 7243fec: Add the `pikku-audit` skill documenting the built-in audit runtime: the AuditService sink (Noop / KyselyAuditService / platform-injected), the per-invocation `auditLog` buffer via `createInvocationAudit` in `pikkuWireServices`, the `audit: true` function flag, explicit `auditLog.write()` domain events, and automatic query-level capture via `createAuditedKysely`.
- Updated dependencies [029fe2c]
- Updated dependencies [e9a778f]
  - @pikku/inspector@0.12.31
  - @pikku/core@0.12.45

## 0.12.61

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [241e6cf]
- Updated dependencies [41ce2cb]
  - @pikku/kysely@0.13.0
  - @pikku/better-auth@0.12.13
  - @pikku/bun-server@0.12.2
  - @pikku/core@0.12.44
  - @pikku/deploy-cloudflare@0.12.8
  - @pikku/fetch@0.12.6
  - @pikku/inspector@0.12.30
  - @pikku/kysely-node-sqlite@0.12.3
  - @pikku/node-http-server@0.12.4
  - @pikku/openapi-parser@0.12.11
  - @pikku/schedule@0.12.3
  - @pikku/ws@0.12.3

## 0.12.60

### Patch Changes

- d720ae8: feat(cli): add `pikku audit` — dependency security audit written to `.pikku/audit.json`

  `pikku audit` reports dependency **security advisories** (always) and, with
  `--outdated`, **available dependency updates**. The normalised result is written
  to `.pikku/audit.json` (the config `outDir`) so it rides the same meta pipeline
  as every other generated artifact — uploaded on deploy, readable by tooling.

  Bun is fully supported (`bun audit --json` + `bun outdated`, normalised into a
  single `SecurityAuditReport` with per-severity/per-update-level counts). Other
  package managers are detected but currently stubbed with a `note` field until
  their audit/outdated shapes are normalised. The command never fails a build:
  advisories are informational and a missing/failed audit yields an empty-but-valid
  report.

- d720ae8: `pikku fabric validate`: when a workspace package depends on `@pikku/browser`, verify its `puppeteer` pin matches the version `@pikku/browser` requires (the exact core `@cloudflare/puppeteer` vendors) — error on a mismatch (local rendering would diverge from Cloudflare Browser Rendering), warn when `puppeteer` is absent entirely.
- d720ae8: `pikku fabric validate`: add an undeclared-dependency check. Every external module imported from a workspace package's `src/` must be declared in that package's own dependencies/devDependencies/peerDependencies. Such imports type-check locally (via tsconfig `paths` or root workspace hoisting) but the deploy bundle (esbuild / Bun.build) resolves each package independently and fails with "Could not resolve <pkg>" — aborting the deploy. The check flags these before they reach CI (tsconfig path aliases and workspace package names are excluded to avoid false positives).
- Updated dependencies [d720ae8]
  - @pikku/deploy-cloudflare@0.12.7

## 0.12.59

### Patch Changes

- 249c21d: fix(db): emit `db/schema.gen.ts` instead of `db/schema.gen.d.ts`

  The 0.12.58 rename of `db/schema.d.ts` → `db/schema.gen.d.ts` was half-finished:
  the validate rules and templates were updated to import `#pikku/db/schema.gen.js`,
  but the generated file kept the `.d.ts` extension. With the standard subpath
  import map (`"#pikku/*.gen.js": "./.pikku/*.gen.ts"`), `#pikku/db/schema.gen.js`
  resolves to `schema.gen.ts` — which never existed, so the import failed with
  `Cannot find module '#pikku/db/schema.gen.js'` and every project's `services.ts`
  (`import type { DB } from '#pikku/db/schema.gen.js'`) broke under Node16
  resolution.

  The schema body is type-only (an `import type` from kysely plus interfaces and
  type aliases), so it is valid as a regular `.ts` module — genuinely matching the
  `coercion.gen.ts` / `classification.gen.ts` convention the rename cited. The
  generator now writes `schema.gen.ts`; the zod codegen reads it from the same
  descriptor, so both stay in lockstep.

- Updated dependencies [7b5b10a]
  - @pikku/core@0.12.42
  - @pikku/inspector@0.12.29

## 0.12.58

### Patch Changes

- 9702d8e: fix(deploy): surface Bun.build AggregateError details in bundle failure messages

  Bun.build() throws an AggregateError with per-file resolution errors in its
  `errors` array (not in `.message`). The bundler now includes those messages
  so build logs show the actual "Could not resolve: X" reason instead of a
  bare "Bundle failed".

- 3d5ffda: Rename the generated `db/schema.d.ts` output file to `db/schema.gen.d.ts` to match the naming convention of `coercion.gen.ts` and `classification.gen.ts`.
- Updated dependencies [04db6a2]
  - @pikku/core@0.12.41

## 0.12.57

### Patch Changes

- b49082b: fix(deploy): per-unit bootstrap files use relative imports instead of package names

  When `pikku all --outDir=.deploy/...` runs for per-unit deploy codegen, generated
  bootstrap files now always emit relative imports rather than package-name imports
  (e.g. `../../../../packages/functions/src/...` instead of `@perauset/functions/src/...`).

  Package-name imports from inside `.deploy/` fail in bun workspace projects because
  the deploy directory is not a workspace member, so bun never creates the necessary
  symlinks for package resolution from that location.

  The new `--force-relative-imports` flag on `pikku all` enables this behaviour and is
  passed automatically by the per-unit deploy codegen step.

- 7f0a375: fabric validate: warn when db/annotations.ts and knowledge/\*.md are missing from the project

## 0.12.56

### Patch Changes

- 80141af: feat(cli): native Bun.build bundler + runtime DI split for deploy & dev

  Deploys and `pikku dev` now use a runtime-appropriate implementation chosen once
  via dependency injection, instead of inline `typeof Bun` checks.
  - **Bundler**: a `Bundler` interface with a shared `BaseBundler` (dead-module
    stubbing, dependency extraction, package.json + hashing) and two backends —
    `NodeBundler` (esbuild) and `BunBundler` (native `Bun.build`). Under bun the
    deploy bundle now resolves bun's `.bun` store / per-workspace symlinks natively
    (esbuild's `nodePaths` walk assumes a hoisted root and failed there). Bun's
    metafile omits external imports, so externals are captured via the resolve
    plugin to drive per-unit dependency extraction. Full identifier minification is
    used under bun (safe — pikku's error→status reflection compares same-class
    instances and workflow exceptions hardcode `.name`).
  - **Dev server**: a `DevServerRunner` interface with `NodeServerRunner`
    (`@pikku/node-http-server` + `ws`) and `BunServerRunner` (`@pikku/bun-server`),
    each also supplying the runtime's EventHub.
  - The runtime is resolved once in `services.ts`; `bundler` and `devServerRunner`
    are injected singletons. No `typeof Bun` branches remain in the pipeline or the
    dev command.
  - Also removes a redundant `as` cast on an `rpc.invoke()` result (PKU940) now
    that the generated map types the output.

- c4505d6: build(cli): publish a Windows binary on each release

  The native binary build now compiles a `bun-windows-x64` target alongside the
  existing linux/darwin x64+arm64 builds, producing `pikku-windows-x64.exe`. The
  release job already globs `release/binaries/*` and uploads everything to the
  GitHub release, so the Windows binary is attached to every CLI release with no
  further CI changes.

- 66d43d1: Add `deploy.defaultTarget` to `pikku.config.json` to override the default deploy target ('serverless') for functions without an explicit `deploy` flag.
- d8c34fa: feat(inspector): warn (non-blocking) when a JSON/JSONB column has no concrete tsType

  DB codegen typed every JSON/JSONB column as `unknown` unless a `tsType`
  annotation was set, silently erasing type-safety at every call site. The
  codegen now emits a non-blocking warning (via the existing `warnings[]`
  channel) whenever a JSON/JSONB column resolves to `unknown`/`any` — including
  when it is only annotated `kind: 'json'`, or explicitly `tsType: 'unknown'`
  (allowed but discouraged). The message names the column, the resolved type, and
  the exact annotation to add, so it is actionable by a developer or an AI. A
  concrete `tsType` (e.g. `TicketSpec`) silences it.

- 47f5b35: docs(skills): trim always-loaded skill context by splitting bulky reference material on demand

  The `skill` tool injects the whole `SKILL.md` into the agent's context on every
  load, so large rarely-needed reference blocks were paid for on every invocation.
  Carved the nine heaviest skills: kept the Agent Operating Procedure, decision
  rules, common-path guidance and one canonical example inline; moved exhaustive
  option tables, full API/manifest references, and off-common-path recipes into
  `references/*.md` that the agent reads on demand, each linked by an explicit
  pointer line so no knowledge becomes invisible. Net knowledge loss is zero —
  only location and verbosity changed.
  - pikku-testing 636→328 (cucumber/BDD reference split out)
  - pikku-workflow 334→168 (also reconciled a substantial drift between the OSS
    and bundled copies — merged the union of unique facts before deduping)
  - pikku-services 293→210, pikku-http 318→226, pikku-addon 331→238,
    pikku-middleware 283→226, pikku-realtime 286→236, pikku-cli 281→195,
    pikku-concepts 286→229 (wired the previously-dead `concept-mapping.md`)

  Also makes Zod the only _documented_ function form: the generic
  `pikkuFunc<In,Out>` overload still exists in code but is dropped from the
  generated function-type JSDoc and the concept skills, so generated scaffolds and
  docs show only the `input:`/`output:` Zod-schema form.

- ba1ab08: refactor(workflow): replace `inline: false` with `workflowQueued: true` on function meta

  The per-function workflow dispatch flag has been renamed from the confusing
  negative `inline: false` to the explicit positive `workflowQueued: true`.
  Two companion fields are also added: `workflowRetries` and `workflowTimeout`
  as function-level equivalents of the per-call-site `NodeOptions` fields.

  **Breaking change (patch — flag was undocumented):** rename `inline: false`
  to `workflowQueued: true` on any `pikkuSessionlessFunc` / `pikkuFunc` that
  dispatches its workflow steps via the queue.

  **Behaviour change:** a step marked `workflowQueued: true` now throws if no
  queue service is configured, instead of silently falling back to inline
  execution.

  **Bug fix:** `post-process.ts` was registering `wf-step-*` queues for every
  workflow step node; it now only registers them for steps that are actually
  `workflowQueued: true`, avoiding spurious queue resource allocation.

- Updated dependencies [66d43d1]
- Updated dependencies [a8c9e6d]
- Updated dependencies [ba1ab08]
  - @pikku/inspector@0.12.28
  - @pikku/core@0.12.40

## 0.12.55

### Patch Changes

- 49f738b: Fix `pikkuBetterAuth` codegen fragility on cold bootstrap. The `#pikku` hub
  re-exported `auth/auth.types.js` only after a full inspect, so a cold
  `pikku bootstrap` followed by `pikku db generate` (or the first full inspect)
  crashed importing the user's auth file with `does not provide an export named
'pikkuBetterAuth'`. Bootstrap now detects `pikkuBetterAuth(...)` via a cheap
  AST-free source scan and pre-writes a stub `auth.types.ts` (raw re-export from
  `@pikku/better-auth`) so the import resolves immediately; the typed wrapper still
  overwrites it on the post-inspect pass.
- 9269567: Fix two `pikku dev`/`pikku db seed` failures under the Bun runtime.
  - **IPv4 bind:** `pikku dev` passed `hostname: 'localhost'`, which `Bun.serve`
    resolves to IPv6 `[::1]` only — unreachable from an IPv4 `127.0.0.1` reverse
    proxy. Both the Bun and Node dev servers now bind explicit `127.0.0.1`
    (works on both runtimes; Node previously relied on `--dns-result-order=ipv4first`).
    The user-facing content URL still shows `localhost`.
  - **Seed tolerance:** the Bun sqlite runtime's `exec` threw
    `no valid SQL statement` on comment-only/empty input (e.g. a placeholder
    `seed.sql`), whereas `node:sqlite` silently no-ops. It now skips when nothing
    executable remains after stripping comments; real SQL still runs verbatim.

- 41ff485: fix(inspector): register functions in a dedicated pass before wiring resolution

  The deterministic-codegen change sorted `program.getSourceFiles()` so generated
  output is byte-identical across runs. But function registration (`addFunctions`)
  ran in the same sweep as wiring resolution (`visitRoutes`), so once traversal
  became alphabetical, a wiring file could be visited before the file that defines
  the function it references — e.g. an addon contract (`hello.contracts.ts`)
  before `hello.functions.ts` — producing a spurious `PKU559` ("No function
  metadata found for channel handler").

  Function registration now runs in its own pass (`visitFunctions`) over the
  sorted files, completing before any transport/wiring resolution, so resolution
  no longer depends on source-file order. Also sort the `register.gen.ts` schema
  imports (driven by a `Set`) so that file is stable too, and opt the PII-check
  tests into the now-opt-in classification scan.

- 061c717: fix(cli): log just the message for expected failures, keep the stack for uncaught errors

  A deliberate, expected failure — e.g. `pikku all` aborting because a build gate
  (blocking diagnostics) tripped — was dumping a full workflow stack trace, burying
  the one line that matters. Errors are now classified: a `PikkuError` (or any error
  carrying an `expected` marker) prints its message alone, while a genuinely uncaught
  error still prints the full stack so it can be debugged.
  - New `isExpectedError(error)` helper (exported from `@pikku/core`): true for a
    `PikkuError` or an error flagged `expected`.
  - The `expected` flag is threaded through `SerializedError` and the in-memory
    workflow step store so it survives the step-boundary rehydration that strips the
    error's class.
  - The CLI runner's top-level catch, the `CLILogger`, and the workflow runner's
    failure log all honour it.
  - The blocking-diagnostics abort now throws a `PikkuError` subclass so it is
    treated as expected.

- 6367f47: feat(cli): gate the remote internal RPC scaffold behind `scaffold.remoteRpc`

  The remote internal RPC handler (`rpc-remote.gen.ts` — a `pikku-remote-internal-rpc`
  queue worker plus a `/remote/rpc/:rpcName` HTTP endpoint) was generated for
  **every** project unconditionally, because `remoteRpcWorkersFile` defaulted to
  `<scaffoldDir>/rpc-remote.gen.ts` with no guard. Projects that never invoke RPCs
  across a deployable boundary (the call resolves inline, or service-to-service
  goes through a generated `PikkuRPC`/`PikkuFetch` HTTP client) ended up
  registering an idle queue worker they never dispatch to.

  Remote RPC is now an opt-in scaffold feature, consistent with `rpc`, `agent`,
  `workflow`, `console`, and `events`:

  ```jsonc
  // pikku.config.json
  "scaffold": { "remoteRpc": "no-auth" }
  ```

  or via the CLI: `pikku enable remote-rpc`.

  When `scaffold.remoteRpc` is unset, `remoteRpcWorkersFile` is left undefined and
  `pikkuRemoteRPC` skips generation (same guard the other scaffolds already use) —
  no `pikku-remote-internal-rpc` queue worker, no `/remote/rpc/:rpcName` endpoint.

  **Migration:** projects that rely on pikku's cross-deployable remote RPC
  transport must add `"scaffold": { "remoteRpc": "no-auth" }` (or run
  `pikku enable remote-rpc`) to keep the handler. The `remote-rpc-pg` /
  `remote-rpc-redis` templates (via the shared `functions` template) are updated
  accordingly.

- e6fd12b: perf(inspector,cli): persist generated TS schemas to disk across runs

  `generateAllSchemas` already cached its `ts-json-schema-generator` output
  in-memory (keyed by the generated custom-types content), so the 2nd and 3rd
  inspector passes within a single `pikku all` were near-free. But the cache
  never survived the process, so every fresh `pikku all` paid the full cold cost
  of building a second TS program + running ts-json-schema-generator — on a
  331-function project that's ~2.2s, the single largest line item of a run.

  The cache is now also persisted to disk (`node_modules/.cache/pikku/ts-schemas.json`,
  gitignored by convention), keyed by a hash of the custom-types content plus the
  generator options that affect output. A warm `pikku all` whose function types
  are unchanged loads the schemas from disk and skips schema generation entirely;
  the cold first pass drops by ~3.4s in practice (it also primes the in-memory
  cache for the re-inspect passes). Zod schemas are still regenerated every run
  (already ~1ms each). Output is byte-identical to a cold run (verified across the
  full generated tree). The key is derived from the same content the in-memory
  cache uses, so any type change busts it. It also folds in the `@pikku/inspector`
  package version, so upgrading the inspector (the channel a schema-format change
  ships through) auto-invalidates every cache; `SCHEMA_CACHE_VERSION` remains a
  manual lever for in-development format changes between releases.

  Opt-out: omit `schemaConfig.cacheDir` (the CLI sets it by default).

- 244d892: perf(cli,inspector): make the data-classification scan opt-in (`pikku all --security`)

  `pikku all` was spending the bulk of its wall-clock on the data-classification
  leak check. For every function, on every inspector pass, it called
  `checker.getReturnTypeOfSignature` to infer the handler's return type and scan it
  for `Private`/`Pii`/`Secret` brands — the single most expensive type-checker
  operation. On a 331-function project that was ~7.3s (≈half the total), repeated
  across all three inspector passes, even though the scan only emits diagnostics
  and never affects generated output.

  The scan is a security lint, not codegen, so it's now **off by default** and gated
  behind a new `--security` flag (or `security: true` in the config). A plain
  `pikku all` skips return-type inference entirely; run `pikku all --security`
  (optionally with `--fail-on-error`) in CI/pre-deploy to enforce it. On the
  331-function project this cut `pikku all` from ~15.3s to ~9.6s.

  Also: the `all` command now reads back the run's recorded per-step durations and,
  under `PIKKU_TIMING=1`, prints a slowest-first timing table — making it easy to
  see where codegen time goes without adding any hot-path instrumentation.

- 04604fa: Mount /mcp in generated server/standalone entries when the unit has a non-empty mcp.gen.json. Previously only the dev server (`tsx src/server.ts`) mounted MCP; the deployed bundle (`pikku deploy plan`) never imported mcp.gen.json or passed `mcpJson` to `PikkuNodeHTTPServer`, so MCP tools/resources/prompts silently never served in production or standalone runtimes.
- Updated dependencies [4be205f]
- Updated dependencies [41ff485]
- Updated dependencies [d2078c8]
- Updated dependencies [061c717]
- Updated dependencies [5c0ff0f]
- Updated dependencies [2c55e13]
- Updated dependencies [c745c26]
- Updated dependencies [e6fd12b]
- Updated dependencies [244d892]
- Updated dependencies [940c253]
- Updated dependencies [57900b5]
- Updated dependencies [72694f6]
  - @pikku/core@0.12.39
  - @pikku/inspector@0.12.27
  - @pikku/kysely@0.12.18

## 0.12.54

### Patch Changes

- 5d25125: feat(dev): `pikku dev` serves over the bun runtime when the CLI runs under bun

  When the Pikku CLI itself runs under bun (e.g. the compiled `brew install`
  binary), `pikku dev` now serves over `@pikku/bun-server` (native `Bun.serve`
  WebSockets) instead of the node http server + `ws` package. The bun server is
  dynamically imported and gated on `typeof Bun !== 'undefined'`, so a node-run
  CLI is unaffected and keeps using `@pikku/node-http-server`. The dev server
  shares one `BunEventHubService` between the singleton services and the
  WebSocket transport so channel broadcasts reach connected sockets.

- e443e94: feat(deploy): standalone provider can target the bun runtime

  `pikku deploy plan|apply --provider standalone --runtime bun` now generates a
  `@pikku/bun-server` entry (native `Bun.serve` WebSockets, no `ws` package) and
  compiles the bundle into a single self-contained executable via
  `bun build --compile` — no runtime needed on the target host. The default
  remains `--runtime node`, which is unchanged (ships `bundle.js`, run with
  `node bundle.js`).

  `PikkuBunServer` now accepts an injectable `eventHub` in its options. Inject the
  same `BunEventHubService` you pass to `createSingletonServices` so functions and
  the WebSocket transport share one hub — otherwise a function's
  `eventHub.publish(...)` targets a different hub than the one holding the live
  sockets and broadcasts never reach connected clients. The standalone bun entry
  and the `bun` template now wire this shared hub, fixing cross-connection /
  cross-transport channel pub-sub on bun.

  Also removes the unused `@yao-pkg/pkg` dependency and its stale type shim from
  `@pikku/deploy-standalone` (the pkg-based binary path was dropped in #489).

- Updated dependencies [d5c3c85]
- Updated dependencies [e443e94]
- Updated dependencies [92cd5b1]
  - @pikku/bun-server@0.12.1
  - @pikku/core@0.12.38
  - @pikku/kysely@0.12.17

## 0.12.53

### Patch Changes

- 14ee8e4: fix(react-query): usePikkuInfiniteQuery feeds the page cursor back as `cursor`

  The generated `usePikkuInfiniteQuery` injected the next-page cursor into the
  request under the key `nextCursor`, but a list function built with
  `pikkuListFunc` accepts the cursor as `cursor` (the `ListInput` field) and only
  returns `nextCursor` on the output. So every page re-sent `cursor: undefined`
  and the hook re-fetched page 1 forever. Feed `pageParam` back in as `cursor`
  (and omit `cursor` from the caller's `data` arg) so it lines up with
  `ListInput`/`ListOutput`. The output read in `getNextPageParam` is unchanged.

- 2989738: docs(skills): add negative-trigger scoping to the two n8n skills

  `pikku-n8n-addon-map` and `pikku-n8n-code-translate` were the only
  non-deprecated skills whose descriptions had no "DO NOT TRIGGER when:"
  clause, so an agent could load the wrong one (or load either for plain
  hand-written code). Each description now scopes itself out of the other's
  territory: integration/service stubs → addon-map, Code node stubs →
  code-translate, and neither fires when no n8n-generated stub is involved.

- Updated dependencies [e6bb2d6]
  - @pikku/node-http-server@0.12.3
  - @pikku/deploy-cloudflare@0.12.6

## 0.12.52

### Patch Changes

- ed548d5: fix(auth): skip the generated global `betterAuthSession()` when the user registers their own

  The CLI's `auth.gen.ts` unconditionally wired a global
  `addHTTPMiddleware('*', [betterAuthSession()])` (default map) on the stateful
  path. A project that needs a customized session bridge — `mapSession`,
  `impersonation`, `apiKey` — had to register a second global
  `betterAuthSession({...})`, leaving two in the chain; the generated default ran
  first and short-circuited (`if (session) next()`) so the custom one never took
  effect.

  The inspector now records `state.auth.hasUserSessionMiddleware` when it sees a
  user-authored **global** `betterAuthSession` registration (route-scoped and
  `.gen.ts` registrations are ignored, so regeneration never self-suppresses).
  The CLI omits its own global `betterAuthSession()` from `auth.gen.ts` when that
  flag is set — exactly one session bridge in the chain, the user's. Mirrors the
  existing stateless skip (`userStatelessSession`, #754).

- Updated dependencies [a3f55de]
- Updated dependencies [ed548d5]
  - @pikku/better-auth@0.12.12
  - @pikku/inspector@0.12.26

## 0.12.51

### Patch Changes

- d76d50f: feat(deploy): inject platform services into `target: 'server'` container entries

  The generic server (container) entry booted the user's
  `createSingletonServices(config)` with no platform injection, so a container
  that relies on a platform-provided service (kysely from `DATABASE_URL`, secrets
  from `PIKKU_SECRET_KEK`, …) 500s on first access — the provider's contributors
  only ran in the serverless worker entries.

  The provider adapter gains an optional `generateServerEntrySource(ctx)`; the
  build pipeline now prefers it over the provider-agnostic generator for server
  units. The Cloudflare adapter implements it to emit a `@pikku/node-http-server`
  entry that runs the same contributor-driven `createPlatformServices` as its
  workers — sourcing bindings from `process.env` and merging the result into
  `createSingletonServices` exactly like `setupServices` does on the worker. The
  CF-runtime service blocks (queue/workflow/AI) are omitted since a Node
  container carries no such Worker bindings. Providers that don't implement the
  hook fall back to the unchanged generic generator.

- Updated dependencies [6f06813]
- Updated dependencies [d76d50f]
  - @pikku/fetch@0.12.5
  - @pikku/deploy-cloudflare@0.12.5

## 0.12.50

### Patch Changes

- dac22cd: fix(cli): default Fabric API URL to production

  The fabric CLI defaulted `DEFAULT_API_URL` to `http://localhost:7103`, so
  `pikku fabric login` / `pikku fabric addon publish` hit a local backend
  out of the box — producing confusing "Code not found" / 404 errors for
  anyone not running fabric-api locally. Default to
  `https://api.pikkufabric.com`; local dev opts in via `FABRIC_API_URL` or
  `pikkufabric.config.json` (both rank above the default in the resolution
  order, so nothing changes for core devs).

- a1acc23: fix(console): make the Tests tab show scenarios after a run

  The Tests tab renders scenarios from `meta.functions[].tests.scenarios`, which
  `readAllMeta()` builds by reading the function-tests harness's coverage JSON and
  Cucumber HTML report. Three drifts left every function with `tests: undefined`:
  - **`loadFunctionTests` looked in the wrong place.** It probed
    `function-tests/coverage/function-coverage.json` and
    `function-tests/tests/reports/cucumber-report.html`, but the harness (and
    `pikku tests coverage`) actually write `tests/.coverage/function-coverage.json`
    and `tests/tests/reports/cucumber-report.html`. It now anchors on
    `resolveFunctionsDir(metaService.basePath)` — the same single source of truth
    the run handlers and coverage writer use — and keeps the old relative paths as
    a fallback.
  - **The console "Run tests" stream never wrote the HTML report.** It ran
    Cucumber with `--format message` only (for the live view), so scenarios
    vanished once the run finished. It now also emits
    `html:tests/tests/reports/cucumber-report.html`.
  - **`pikku tests coverage` had the same gap** — no `--format`, so no report.
    It now writes the HTML report alongside the default progress output.

- 49cba1e: fix(cli): auto-construct the AI agent runner in `pikku dev`

  Deployed agent units get their `aiAgentRunner` wired by the bundler, but the dev
  server had no equivalent — so agents run against `pikku dev` (e.g. in a fabric
  sandbox) threw `AIProviderNotConfiguredError` and surfaced as a 503. The dev
  command now builds a `VercelAIAgentRunner` from env when an OpenAI-compatible
  base URL + key are present (`OPENAI_BASE_URL`/`OPENAI_API_KEY`, falling back to
  `LITELLM_PROXY_URL`/`LITELLM_API_KEY`) and injects it into the singleton
  services. `@pikku/ai-vercel` + `@ai-sdk/openai-compatible` are resolved from the
  project's `node_modules` (so they share the project's `ai` version) and loaded
  dynamically; when the env or packages are absent the runner is simply omitted
  and the clear downstream error is preserved.

- 44f77c4: feat(deploy): server-target container image uses `FROM node:26` (full)

  The generated `SERVER_DOCKERFILE` for `target: 'server'` units now builds on
  the full `node:26` image instead of `node:22-slim`. A server container is a
  real Node runtime that may pull externalised deps with native addons; the slim
  image lacks the build toolchain (python3/make/g++), so any dep that compiles
  from source at `npm install` time would fail. The full image carries the
  toolchain and bumps the runtime to Node 26.

- 11bcae0: db codegen: type SQLite `CHECK (col IN ('a','b',…))` columns as string-literal
  unions, and emit a standalone bare-enums module for both dialects.

  SQLite has no native enums, but a column-level `CHECK … IN (…)` constraint is an
  enum by another name — the introspector now parses it from the table DDL and the
  generated Kysely schema types the column as `'a' | 'b' | …` instead of `string`
  (mirroring how Postgres enum columns are typed). Only the positive `col IN (…)`
  form is recognised; `NOT IN`, ranges, and boolean expressions stay `string`.

  Also emits `.pikku/db/enums.gen.ts` — bare `export type <Table><Column>` unions
  for every enum column (Postgres native enums and SQLite CHECK alike), independent
  of the wrapped `ColumnType<Private<…>>` DB interface. Callers (and i18n catalog
  reconciliation) can import a clean union without unwrapping.

- Updated dependencies [7d959ed]
  - @pikku/better-auth@0.12.11

## 0.12.49

### Patch Changes

- 5e594dd: fix(fabric-validate): require scaffold surfaces and gitignore generated artifacts

  `pikku fabric validate` now checks the project's `pikku.config.json` `scaffold`
  block for the public surfaces the Fabric console depends on: `console`, `rpc`,
  `agent` and `workflow` are errors (each gates HTTP/RPC endpoints the console
  calls directly — e.g. a missing `agent` 404s `/rpc/agent/:agentName` and a
  missing `workflow` 404s `/workflow/:workflowName/start`), and `events` is a warn
  (the realtime channel is feature-dependent). It also warns when `.gitignore`
  does not ignore the regenerated artifacts `.opencode`, `.pikku`, `.pikku-runtime`,
  `__fabric_scaffold.vite.config.mjs`, and generated files (`*.gen.*`, or the
  `*.gen.ts` + `*.gen.js` pair).

## 0.12.48

### Patch Changes

- b6ba601: fix(lint): don't flag pikkuAuth's session param as a non-destructured wire

  `pikkuAuth`'s handler is `(services, session)` — the second parameter is the
  resolved user session, not a wires bag. The inspector was extracting "wires"
  from that parameter (`extractUsedWires(handler, 1)`), so a permission like
  `pikkuAuth(async ({ logger }, session) => !!session)` tripped
  `wiresNotDestructured` even though `session` cannot be destructured. pikkuAuth
  exposes no user-facing wires parameter, so no wires meta is recorded for it.

- cac0380: Fix generated email renderer hash typing for generic template names.
- fa7a09c: Add gateway metadata generation and display enabled gateways in the console.
- 1de0ea4: Default `servicesNotDestructured` and `wiresNotDestructured` lint rules to `'error'`

  Both rules now fail the build by default. A non-destructured `services`/`wire` param hides which services/transports a function uses (defeating tree-shaking) and usually masks a missing type behind a cast that silently drifts. The whole `wire` is never genuinely needed — destructure the transport you use (`{ rpc }`, `{ http }`, `{ channel }`). Projects can override either rule to `'warn'`/`'off'` in `pikku.config.json`.

- decdad5: fix(lint): don't fail the build on framework-synthesized functions

  The `servicesNotDestructured`/`wiresNotDestructured` defaults (`error`) were
  tripping on functions the user can't edit: generated `.gen.ts` wrappers (the
  opaque `authHandler`, the cli channel raw dispatcher) and synthetic route→addon
  bridges (`http:<method>:<route>`, no source file). `computeDiagnostics` now skips
  any function without a real, non-generated source file, so the lint only nudges
  hand-written user code. Also destructures the CLI's own `all` command.

- Updated dependencies [b6ba601]
- Updated dependencies [ae7fc5d]
- Updated dependencies [fa7a09c]
- Updated dependencies [decdad5]
  - @pikku/inspector@0.12.25
  - @pikku/core@0.12.37

## 0.12.47

### Patch Changes

- 25a1f6d: Make the function-test harness work for monorepo + engine-aware projects:
  - `@pikku/addon-console`: the Run-tests and coverage handlers now resolve the
    functions dir robustly (`<root>/packages/functions` when present), and
    `getFunctionCoverage` reads the actual coverage output path
    (`tests/.coverage/function-coverage.json`) instead of a stale
    `function-tests/coverage/...` path — so the console's coverage button works in
    monorepo sandboxes.
  - `@pikku/cli`: `pikku tests init` now detects the db engine (`db/sqlite` /
    `db/postgres`) and points the harness at the correct migrations + seed
    (`db/<engine>` + `db/<engine>-seed.sql`) instead of the hardcoded
    `db/migrations`. It also scaffolds a green starter `example.feature` and an
    empty `yarn.lock` (so the standalone tests package installs under Yarn Berry).
    Postgres harness support is tracked in #758.
  - `@pikku/cucumber`: `createDbUtils.buildBaseDb` tolerates a missing/empty
    migrations dir or seed file instead of crashing on `scandir('')`.

- Updated dependencies [7c0b318]
- Updated dependencies [f6adc1c]
- Updated dependencies [ade6f0b]
  - @pikku/better-auth@0.12.10
  - @pikku/core@0.12.36
  - @pikku/fetch@0.12.4

## 0.12.46

### Patch Changes

- 5fe3f47: fix(better-auth): skip the auto-generated stateless session middleware when the
  project registers its own. Closes #754.

  With `session.cookieCache` enabled the CLI generates a global
  `betterAuthStatelessSession()` using the default `{ userId }` map. Because session
  middleware short-circuits once a session is set (`if (session) next()`) and the
  generated file is imported before user wirings, that default-map middleware ran
  first and **pre-empted** a project's own `betterAuthStatelessSession({ mapSession })`
  — silently dropping custom session fields (`role`, `locale`, …).

  The inspector now detects a user-owned global registration (a
  `betterAuthStatelessSession(...)` call inside `addGlobalMiddleware` or the global
  form of `addHTTPMiddleware` — the array form or the `'*'` pattern, not a
  route-scoped `addHTTPMiddleware('/path', …)`; ignoring `.gen.ts` files and bare
  standalone calls) and
  sets `state.auth.userStatelessSession`. When set, the CLI skips writing
  `auth-middleware.gen.ts` (and removes a stale one) so the project's own middleware
  — with its custom `mapSession` — is the only one registered. Projects without a
  custom map are unaffected: the default middleware is still generated.

- ef473b4: `pikku fabric validate`: warn when a frontend `apps/<name>` does not declare
  `@babel/core` in its devDependencies. The scaffolded dev vite config (from
  generate-frontend-runtime) imports `@babel/core` to tag JSX with `data-om-id`
  for design alt-click editing; it only resolves transitively via
  `@vitejs/plugin-react`, so declaring it explicitly stops that resolution from
  silently drifting away and breaking the instrumentation.
- 67ef7b7: `pikku fabric validate`: convergence checks for the canonical frontend stack. Every React app must ship **Paraglide JS** (inlang) for i18n — `@inlang/paraglide-js` plus a wired `messages/<locale>.json` + `project.inlang/settings.json`, with strings routed through `m.*()` / `useLocale()` from the `@/i18n` scaffold. The i18next → Paraglide cutover is hard (no back-compat): a residual `i18next`/`react-i18next` dependency, or a leftover `useTranslation()`/`useI18n()` call or `i18next` import, is now an error. Apps must still import Mantine components from `@pikku/mantine/core` (not raw `@mantine/core`, which bypasses the i18n-typed compile gate), and each module-singleton-sensitive dep (vite, @tanstack/start-plugin-core, react, react-dom) must resolve to a single physical copy (a second copy splits TanStack Start dev SSR and 404s the frontend).
- 6b70ec4: feat(fabric-validate): warn when better-auth units won't tree-shake. `pikku
fabric validate` now flags two anti-patterns that force every non-auth unit to
  bundle the full better-auth server (~2.5MB each, bloating bundles and the serial
  deploy uploads): (1) a `pikkuBetterAuth` config that doesn't enable
  `session.cookieCache` — fix by adding `session: { cookieCache: { enabled: true } }`
  so the CLI splits out the lean `betterAuthStatelessSession`; and (2) a
  hand-written global `addHTTPMiddleware('*', [betterAuthSession()])` that pulls the
  stateful bridge into every unit. Both are `warn` severity. Note: a custom
  `mapSession` is currently pre-empted by the generated stateless middleware
  (pikkujs/pikku#754), so the stateful workaround stays valid until that's resolved.
- 33157b9: perf(deploy): minify every deploy bundle (~50% smaller workers)

  The per-unit deploy bundler ran esbuild with `minify: false` — the unminified
  output shipped straight to the runtime (CF Workers / server container), even
  though tsc/esbuild, not the runtime, does the bundling. Enabling `minify: true`
  halves every unit's `bundle.js` (e.g. a DB-backed HTTP unit 1205KB → 722KB,
  auth-handler 2167KB → 1067KB), which directly cuts the serial CF upload time on
  deploy. `keepNames: true` preserves `Function.name` / `constructor.name` so any
  name-based reflection keeps working. Verified against the cloudflare deploy
  verifier: 21/21 checks pass, total unit bytes 50.3MB → 29.0MB.

- 3ba12ca: Stop consumed-addon parent services from polluting every per-unit deploy bundle, and stub the AI SDKs out of non-agent units.

  `aggregateRequiredServices` added `addonRequiredParentServices` (the services a consumed addon needs from its parent — e.g. `aiAgentRunner`, `deploymentService`, `metaService`) to **every** unit's `requiredServices` unconditionally. For any project that consumes an addon, this marked those services required on all units, so the per-unit service tree-shaking (and the gen-file/module stubs that key off the `false` flags) never fired — every unit shipped the full set. These parent services are now added only to units that actually deploy an addon function (its `pikkuFuncId` appears in `usedFunctions`); a unit that only calls the addon over RPC, or never touches it, no longer carries them.

  On the back of the now-honest flags, the bundler stubs the AI SDK packages (`@pikku/ai-vercel`, `@ai-sdk/*`, `ai`) out of any unit where `aiAgentRunner` is not required, via a new service→module stub map alongside the existing gen-file stub map. The shared services factory must guard runner construction behind a defined-check on the dynamic import so a stubbed unit simply skips building the runner.

- 5905864: perf(deploy): stub the Postgres driver out of Cloudflare worker bundles

  Templates construct their Kysely instance from `DATABASE_URL`, branching on the
  URL scheme: a `postgres://` URL pulls in `postgres` + `kysely-postgres-js`, any
  other URL uses the libsql/Turso dialect. On Cloudflare the URL is always libsql,
  so the Postgres branch is never taken — yet esbuild still inlined the Postgres
  driver (~40KB+) into every worker bundle as dead weight.

  Adds a `getStubModules()` provider hook (mirroring `getExternals()`): regex
  sources for modules the provider's runtime never executes, stubbed to `export {}`
  during bundling. The Cloudflare adapter returns `^postgres$` + `^kysely-postgres-js$`.
  Unlike `getExternals`, a stub removes the bytes entirely instead of leaving a
  bare runtime import to resolve. Applied to worker units only (the server
  container keeps Postgres, since it's a real Node process that may use it).
  Verified: cloudflare deploy verifier 21/21; a `postgres` import bundles to 48
  bytes (was 38,032) once stubbed.

- Updated dependencies [5fe3f47]
- Updated dependencies [3ba12ca]
- Updated dependencies [5905864]
  - @pikku/inspector@0.12.24
  - @pikku/deploy-cloudflare@0.12.4

## 0.12.45

### Patch Changes

- 807a8d0: Add `refHTTP` / `refChannel` / `refCLI` so a consumer can wire an addon's HTTP routes, channel actions, and CLI commands directly from the addon's published `.pikku` contract metadata — no addon source is imported and nothing is hand-wired. These mirror the existing `ref('namespace:fn')` helper: each reference resolves the addon's already-loaded contract (via `wireAddon`) and proxies every function through `ref()` (RPC) at runtime.
  - **Inspector:** `wireHTTPRoutes`/`wireChannel`/`wireCLI` now expand `refHTTP('ns:contract')` / `refChannel('ns:contract')` / `refCLI('ns:contract')` call expressions against `state.exportedContracts.addon{Http,Channel,Cli}` (already namespaced and `packageName`-tagged by `loadAddonFunctionsMeta`). An optional second argument overrides the mount basePath, e.g. `refHTTP('ext:helloRoutes', { basePath: '/ext' })`; otherwise the addon contract's own basePath is preserved.
  - **CLI codegen:** the generated `pikku-function-types.gen.ts` now emits `refHTTP`/`refChannel`/`refCLI` (exported through `#pikku`) backed by const maps built from each wired addon's contract metadata, with every function pre-bound to `ref('ns:fn')`. Type-checking and runtime wiring resolve from the same generated artifact, so a reference can never be an inert marker.
  - **Addon authoring bans:** when inspecting an addon package (`isAddon`), the inspector now raises a critical error if the addon calls a transport wiring helper (`wireHTTP`/`wireHTTPRoutes`/`wireChannel`/`wireCLI`/`wireScheduler`/`wireQueueWorker`/`wireMCPPrompt`/`wireMCPResource`/`wireTrigger`/`wireTriggerSource`/`wireGateway`/`wireAddon`) — these are the consuming app's responsibility (`PKU920`) — or if a `define*` contract carries `middleware`/`permissions`, which the consuming app applies, not the addon (`PKU921`). Service declarations (`wireSecret`/`wireVariable`/`wireCredential`) and function-level middleware/permissions remain allowed.
  - **Deploy-bundle fix:** the HTTP/channel/CLI codegen commands now always emit their wiring and meta gen files once they report the category as active (truthy return), including the contracts-only or synthetic-route case where there are no local `wireHTTP`/`addChannel`/`wireCLI` source files. The generated bootstrap imports those files unconditionally, so skipping them left per-unit deploy bundles (e.g. Cloudflare units for scheduled tasks and workflow steps) unable to resolve `pikku-http-wirings.gen.js` and failing to build.

- Updated dependencies [807a8d0]
  - @pikku/inspector@0.12.23

## 0.12.44

### Patch Changes

- d64fbd9: db migrate: stub secrets during Better Auth schema introspection. The drift check
  loads the app's auth factory only to derive the table/column shape, so it no longer
  requires the app's real secrets (e.g. `BETTER_AUTH_SECRET`) to be present in the
  environment — a fake secret service resolves every key to a placeholder.
- 8e72c93: `pikku fabric publish` now packs with `npm pack` (honouring the package's `files` field and matching a normal install's layout) instead of a hand-rolled tar. `pikku fabric add` installs the artifact into the project's `node_modules/<package-name>/` — the location `wireAddon({ package })` resolves via `require.resolve` — stripping npm's `package/` prefix, instead of copying source into `src/addons/<id>/` where it could not be wired.
- 8e72c93: Add `pikku fabric publish [dir]` and `pikku fabric add <id>` for the Fabric community registry. `publish` packs a package directory into an artifact and uploads it via a short-lived presigned URL (authenticated; attributed to the publisher's org or person). `add` resolves a public presigned download and copies the package source shadcn-style into `addons.addonDir` (new `pikku.config.json` config, default `src/addons`).
- d0f5648: fix(cli): dev sqlite dialect now reads `INSERT ... RETURNING` rows. The node:sqlite-backed dialect set `reader` from `stmt.reader`, which node:sqlite always leaves undefined, so kysely ran returning-inserts via `.run()` and dropped the rows — breaking better-auth sign-up (it inserts a row and reads it back) with "Failed to create user". `reader` is now derived from the SQL (`SELECT` or `RETURNING`).

  feat(fabric-validate): warn when a better-auth `createAuthClient` baseURL omits the `/auth` segment. The Fabric edge (and the sandbox Caddy) keep the `/api` prefix for the better-auth unit, so the DEFAULT server basePath `/api/auth` is correct and needs no override. The real footgun is the client: better-auth appends the endpoint to baseURL verbatim, so a bare `/api` baseURL yields `/api/sign-in/email` (no `/auth`) and 404s. `pikku fabric validate` now warns and suggests `baseURL: \`${apiUrl()}/auth\``.

- b674ca7: fabric validate: enforce minimum @pikku/\* versions. `pikku fabric validate` now
  scans every workspace manifest and errors when a gated @pikku package is below
  the required floor (per-package, since the packages version independently). A
  stale @pikku/cli ships a `pikku dev` that hangs without ever listening, and a
  mismatched @pikku/core splits pikkuState into duplicate copies so app/console
  routes 404 — both are hard blockers for a Fabric sandbox, so they fail validate
  with a bump-and-reinstall fix hint.
- 6bca38f: docs(skills): add the `pikku-emails` skill documenting file-based email templates — directory layout, templating syntax, per-template typed variables, `pikku emails generate`, and rendering/sending through an EmailService.
- 6bca38f: fix(emails): scope generated template variables to each template. The email codegen fed every string in the shared locale file into every template's variable list, so a variable interpolated by one template's locale string (e.g. `inviterName` in an invitation subject) leaked into the typed `data` of unrelated templates. Variables are now collected only from the locale keys and partials each template actually references (transitively).
- 6645e7a: Add a severity model for coded diagnostics so security findings can surface without blocking the dev server.
  - `InspectorLogger` gains `diagnostic({ severity, code, message })` (`severity: 'warn' | 'error' | 'critical'`). `critical(code, message)` is now sugar for `diagnostic({ severity: 'critical', ... })`.
  - The CLI fails the build only on `critical` diagnostics by default. New global flags `--fail-on-error` and `--fail-on-warn` (implies `--fail-on-error`) opt into stricter gating; `--fail-on-critical` is always on.
  - Data-classification leaks (`PKU910`) are now emitted at `error` severity instead of `critical`. They are still printed, but no longer abort `pikku all` / the dev server — pass `--fail-on-error` (e.g. at deploy) to make them blocking and recommend a fix.
  - Contract-immutability drift (`PKU861`) during `pikku versions update` (run inside `pikku all`) no longer calls `process.exit(1)`. It is surfaced as an `error` diagnostic and skips saving the manifest, so a stale baseline can't crash-loop the dev server. `pikku versions check` remains the hard gate, and `--fail-on-error` makes `pikku all` block on it at deploy.

- 02a4499: `pikku fabric validate` now flags a missing `scaffold.console` in `pikku.config.json`. Without it the console addon's introspection RPCs (`console:getFunctionsMeta`, `console:getAllMeta`, …) are never scaffolded, so tools that introspect a running app (e.g. the Fabric sandbox builder) hit 404s and show no functions. The fix hint suggests `"console": "no-auth"` (or `"auth"`).
- Updated dependencies [06234a9]
- Updated dependencies [8e72c93]
- Updated dependencies [6645e7a]
- Updated dependencies [6bca38f]
  - @pikku/inspector@0.12.22
  - @pikku/core@0.12.35

## 0.12.43

### Patch Changes

- ef50347: Tree-shake the better-auth server out of non-auth units.
  - `@pikku/better-auth`: add `betterAuthStatelessSession()` — a session middleware that verifies the signed better-auth cookie cache via `better-auth/cookies` (`getCookieCache`) using only `BETTER_AUTH_SECRET`, with no `services.auth()`, DB round-trip, or full server import. Mark the package `sideEffects: false` so unused barrel re-exports drop.
  - `@pikku/cli`: when `session.cookieCache` is enabled in the better-auth config, generate the stateless session middleware into a separate `auth-middleware.gen.ts` and wire it globally, keeping the full `/api/auth/**` server only in the auth unit. Deploy artifacts (esbuild metafile + sourcemap) are now off by default; `--debug-artifacts` re-enables them.
  - `@pikku/inspector`: ensure the orphan `auth-middleware.gen.ts` (imported by nothing) is still inspected so its global `addHTTPMiddleware('*')` registration is not dropped.

  Net effect: a non-auth unit carries ~22KB (cookie-verify floor) instead of the full ~1.25MB better-auth backend.

- Updated dependencies [ef50347]
  - @pikku/inspector@0.12.21
  - @pikku/better-auth@0.12.9

## 0.12.42

### Patch Changes

- c16676f: Use an embedded PGlite instance for the Better Auth drift-detection scratch database in `pikku db migrate`, instead of issuing `CREATE DATABASE` against the target Postgres. Creating a real scratch database required the `CREATEDB` privilege, so `pikku db migrate` failed (error 42501) against managed or locked-down Postgres where the application role correctly lacks it. PGlite is real Postgres, so schema introspection stays accurate while needing no server privileges.
- 33e7750: `pikku fabric link` now returns and logs the linked project's id (`projectId=<uuid>`) alongside its slug. Previously only the slug was emitted, forcing callers (and the e2e harness) to do a follow-up lookup to resolve the project id before operating on it (e.g. requesting a sandbox).
- fda377d: Add `pikku fabric smoke` for clean-room Fabric validation and make its readiness checks work with localhost-bound dev servers.

## 0.12.41

### Patch Changes

- 2eaa9fd: feat(cli,better-auth): unified machine + human auth (pikku login + api-key)

  A single better-auth-backed model for authenticating CLIs and machines.
  - **Human**: `pikku login` / `logout` / `whoami` run a device-authorization flow
    and persist a session at `~/.pikku/session.json` (0600, keyed by base URL, with
    expiry).
  - **Machine**: `betterAuthSession()` gains a stateless api-key branch — it resolves
    scope via `verifyApiKey` (not `getSession`, which drops metadata) and is
    authoritative when the `x-api-key` header is present.
  - **Auto-wire**: generated channel CLI clients attach the credential on the WS
    upgrade handshake (`PIKKU_API_KEY` → `x-api-key`, else the stored token →
    `Bearer`), so `betterAuthSession` resolves before the channel opens.

  `@better-auth/api-key` is a separate official package (not in the better-auth
  plugins barrel); peer-requires `better-auth ^1.6.19`.

- Updated dependencies [2eaa9fd]
- Updated dependencies [2eaa9fd]
  - @pikku/better-auth@0.12.7
  - @pikku/core@0.12.34

## 0.12.40

### Patch Changes

- f6a32db: Fix `pikku deploy plan/apply` failing when `outDir` differs from `rootDir/.pikku`.

  `build-pipeline` was hardcoding `pikkuDir = join(projectDir, '.pikku')`, ignoring
  the `outDir` config option. Projects that set a custom `outDir` (e.g. a monorepo
  where sources live in a sub-package) would get a build error:
  `Could not resolve "../../../.pikku/pikku-bootstrap.gen.js"`.

  `pikkuDir` now falls back to `join(projectDir, '.pikku')` only when `outDir` is not set.

- 50a96f8: Improve Fabric validation fix hints for coding agents and add `lineBreaks` plus numeric `Text` children support in Mantine.
- d729cf8: Add embedded PGlite-backed Postgres support for local dev and DB commands when `db/postgres` is present without a configured `postgresUrl`, while keeping real Postgres as the explicit path when `postgresUrl` is set.
- Updated dependencies [5c67b7e]
- Updated dependencies [1b22977]
  - @pikku/core@0.12.33

## 0.12.39

### Patch Changes

- c871920: Fix Better Auth drift check incorrectly reporting tables as missing when they live in a non-public Postgres schema (e.g. `app.user` not matching desired `user`).
- 837c397: Fix a Better Auth schema-drift false positive in `pikku db migrate`. Better
  Auth's desired schema uses bare table names (`user`, `account`, …) while
  Postgres introspection returns schema-qualified names (`public.user`). The
  diff now falls back to matching a bare desired table against a uniquely
  schema-qualified introspected table, so a fully-migrated Postgres database no
  longer reports every auth table as missing (which aborted the migrate with a
  spurious "run `pikku db generate`").

## 0.12.38

### Patch Changes

- ee6d80f: Fix Better Auth schema introspection during `pikku db migrate` by using
  `LocalVariablesService` and `LocalSecretService` for the non-runtime auth
  factory context instead of a handwritten stub with the wrong variables
  interface shape.
- db2fe60: Honor Better Auth `database.type = "postgres"` when computing desired auth schema and drift.
- 5cd8929: Add a `startServerFnsFile` codegen option that emits a TanStack Start server-function shim.

  When set in `clientFiles`, the CLI generates a typed `makeApi(): PikkuRPC` caller over the generated RPC map for use in Start loaders, actions and components. The shim reads the API base URL from `import.meta.env.VITE_API_URL` (throws if unset) and imports the `PikkuRPC` class from `rpcWiringsFile`, so the import path is always correct relative to the app. Self-skips when `startServerFnsFile` is unset and warns when `rpcWiringsFile` is missing.

- 85e6c33: Update Fabric validation to respect `pikku.config.json` `db.engine` when
  checking migration layout and database adapter usage, and standardize Fabric
  project conventions on `pikkufabric.config.json` plus
  `packages/mantine-theme`.
- d7e1edb: Fix Postgres DB schema codegen for schema-qualified tables so `pikku db migrate`
  emits legal flat interface names like `InstitutionsCountry` instead of invalid
  dotted identifiers such as `Institutions.country`.
- e7fac23: Fix `INSERT ... RETURNING` statements being treated as write queries on Node.js 22+

  `node:sqlite`'s `StatementSync` has no `.reader` property (unlike `better-sqlite3`).
  The fallback SQL inspection only checked for `SELECT`, `WITH`, `PRAGMA`, `EXPLAIN`,
  and `VALUES` prefixes, so `INSERT ... RETURNING *` was incorrectly classified as a
  write query. Kysely then called `stmt.run()` (which discards rows) instead of
  `stmt.all()`, causing `INSERT ... RETURNING` to return no data — breaking
  `better-auth` user creation and any other query that relies on `RETURNING`.

  Fix: add `|| /\bRETURNING\b/.test(upper)` to the reader-detection heuristic so any
  statement containing a `RETURNING` clause is correctly dispatched to `stmt.all()`.

## 0.12.37

### Patch Changes

- ee48848: Replace `workspace:` protocol ranges in published dependency fields with literal
  version ranges. Our publish path (`changeset publish`) does **not** rewrite the
  workspace protocol, so these leaked verbatim into npm:
  - `@pikku/cli` declared `@pikku/better-auth: "workspace:*"` in `dependencies`,
    which shipped to `0.12.36` and made it uninstallable for any consumer that
    doesn't already pin better-auth (`@pikku/better-auth@workspace:*: Workspace
not found`).
  - `@pikku/mantine` declared `@pikku/react: "workspace:^"` in `peerDependencies`
    (leaked as a peer warning rather than a hard failure).

  Both now use literal caret ranges, matching every other `@pikku/*` dependency.
  A `scripts/check-no-workspace-protocol.mjs` guard now runs as a `validate-deps`
  CI job (and gates `yarn release`) to fail the build if a `workspace:` range ever
  appears in a published dependency field again (`devDependencies` are exempt —
  they are stripped on publish).

- Updated dependencies [6565b97]
- Updated dependencies [34f254e]
  - @pikku/kysely@0.12.16
  - @pikku/kysely-node-sqlite@0.12.2

## 0.12.36

### Patch Changes

- a027a8e: feat: emit auth provider + plugin metadata as `auth-meta.gen.json` for the console SSO page

  The enabled social providers and Better Auth plugins are now extracted statically
  and written to a generated `auth-meta.gen.json`, replacing the runtime
  `setAuthRegistry`/`getAuthRegistry` approach — so the console can show them without
  evaluating the Better Auth factory.
  - **inspector**: the `pikkuBetterAuth` inspector now reads the `plugins` array from
    the `betterAuth({ ... })` config and records each plugin id (the callee name of
    each `plugins: [organization(), bearer()]` entry) on the auth definition.
  - **cli**: `pikku auth` (and `pikku all`) emit `auth/pikku-auth-meta.gen.json` (path
    configurable via `authMetaJsonFile`) containing `basePath`, `hasCredentials`, the
    enabled `providers` (`id` + `displayName` + `secretId`), and the enabled `plugins`
    (`id` + `displayName`). The previous `setAuthRegistry(...)` runtime wiring is
    removed from the generated `auth.gen.ts`.
  - **better-auth**: exports a `PLUGIN_REGISTRY` and `pluginDisplayName(id)` helper so
    plugin ids resolve to human-readable names.
  - **core**: removes the unreleased `setAuthRegistry`/`getAuthRegistry` runtime auth
    registry (now superseded by `auth-meta.gen.json`).
  - **addon-console**: `getAuthProviders` reads `auth-meta.gen.json` and returns the
    configured providers, plugins, and `hasCredentials` flag.
  - **console**: the Auth Providers (SSO) page fetches `console:getAuthProviders` and
    marks each provider configured/unconfigured, lists email+password credentials as a
    provider, and shows the enabled Better Auth plugins.

- a027a8e: fix: typed secret/variables access in Better Auth factories + cucumber Actor cookie jar
  - **cli**: the generated `#pikku` `pikkuBetterAuth` wrapper now substitutes the
    project's generated `TypedSecretService` / `TypedVariablesService` for the base
    `secrets` / `variables` services (typed and wrapped at runtime, the same way
    addon services are). The auth factory can read provider secrets straight off
    the generated `CredentialsMap` — `socialProviders: { github: await
secrets.getSecret('GITHUB_OAUTH') }` — with no inline `getSecrets<{ ... }>()`
    generic. (Provider secrets are wired as before, from the `socialProviders`
    keys, so they appear in the credentials map.)
  - **cucumber**: `Actor` gains an additive cookie jar — `cookieFetch` (a
    `customFetchImpl` that replays stored cookies, stamps `Origin`, and captures
    `Set-Cookie`), plus `cookieHeader`, `storeSetCookie`, and `clearCookies`. This
    lets a cucumber actor drive a real cookie-backed session (e.g. the Better Auth
    client SDK) instead of hand-rolling a jar per suite. The existing JWT/bearer
    actor behaviour is unchanged.

- a027a8e: fix: address Better Auth review findings (secret/variable batch typing, auth init, guards)
  - **core**: `SecretService.getSecrets` / `VariablesService.getVariables` (and the
    Local/Typed/Scoped/AWS implementations) now return `Partial<T>`, honestly
    reflecting that missing keys are omitted at runtime rather than typing partial
    data as fully populated. `ScopedSecretService.getSecrets` now throws on a
    disallowed key instead of silently filtering it out.
  - **cli**: the generated `services.auth()` thunk clears its memoised promise on
    rejection, so a transient Better Auth/Kysely startup failure no longer
    permanently poisons auth for the process lifetime.
  - **inspector**: the `pikkuBetterAuth` export guard now requires an exported
    `const` (rejects `export let`/`export var`), matching its error message.
  - **console**: the Microsoft auth provider's `callbackId` is `microsoft` (the
    Better Auth provider id) rather than `microsoft-entra-id`.

- a027a8e: fix(cli): don't inspect during the cold bootstrap function-types pass

  `pikkuFunctionTypes` began calling `getInspectorState()` to decide whether to
  re-export the typed `pikkuBetterAuth` from the generated types hub. But it also runs
  as the cold bootstrap step whose job is to _write_ `.pikku/pikku-types.gen.ts`
  before any inspection happens — and a full inspect runtime-imports user files
  that themselves import that not-yet-written file, deadlocking on a cold `.pikku`
  (`pikku bootstrap` returned rc=1 with the types file missing; schema generation
  for a `wireSecret` schema failed with "Cannot find module
  .pikku/pikku-types.gen.js"). The function-types step now takes a `{ bootstrap }`
  flag (matching the other bootstrap type steps) so the cold pass skips inspector
  state entirely; the auth re-export is added on the later post-inspect pass where
  `.pikku` already exists.

- a027a8e: feat(cli): `pikku db generate` + Better Auth drift guard in `pikku db migrate`

  The Better Auth schema is owned by `pikkuBetterAuth`, not hand-written, so the
  committed SQL migrations can silently fall behind the auth config (a stale
  migration deploys a half-applied auth schema and `signUp` 500s at runtime).

  `pikku db generate` asks Better Auth for its required schema and, when the
  existing migrations don't yet cover it, writes a forward SQL migration. The
  schema is materialised by running Better Auth's own `runMigrations()` through the
  project's CamelCasePlugin kysely (so columns are snake_case), then drift is
  detected by introspection set-diff — never via `getMigrations`' field-level diff
  arrays, which compare its camelCase field keys against snake_case columns and so
  always report false drift.

  `pikku db migrate` now runs the same check after applying migrations and fails
  loudly ("run `pikku db generate`") if the applied schema doesn't satisfy what
  Better Auth requires, rather than letting the drift reach runtime.

  Generation is SQLite-only for now (table/column names are dialect-independent, so
  the drift _check_ works for postgres too; postgres migration emission is not yet
  automated). Incremental changes on top of an already-migrated auth schema are
  reported with the delta for a hand-written forward migration rather than emitting
  a full re-CREATE.

- a027a8e: feat(auth): migrate auth integration from Auth.js to Better Auth

  The auth integration is now built on [Better Auth](https://better-auth.com)
  and ships as a single package, `@pikku/better-auth` (replacing the former
  `@pikku/auth-js`). There is exactly one auth package now.
  - `pikkuBetterAuth(async ({ secrets, variables }) => betterAuth({ ... }))` is the new
    single entry point. The CLI inspects the `betterAuth(...)` call and generates:
    - `auth.gen.ts` — a catch-all `${basePath}{/*splat}` HTTP route per method and
      a global `betterAuthSession({ auth })` middleware that bridges the Better
      Auth session into the Pikku wire session.
    - `auth-secrets.gen.ts` — `wireSecret(BETTER_AUTH_SECRET)` plus a
      `<PROVIDER>_OAUTH` secret for each configured social provider, and
      `wireVariable` for non-secret provider config (e.g. `MICROSOFT_TENANT_ID`,
      `COGNITO_DOMAIN`/`REGION`/`USER_POOL_ID`).
    - `auth.types.ts` — a typed `pikkuBetterAuth` re-export.
  - `add-auth` (inspector) walks into the `betterAuth(...)` options to discover the
    configured providers and required secrets/variables.
  - The auth secret is now auto-wired by codegen from `BETTER_AUTH_SECRET` — it no
    longer needs to be registered as a JWT signing key in `services.ts`.

  CLI fix included: scaffold files generated outside `srcDirectories` (e.g. an
  `auth.gen.ts` under a project's `pikku/` dir) are now added to the inspector's
  wiring files, so their routes and secret metadata are picked up. The generated
  wiring imports Pikku types via a resolved relative path instead of a hardcoded
  `#pikku` specifier, so templates without a `#pikku` import map type-check.

- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
- Updated dependencies [a027a8e]
  - @pikku/inspector@0.12.20
  - @pikku/better-auth@0.12.6
  - @pikku/core@0.12.32

## 0.12.35

### Patch Changes

- 0909c1f: feat(db): source column classification + type info from `db/annotations.ts`

  `db/annotations.ts` is now the single source of column classification and type
  overrides. SQL-comment annotations (`-- @private`, `-- @date`, etc.) and
  name-based kind inference are removed — they were ambiguous and, for the
  sidecar, never actually wired up.
  - `ColumnEntry` now exposes `kind` (`date`/`bool`/`json`/`uuid`) and `tsType`.
    `tsType` is a general type override (not json-only) and wins over `kind`.
  - New `kind: 'uuid'` types a column as a transparent `Uuid` alias (structurally
    a string) and makes the zod codegen emit `z.uuid()`. Postgres native `uuid`
    columns are detected automatically (no annotation); SQLite has no native uuid
    type, so use `kind: 'uuid'`.
  - **Dialect-aware typing**: on Postgres, real temporal columns auto-type as
    `Date` from the introspected type (no annotation needed). On SQLite — which
    stores dates as TEXT — columns stay `string` unless `kind: 'date'` is set.
  - The codegen **warns (does not force)** on a name↔type contradiction the real
    type can prove, e.g. a `*_at` column that is actually `boolean` in Postgres.
  - Fixed two reasons the `annotations.ts` pipeline never worked: the sidecar was
    written to `.pikku/db/` but read from `db/` (now written beside the authored
    file in `db/`), and the `node --import tsx/esm` compile step silently fails on
    Node ≥ 23 (`ERR_REQUIRE_CYCLE_MODULE`) — replaced with an in-process esbuild +
    `vm` transpile. The sidecar is now compiled **before** codegen, so authored
    edits apply in a single `pikku db migrate` instead of one run behind.
  - **Postgres enum columns auto-type** as a string-literal union (e.g.
    `'admin' | 'user'`) with no annotation — resolved from the column's `udt_name`
    against the introspected enum types — and the zod codegen emits
    `z.enum([...])` (or `z.literal(...)` for a single value). SQLite has no native
    enum type; use `tsType: "'a' | 'b'"` there. Non-`public` Postgres schemas are
    not yet supported by the zod codegen.
  - New **`format`** field in `ColumnEntry` (`email`, `url`, `e164`, `ulid`,
    `cuid`/`cuid2`, `nanoid`, `jwt`, `emoji`, `base64`/`base64url`, `ipv4`/`ipv6`,
    `cidrv4`/`cidrv6`, `isoDate`/`isoTime`/`isoDatetime`/`isoDuration`). These are
    zod string-format **validators** — they refine the zod schema (`z.email()`, …)
    but keep the TypeScript type as `string`. A `format` applies only when the
    column's resolved select type is `string`; combining it with a `kind`/`tsType`
    that resolves to a non-string type (e.g. `kind: 'date'`) is ignored with a
    warning. Identical across both dialects (it is annotation-driven, not derived
    from storage).

## 0.12.34

### Patch Changes

- fe70fe0: fix(db): make classified columns usable in Kysely queries and emit real zod

  Two fixes so data-classified DB columns (`@private`/`@pii`/`@secret`, default
  `private`) are usable end-to-end instead of poisoning ordinary app code:
  1. **Brand marker is now optional** (`{ readonly __classification__?: ... }`)
     in both `@pikku/core` and the `pikku db migrate` schema header. A required
     marker made a plain value (e.g. `string`) unassignable to a branded column
     (`Private<string>`), breaking every Kysely `where`/insert/`.set()` operand —
     any project with classified columns failed to type-check. Optional keeps the
     brand structurally present (so the inspector's PKU910 output check still
     detects it) while letting plain values flow IN. The inspector's level read is
     now union-aware (`'pii' | undefined`) so pii/secret no longer silently
     downgrade to private.
  2. **Zod codegen resolves classified `ColumnType<>`** to proper scalars instead
     of `z.unknown()`. `pikku db migrate` emits `<Table>Z`/`InsertZ`/`PatchZ` from
     the Select slot, unwrapping the brand and honoring insert-optionality from the
     Insert slot's `| undefined`. Public `Generated<T>`/bare/nested shapes are
     unchanged.

- Updated dependencies [fe70fe0]
  - @pikku/core@0.12.31
  - @pikku/inspector@0.12.19

## 0.12.33

### Patch Changes

- 4d1f94a: fix(cli): emit global middleware side-effect imports in per-unit codegen

  `addGlobalMiddleware` registrations live only in `middlewareState.instances`
  (keyed `global:middleware:N`) with no associated wire group. The per-unit
  `--names` deploy filter strips the `state.http.files` fallback that
  `add-middleware` relies on, so a globally-registered middleware was never
  imported into deployed per-unit bundles and silently no-opped at runtime.

  `serializeMiddlewareImports` now emits a deduped side-effect import for each
  non-factory global instance into `pikku-middleware.gen.ts`, which the bootstrap
  always imports — guaranteeing global middleware registers in every unit.
  Duplicate imports in full builds are harmless (module bodies evaluate once).

- ccd9e27: Auto-mount the MCP server in PikkuNodeHTTPServer
- 409ec80: feat(console): Tests page with live SSE streaming and function test harness
  - `@pikku/addon-console`: add `streamFunctionTests` SSE function that runs the
    cucumber/c8 test harness and streams structured per-scenario events
    (scenario-start, step, scenario-done, done)
  - `@pikku/console`: TestsPage live run view — renders scenario names and step
    status in real time during a test run via SSE; adds `usePikkuSSE` hook and
    `showRunButton` prop
  - `@pikku/fetch`: add `subscribePikkuSSE` helper for typed server-sent event
    streams
  - `@pikku/cli`: wire SSE-returning functions through the console serialiser and
    RPC wrapper so the stream route is included in generated clients

- 20750fd: feat(workflow): decide step dispatch purely per-function

  Workflow step execution (inline vs queue dispatch) is now decided entirely by
  the step's function `inline` flag — the workflow-level / run-level `inline`
  meta no longer participates in per-step dispatch.
  - Steps default to **inline**, so a normally-started (queue-backed) workflow
    runs its whole chain in one orchestrator pass instead of one queue
    round-trip per step.
  - A function marked `inline: false` is dispatched via the queue (its own
    worker, retry isolation). When `inline: false` but no `queueService` is
    configured, the step falls back to inline and emits a `logger.warn` instead
    of silently swallowing the misconfiguration.
  - Removed the now-unused workflow-level `inline` from `WorkflowsMeta` /
    `WorkflowRuntimeMeta`, the inspector's workflow extraction, the DSL→graph
    converter, and the deploy analyzer / service inference (which now key off
    the per-function flag). Run-level `inline` is retained: it still controls
    whether a whole run executes in-process without queue infrastructure.

- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [ccd9e27]
- Updated dependencies [bc28e3b]
- Updated dependencies [409ec80]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30
  - @pikku/node-http-server@0.12.2
  - @pikku/fetch@0.12.3
  - @pikku/inspector@0.12.18

## 0.12.32

### Patch Changes

- 7a4a49d: fix(cli): emit global middleware side-effect imports in per-unit codegen

  `addGlobalMiddleware` registrations live only in `middlewareState.instances`
  (keyed `global:middleware:N`) with no associated wire group. The per-unit
  `--names` deploy filter strips the `state.http.files` fallback that
  `add-middleware` relies on, so a globally-registered middleware was never
  imported into deployed per-unit bundles and silently no-opped at runtime.

  `serializeMiddlewareImports` now emits a deduped side-effect import for each
  non-factory global instance into `pikku-middleware.gen.ts`, which the bootstrap
  always imports — guaranteeing global middleware registers in every unit.
  Duplicate imports in full builds are harmless (module bodies evaluate once).

- Updated dependencies [294e365]
  - @pikku/core@0.12.29

## 0.12.31

### Patch Changes

- cd51724: Default SQLite to `.pikku-runtime/dev.db` when `db/sqlite` directory exists and no db engine is configured in pikku.config.json.

## 0.12.30

### Patch Changes

- e108c30: Fix `pikku dev` startup ordering so generated bootstrap is loaded after `allWorkflow` regeneration instead of before it. This avoids stale bootstrap/module-state hangs during dev startup on projects with heavy generated wiring graphs.
- 5093725: runFunctionTests throws a descriptive error when tests dir is missing instead of returning null; db-codegen formatting reflow

## 0.12.29

### Patch Changes

- b6d3d8f: `pikku fabric validate` now warns when `.pikku/` is not listed in `.gitignore`. Generated codegen artifacts should never be committed as they bloat PRs and can cause stale-codegen issues.
- ec434c4: `pikku fabric validate` now errors when required Cloudflare deploy dependencies are missing from `packages/functions/dependencies` (not devDependencies):
  - `@pikku/schema-cfworker` — always required; injected into every worker entry
  - `@pikku/kysely` — always required; `secretContributor` imports `KyselySecretService` unconditionally
  - `@pikku/ai-vercel` + `@ai-sdk/openai-compatible` — required when the project declares agent units (detected via `.pikku/agent/pikku-agent-wirings-meta.gen.json`)

- 0db854e: Fix workflow DSL extractor treating `x = await workflow.do(...)` as a set-step when `x` was previously declared as `null`. The referenced function is now correctly registered in `invokedFunctions` and `internalFiles`, so it appears in the generated `pikku-functions.gen.ts`.
- 8249f6f: Fix `isStringLike` to unwrap type assertion expressions (`as T` / `<T>expr`) so that `workflow.do('step', 'rpcName' as any, data)` is correctly parsed as an RPC step rather than silently dropped as an inline step. Also removes the `as any` cast from the `Emails` step in `all.workflow.ts` now that the inspector handles it, and ensures `pikku all` generates email template artifacts.
- f373a87: Fix PKU910 classification semantics and Postgres annotation propagation.

  **Inspector (`@pikku/inspector`):**
  - `findPiiPaths()` now returns `ClassifiedField[]` (path + classification level) so `private`/`pii` and `secret` brands are distinguished
  - `Secret<T>` fields are blocked in the output of all exposed functions (sessioned or not)
  - `Private<T>` / `Pii<T>` fields are only blocked in sessionless functions — authenticated (sessioned) functions may return private-classified data to their callers

  **CLI (`@pikku/cli`):**
  - Fix missing `rootDir` in the Postgres `generateSchemaTypes` call — the annotations sidecar file (`db/annotations.gen.json`) was silently ignored during Postgres migrations, causing columns annotated `@public` to remain branded as `Private<T>` in the generated schema

- Updated dependencies [0db854e]
- Updated dependencies [8249f6f]
- Updated dependencies [f373a87]
  - @pikku/inspector@0.12.15

## 0.12.28

### Patch Changes

- abff78a: fix(fabric-validate): align migration path with local-db.ts (db/sqlite/ at project root, not packages/functions/db/migrations/) and warn when no migration creates the audit table. Document createInvocationAudit + createAuditedKysely in the pikku-services skill.
- 4b5c75b: feat(auth-js): wire OIDC config (issuer/tenantId) as variables, expand provider registry
  - Move `issuer` and `tenantId` out of the secret blob for OIDC providers (auth0, okta, azure-ad, keycloak, cognito, microsoft-entra-id) — they are public config URLs, not secrets. Now registered via `wireVariable` and loaded at runtime via `services.variables.get()`.
  - Expand provider registry from 13 to 31 providers: reddit, notion, instagram, zoom, figma, tiktok, threads, patreon, dropbox, bitbucket, hubspot, salesforce, atlassian, strava, keycloak, cognito, microsoft-entra-id added.
  - `serialize-auth-gen` emits `wireVariable({...})` declarations and `services.variables.get()` calls in the generated factory for OIDC providers.
  - Integration verifier exercises real `/auth/providers` endpoint with `LocalSecretService` + `LocalVariablesService`, including a spy test proving `services.variables.get('AUTH0_ISSUER')` is called at request time.

- ad970f3: Output coverage artifacts to `.coverage/` instead of `coverage/` so the directory is hidden by default and consistent with the `.gitignore` convention for generated outputs.
- 4b5c75b: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

- dd53def: **`pikku db migrate` now loads column classification annotations from a `db/annotations.gen.json` sidecar.**

  Projects can annotate database columns with visibility (`public` / `private` / `secret`) and classification (`pii`, `hash`, `token`, `encrypted`, `redact`) in a typed `db/annotations.ts` file. Running `yarn db:types` generates `db/annotations.gen.json` which `pikku db migrate` reads to brand columns in the emitted `schema.d.ts`.

  Changes:
  - `annotation-parser`: `loadAnnotations()` is now synchronous and reads `db/annotations.gen.json` via `readFileSync`/JSON.parse (compiled CLI cannot `import()` `.ts` files). Falls back to SQL comment parsing when the JSON file is absent.
  - `db-codegen`: `bareTableName()` strips schema prefixes (e.g. `app.user` → `user`) before looking up annotations, so postgres schema-qualified tables resolve correctly.
  - `db-codegen`: `Private<T>` and `Secret<T>` are emitted as transparent aliases (`= T`) so Kysely WHERE clause typing works without modification.
  - `annotation-parser`: `parseAnnotations` no longer sets `anonymize: null` when no strategy is present — the field is omitted entirely (it is optional).

- Updated dependencies [4b5c75b]
- Updated dependencies [4b5c75b]
  - @pikku/core@0.12.27
  - @pikku/inspector@0.12.14
  - @pikku/kysely@0.12.14

## 0.12.27

### Patch Changes

- 909eb25: Fix db migration directory detection in validators to use db/sqlite/ and db/postgres/ instead of db/migrations/

  Fabric validator now checks db/sqlite/ (Fabric always uses SQLite/libSQL). Workspace validator derives the migrations directory from createConfig — postgresUrl → db/postgres/, sqliteDb → db/sqlite/.

- Updated dependencies [909eb25]
  - @pikku/core@0.12.26
  - @pikku/kysely@0.12.13

## 0.12.26

### Patch Changes

- 665bdb0: Add end-to-end data classification for SQLite and Postgres projects.

  **Core (`@pikku/core`):** New `Private<T>` and `Secret<T>` intersection brands, `ClassificationManifest`, `ColumnClassification`, and `AnonymizeStrategy` types exported from `data-classification.ts`.

  **CLI (`@pikku/cli`):**
  - SQL comment annotations: `-- @public`, `-- @private[:strategy]`, `-- @secret[:strategy]` on `CREATE TABLE` columns and `ALTER TABLE ... ADD COLUMN` statements. Unannotated columns default to `private`.
  - `pikku db migrate` now emits a `classification.gen.ts` manifest alongside `schema.d.ts`.
  - New `pikku db audit` command — prints a per-column classification summary and warns on `private`/`secret` columns with no anonymize strategy.
  - Postgres dialect support in `resolveDb`, `PostgresMigrationExecutor`, and `PostgresIntrospector`.

  **Inspector (`@pikku/inspector`):** New PKU910 check — `findPiiPaths()` walks inferred function return types looking for `__pii__` brands (including inside `Array<T>`, `Record<K,V>`, and index signatures) and fails the build if a function exposes branded fields in its output.

- 3aaed21: Flatten `createConfig` dev fields: replace `dev: { db, content }` with top-level `sqliteDb: string` and `content: { contentPath?, uploadUrlPrefix?, assetUrlPrefix?, sizeLimit? }`.

  **Migration:** update your `createConfig` export:

  ```ts
  // before
  export const createConfig = pikkuConfig(async () => ({
    dev: { db: true, content: true },
  }))

  // after
  export const createConfig = pikkuConfig(async () => ({
    sqliteDb: '.pikku-runtime/dev.db',
    content: {},
  }))
  ```

  For test helpers that override the db path, replace `{ ...config, dev: { db: { file: dbFile } } }` with `{ ...config, sqliteDb: dbFile }`.

- Updated dependencies [665bdb0]
  - @pikku/core@0.12.25
  - @pikku/inspector@0.12.13

## 0.12.25

### Patch Changes

- 0bd0433: Add `db.engine` and `db.pgVersion` to the CLI config types, and make local env-backed secrets fall back to raw strings when JSON parsing fails.
- fbfe592: Fix Bun standalone CLI startup and local DB commands, add workspace-level validate, and verify the native binary against a real starter workspace.
- Updated dependencies [c02275f]
- Updated dependencies [0bd0433]
- Updated dependencies [55ba75a]
  - @pikku/core@0.12.24
  - @pikku/kysely@0.12.12

## 0.12.24

### Patch Changes

- d57a8ef: Fix race condition in `pikku dev` where hot-reload codegen replaced live user services with CLI-internal services.

  During a file-watch triggered re-run of `allWorkflow`, `runAllWithCommandState` unconditionally overwrote `singletonServices` with the CLI's own services object (which has `config` but no `kysely`, no content server, etc.). Any request that arrived during codegen — e.g. an auth callback — would crash because `kysely` was undefined.

  Fix: detect the hot-reload case (`previousSingletonServices` exists and differs from the CLI object), then build a hybrid — spread the live user services and overlay only `config` from the CLI. Codegen gets the paths it needs; concurrent requests continue to see the real services.

- Updated dependencies [8d09f12]
  - @pikku/core@0.12.23

## 0.12.23

### Patch Changes

- 265461b: Improve schema identifier sanitization in the CLI and prefer specific runtime error messages in HTTP error responses.
- Updated dependencies [265461b]
  - @pikku/core@0.12.22

## 0.12.22

### Patch Changes

- 9060165: Agents now declare their model directly as `<provider>/<model>` (e.g. `openai/gpt-4o`). The `models`, `agentDefaults`, and `agentOverrides` config blocks have been removed.

  **Migration:** replace any bare `model: 'alias'` values with the full provider-qualified form and remove those blocks from `pikku.config.json`.

- 9060165: New `pikku db migrate`, `pikku db seed`, and `pikku db reset` commands manage your database using a built-in `node:sqlite` migrator with dev-injection support.
- 9060165: The `pikku fabric` command group gains `deploy plan` and `deploy apply` subcommands (replacing `--dry-run`), plus new read-only commands: `deploy list`, `deploy units`, `status`, `errors`, and `db schema`. `deploy apply` prompts for confirmation before deploying; `--auto-apply` skips it.
- 9060165: New `pikku tests init` scaffolds a Cucumber BDD test harness in your functions package. The companion `@pikku/cucumber` package provides the world, hooks, step library, and database utilities — wiring real Pikku RPC dispatch against an in-process SQLite copy seeded from migrations. `pikku tests coverage` generates per-function coverage summaries, surfaced in the console.
- 9060165: The CLI is now available as a native binary via Homebrew (`brew install pikkujs/tap/pikku`) or as a direct download for macOS and Linux (arm64 + x64). On startup, pikku checks for newer versions and suggests an upgrade when one is available.
- 9060165: New realtime events system: `pikku realtime` generates a typed `PikkuRealtime` client that pairs with `PikkuRPC`. A `/events` channel can be scaffolded to fan out server events to subscribers over SSE. `pikku dev` wires `LocalEventHubService` automatically so realtime works out of the box locally. The React provider exposes `PikkuRealtime` alongside `PikkuRPC`.
- 9060165: Set `startServerFnsFile` in `clientFiles` to generate a typed `makeApi(): PikkuRPC` caller for use in TanStack Start loaders, actions, and components.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21
  - @pikku/inspector@0.12.12
  - @pikku/kysely-node-sqlite@0.12.1
  - @pikku/fetch@0.12.2
  - @pikku/node-http-server@0.12.1
  - @pikku/deploy-cloudflare@0.12.3

## 0.12.21

### Patch Changes

- d3bcadc: Emit `pikkuListFunc` and `PikkuListFunction` in generated `pikku-types.gen.ts` so list-style function typing can be expressed without manually wrapping `ListInput`/`ListOutput`.
- a3d041c: Add `--output json`/`--json` CLI support to emit NDJSON logs with timestamped structured entries, including critical errors and redirected command console output.
- 360e594: Fix generated `RPCInvoke` and `RPCRemote` typing to use stricter void-input detection.

  The generated helpers now treat only true voidish inputs (`void | null | undefined`) as omittable and avoid misclassifying `any` inputs as voidish, so non-void RPCs keep a required `data` argument.

- d6e1289: Make `pikku versions update` fail when immutable contract drift is detected (`FUNCTION_VERSION_MODIFIED`) instead of exiting successfully.

  This ensures CI can reliably fail on published-version contract modifications and prevents silent success when the manifest is intentionally not updated.

- b9ed73e: Add deterministic workflow planned-step metadata support and SSE init stream payload generation.
  - Persist `deterministic` and `plannedSteps` on workflow runs in core and service adapters.
  - Expose planned-step metadata on workflow run status responses.
  - Emit an initial `type: 'init'` SSE event for deterministic workflow streams before incremental updates.
  - Add CLI tests covering serialized stream route output for init/update/done event behavior.

- Updated dependencies [033d172]
- Updated dependencies [b9ed73e]
  - @pikku/inspector@0.12.11
  - @pikku/core@0.12.19

## 0.12.0

## 0.12.20

### Patch Changes

- cbefa22: Add `pikku dev` command: an all-in-one local development server that wires
  an HTTP + WebSocket server with in-memory scheduler, queue, workflow,
  trigger, and AI run-state services. Supports file watching with
  regeneration and hot module reload.

  Options:
  - `--port, -p` (default `3000`)
  - `--watch` (default `true`)
  - `--hmr` (default `true`)

- Updated dependencies [ba8d6ff]
- Updated dependencies [d3ace0e]
- Updated dependencies [311c0c4]
  - @pikku/inspector@0.12.10
  - @pikku/core@0.12.18

## 0.12.19

### Patch Changes

- b3a28c9: Convert `pikku all` to run as a workflow with parallelized steps
- d477ea5: Fix RPCInvoke and RPCRemote types to omit data argument for void/null input functions and require it for object inputs

## 0.12.18

### Patch Changes

- 615c0e0: Sanitize function IDs with colons and slashes in deploy directory names
- fbcf5b9: Add React Query hooks generation from RPC map. New `reactQueryFile` option in `clientFiles` config generates typed `usePikkuQuery`, `usePikkuMutation`, and `usePikkuInfiniteQuery` hooks, plus workflow hooks (`useRunWorkflow`, `useStartWorkflow`, `useWorkflowStatus`). Infinite query is type-constrained to RPCs whose output includes `nextCursor`.
- fbcf5b9: Enrich generated workflow status stream with step-level progress. The `/stream` endpoint now sends step names and statuses via `workflowRunService.getRunSteps()`. New `/stream/full` endpoint includes output, error, and childRunId for admin consoles.
- Updated dependencies [2ac6468]
- Updated dependencies [fbcf5b9]
- Updated dependencies [fbcf5b9]
  - @pikku/inspector@0.12.9
  - @pikku/core@0.12.16

## 0.12.17

### Patch Changes

- add5c4e: Remove deploy-azure and deploy-serverless from CLI hard dependencies. Deploy providers are optional and dynamically imported at runtime. Only keep deploy-cloudflare as the default provider.
- f90daa4: Replace workspace:_ protocol with explicit npm version ranges in all package.json files. Fixes broken publishes where workspace:_ was included literally in the npm registry.

## 0.12.16

### Patch Changes

- 624097e: Add deploy pipeline with provider-agnostic architecture
  - Add MetaService with explicit typed API, absorb WiringService reads
  - Add deployment service, traceId propagation, scoped logger
  - Rewrite analyzer: one function = one worker, gateways dispatch via RPC
  - Add Cloudflare deploy provider with plan/apply commands
  - Add per-unit filtered codegen for deploy pipeline
  - Skip missing metadata in wiring registration for deploy units
  - Fix schema coercion crash when schema has no properties
  - Fix E2E codegen: double-pass resolves cross-package Zod type imports

- 7ab3243: Add server-fallback deployment target for functions that can't run serverless.

  Functions can declare `deploy: 'serverless' | 'server' | 'auto'`. With `serverlessIncompatible` config, the analyzer auto-routes functions using incompatible services to a container.

  Server functions are merged into a single tree-shaken unit with a PikkuUWSServer entry, Dockerfile, and CF Container proxy Worker.

  Also adds sub-path exports to @pikku/cloudflare for tree-shaking (greet bundle 1.6MB → 444KB) and deploy verifiers for cloudflare, serverless, and azure providers.

- Updated dependencies [9e8605f]
- Updated dependencies [624097e]
- Updated dependencies [02fca80]
- Updated dependencies [7ab3243]
  - @pikku/deploy-cloudflare@0.12.1
  - @pikku/core@0.12.15
  - @pikku/inspector@0.12.8
  - @pikku/openapi-parser@0.12.10

## 0.12.15

### Patch Changes

- f85c234: Add unified credential system with per-user OAuth and AI agent pre-flight checks
  - Unified CredentialService with lazy loading per user via pikkuUserId
  - wire.getCredential() for typed single credential lookup
  - MissingCredentialError with structured payload for client-side connect flows
  - Console UI: Global/Users credential tabs, per-user OAuth connect/revoke
  - AI agent pre-flight check: detects missing OAuth credentials from addon metadata, shows "Connect your accounts" prompt before chat
  - CLI codegen: generates credentialsMeta per addon package for runtime lookup
  - Vercel AI runner: catches MissingCredentialError as runtime fallback

- Updated dependencies [f85c234]
- Updated dependencies [88d3100]
  - @pikku/core@0.12.14

## 0.12.14

### Patch Changes

- Fix pikkuAddonWireServices return type cast for addon compatibility.

## 0.12.13

### Patch Changes

- a31dc64: Fix pikkuAddonWireServices to wrap variables and secrets with TypedVariablesService and TypedSecretService, matching the same pattern as pikkuAddonServices.

## 0.12.12

### Patch Changes

- 2ce0733: Fix credential services template variable passing, duplicate body/path param collision, and add credentialOverrides to wireAddon.
- Updated dependencies [2ce0733]
  - @pikku/openapi-parser@0.12.9
  - @pikku/core@0.12.13
  - @pikku/inspector@0.12.7

## 0.12.11

### Patch Changes

- 84f01ad: Add credentialOverrides to wireAddon for remapping credential names, fix credential services template to pass variables argument.
- Updated dependencies [84f01ad]
- Updated dependencies [94ceecd]
  - @pikku/core@0.12.12
  - @pikku/inspector@0.12.6
  - @pikku/openapi-parser@0.12.8

## 0.12.10

### Patch Changes

- 5dd1996: Fix credentials command crash when state.credentials is undefined, and add --credential flag to `pikku new addon` for per-user credential wiring (apikey, bearer, oauth2).
- Updated dependencies [5dd1996]
  - @pikku/openapi-parser@0.12.7

## 0.12.9

### Patch Changes

- 4e52200: Add \_\_raw CLI channel handler for server-side arg parsing. Enables WebSocket CLI clients to send raw args without needing client-side command metadata.
- Updated dependencies [4e52200]
  - @pikku/core@0.12.11

## 0.12.8

### Patch Changes

- e412b4d: Optimize CLI codegen performance: 12x faster `pikku all`
  - Reuse schemas across re-inspections (skip redundant `ts-json-schema-generator` runs)
  - Cache TS schemas to disk (`.pikku/schema-cache.json`) for cross-run reuse
  - Pass `oldProgram` to `ts.createProgram` for incremental TS compilation
  - Cache parsed tsconfig in schema generator between runs
  - Auto-include direct `addPermission`/`addHTTPMiddleware` in bootstrap via side-effect imports
  - Skip `pikkuAuth()` errors when nested inside `addPermission`/`addHTTPPermission`

- b973d44: Add `inline` property to workflow function definitions. When `inline: true` is set on a workflow, it always executes inline without dispatching to the queue service, even when a queue service is available. This is useful for workflows that should run synchronously within the parent process (e.g. scaffolding/setup steps that produce local files).

  The flag flows from the function definition through the inspector, into the serialized workflow graph, and is checked at runtime by the workflow service.

- Updated dependencies [e412b4d]
- Updated dependencies [5866b66]
- Updated dependencies [53dc8c8]
- Updated dependencies [e412b4d]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [e3142ad]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9
  - @pikku/inspector@0.12.4
  - @pikku/openapi-parser@0.12.4

## 0.12.7

### Patch Changes

- e1374fc: Add OpenAPI metadata to pikku.config.json for generated addons

  When an addon is scaffolded with `--openapi`, the config now includes an `openapi` object with `version` (from the spec's `info.version`) and `hash` (a contract hash of paths, methods, params, and schemas). This lets users and tooling know whether an addon was auto-generated and if the upstream API contract has changed.

- c283e87: Add prepublishOnly script to addon scaffold template so changesets only builds packages it publishes
- c077608: Add `globalHTTPPrefix` config option to prefix all generated HTTP route paths (e.g. `/api`), freeing `/` for a frontend or landing page.
- d5f35c5: Rename version manifest from versions.json to versions.pikku.json and place it next to pikku.config.json instead of in .pikku/. Update warning message to say 'pikku versions init'.
- 049d4c3: Add input/output schema support to pikkuWorkflowFunc, pikkuWorkflowComplexFunc, and pikkuAIAgent
- 3e79248: Add setStepChildRunId to workflow service implementations and auto-bootstrap in pikku all
- b0a81cc: Support sub-workflows in `workflow.do()`: when a string name is passed, it now checks if the name refers to a registered workflow and runs it as a sub-workflow, falling back to RPC invocation if not found. The `TypedWorkflow.do` type now also accepts workflow names with typed input/output. Steps that spawn sub-workflows expose `childRunId` on the step state so clients can stream sub-workflow progress.
- Updated dependencies [bb27710]
- Updated dependencies [a31bc63]
- Updated dependencies [3e79248]
- Updated dependencies [b0a81cc]
- Updated dependencies [6413df7]
  - @pikku/core@0.12.6

## 0.12.6

### Patch Changes

- a0c496f: Fix OpenAPI codegen bugs: use operation description instead of response description, sanitize dots in type names, quote hyphenated property keys, make function input optional in types, and use pikkuServices() in test template.
- 198e68f: Add hot-reload for dev mode: reload functions, middleware, and permissions without server restart.
- Updated dependencies [a0c496f]
- Updated dependencies [198e68f]
  - @pikku/openapi-to-zod-schema@0.12.3
  - @pikku/core@0.12.5

## 0.12.5

### Patch Changes

- Add `pikkuConsoleHasSecret` RPC to generated console functions: check if a secret exists without reading its value

## 0.12.4

### Patch Changes

- e387a68: Add scaffold.console check to console command: error with setup instructions if console is not enabled in pikku.config.json. Update bundled console app.
- Updated dependencies [688b5e8]
  - @pikku/core@0.12.4

## 0.12.3

### Patch Changes

- 387b2ee: Add console app assets, agent serialization, addon type generation, and enhance OpenAPI codegen with error handling, header params, and MCP support
- 6e8777b: Rename `node` config key to `addon` (now accepts boolean or object with metadata) and rename generated file `pikku-nodes-meta.gen.json` to `pikku-addon-meta.gen.json`
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [387b2ee]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3
  - @pikku/inspector@0.12.3

## 0.12.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2
  - @pikku/inspector@0.12.2

## 0.12.1

### Patch Changes

- 62a8725: Rename 'external' to 'addon' throughout the codebase. All types, functions, config keys, and CLI options previously named `external` or `External` are now named `addon` or `Addon` (e.g. `ExternalPackageConfig` → `AddonConfig`, `externalPackages` → `addons`, `function-external` → `function-addon`).
- 588f52f: Add `pikku new addon <name>` CLI subcommand for scaffolding addon packages:
  - Generates full addon structure: package.json, pikku.config.json, tsconfig.json, API service, types, and README
  - `--secret` flag generates wireSecret with API key schema
  - `--oauth` flag generates wireOAuth2Credential + OAuth2Client-based API service
  - `--variable` flag generates wireVariable definition
  - `--no-test` flag skips test harness generation
  - `--displayName`, `--description`, `--category`, `--dir` options for customization
  - Test harness includes wireAddon, services, test function, and runner

  Also adds `scaffold` config section to pikku.config.json for config-driven default directories across all `new` commands (addonDir, functionDir, wiringDir, middlewareDir, permissionDir).

- ba88295: Add `pikku new` scaffold commands for bootstrapping project files:
  - `pikku new function <name> --type func|sessionless|void`
  - `pikku new wiring <name> --type http|channel|scheduler|queue|mcp|cli|trigger`
  - `pikku new middleware <name> --type simple|factory`
  - `pikku new permission <name> --type simple|factory`

  Templates use correct `#pikku` imports and function signatures. VS Code extension now delegates to the CLI instead of using inline templates.

- a83efb8: Handle OPTIONS preflight requests automatically in fetchData when no explicit OPTIONS route is matched. Runs global HTTP middleware (e.g. CORS) and returns 204. Remove redundant startWorkflowRun and streamAgentRun pass-through functions from addon-console.
- 62a8725: `pikku versions check` now prints rich, human-readable output for all contract version errors instead of raw error codes. Each error type (PKU861–PKU865) shows the function name, separate input/output schema hashes with a `prev → current` arrow, and clear next-step instructions.

  The version manifest now stores separate `inputHash` and `outputHash` per version entry (backward-compatible — old string-hash manifests still load and validate correctly). `VersionValidateError` gains optional detail fields (`functionKey`, `version`, `previousInputHash`, `currentInputHash`, `previousOutputHash`, `currentOutputHash`, `nextVersion`, `latestVersion`, `expectedNextVersion`) for use by tooling.

- 62a8725: Version management commands are now grouped under `pikku versions <subcommand>`:
  - `pikku versions init` — initialise the version manifest (was `pikku init`)
  - `pikku versions check` — validate contracts against the manifest (was `pikku versions-check`)
  - `pikku versions update` — update the manifest with current hashes (newly exposed as a CLI command)

- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
  - @pikku/core@0.12.1
  - @pikku/inspector@0.12.1

### New Features

- AI agent code generation (types, public agent endpoints, streaming routes)
- OAuth2 CLI commands: `oauth:connect`, `oauth:status`, `oauth:disconnect`
- `TypedSecretService` and `TypedVariablesService` code generation
- Contract versioning with `versions-check`, `versions-init`, `versions-update` commands
- Trigger and trigger source code generation
- Secret and variable declaration code generation
- HTTP route groups support
- Remote RPC worker generation
- Node metadata generation for visual flow graphs

## 0.11.3

### Patch Changes

- 14a3dcd: fix: nextjs rpc route wasn't working
- db9c7bf: Add workflow graph code generation and fix HTTP routes count
- Updated dependencies [db9c7bf]
- Updated dependencies [db9c7bf]
  - @pikku/core@0.11.2
  - @pikku/inspector@0.11.2

### Features

- f35e89da: Add workflow graph code generation
  - Workflow graph serialization and type generation
  - DSL to graph conversion for workflow metadata

### Fixes

- ddd87eaf: Make CreateWireServices type compatible with custom Config types
- c42aad80: Correct HTTP routes count in CLI summary (was showing method count instead of route count)

## 0.11.2

### Patch Changes

- 4b811db: chore: updating all dependencies
- ce902b1: feat: serialize json files seperate to pikku meta state calls
- e12a00c: feat: adding initialSession to PikkuWire which is correctly typed (undefined / not depending on function type)
- ce902b1: feat: adding rpcName to rpc url so its nicer in network tabs
- 4579434: breaking: changing the signature of functions
- 28aeb7f: breaking: extract docs in the wiring meta
- ce902b1: feat: adding in pikkuSimpleWorkflowFunc
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/inspector@0.11.1
  - @pikku/core@0.11.1

## 0.11.1

### Patch Changes

- 1d064c5: feat: using pikku cli to drive the pikku cli

### Minor Changes

- Add workflow code generation (types, maps, workers, metadata)
- Add public RPC and remote RPC code generation

# @pikku/cli

## 0.10.2

### Patch Changes

- 1967172: Update code generation to support channel middleware enhancements

  **Code Generation Updates:**
  - Update channel type serialization to include middleware support
  - Improve WebSocket wrapper generation for middleware handling
  - Update CLI channel client generation with better type support
  - Enhance services and schema generation for channel configurations

  **Inspector Updates:**
  - Improve channel metadata extraction for middleware
  - Better type analysis for channel lifecycle functions
  - Enhanced post-processing for channel configurations

- 753481a: Add bootstrap command, performance optimizations, and CLI improvements

  **New Features:**
  - Add `pikku bootstrap` command for type-only generation (~13.5% faster than `pikku all`)
  - Add configurable `ignoreFiles` option to pikku.config.json with sensible defaults (_.gen.ts, _.test.ts, \*.spec.ts)
  - Export pikkuCLIRender helper from serialize-cli-types.ts with JSDoc documentation

  **Performance Improvements:**
  - Add aggressive TypeScript compiler options (skipDefaultLibCheck, types: []) - ~37% faster TypeScript setup
  - Add detailed performance timing to inspector phases (--logLevel=debug)
  - Optimize file inspection with ignore patterns - ~10-20% faster overall

  **Enhancements:**
  - Fix --logLevel flag to properly apply log level to logger
  - Update middleware logging to use structured log format
  - Improve CLI renderers to consistently use destructured logger service
  - Fix middleware file generation when middleware groups exist

- 44d71a8: fix: fixing inspector ensuring pikkuConfig is set
- Updated dependencies [1967172]
- Updated dependencies [753481a]
- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/inspector@0.10.2
  - @pikku/core@0.10.2

## 0.10.1

### Patch Changes

- 778267e: fix: fixing inspector ensuring pikkuConfig is set
- Updated dependencies [778267e]
  - @pikku/inspector@0.10.1
  - @pikku/core@0.10.1

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.16-next.0

### Patch Changes

- feat: running @pikku/cli using pikku
- Updated dependencies
  - @pikku/core@0.9.12-next.0
  - @pikku/inspector@0.9.6-next.0

## 0.9.15

### Patch Changes

- 749d921: chore: intermin combat with new cli changes

## 0.9.14

### Patch Changes

- 798d52c: refactor: move all rpc generated info into rpc and removing rpc-internal

## 0.9.13

### Patch Changes

- ccd2a45: fix: adding functions should always be using func config and not pure functions

## 0.9.12

### Patch Changes

- eb8ed09: feat: only write files if the content changed / file doesn't exist, this stops triggering restarts for development

## 0.9.11

### Patch Changes

- 0181433: fix: fixing cli pikku-types for channels (allowing sessionless as well)

## 0.9.10

### Patch Changes

- 501c120: fix: rpc internal meta file wasn't being imported
- Updated dependencies [501c120]
  - @pikku/inspector@0.9.5

## 0.9.9

### Patch Changes

- 99c2b3a: fix: removing duplicated interaction values from pikku functions
- Updated dependencies [99c2b3a]
  - @pikku/core@0.9.9

## 0.9.8

### Patch Changes

- ea89575: feat: adding the ability for custom schema validation / retrieving schemas to use (for example with openapi json_response)
- Updated dependencies [ea89575]
  - @pikku/core@0.9.8

## 0.9.7

### Patch Changes

- 4fd5e19: fix: removing rpcMeta and duplicate imports
- d1babed: fix: pikkuVoidFunc should use a sessionless function -- Since its used mostly by scheduled tasks

## 0.9.6

### Patch Changes

- 6059c87: refactor: move PikkuPermission to pikkuPermission and same for middleware for api consistency to to improve future features
- 6db63bb: perf: changing http meta to a lookup map to reduce loops
- Updated dependencies [6059c87]
- Updated dependencies [6db63bb]
- Updated dependencies [74f8634]
- Updated dependencies [766fef1]
  - @pikku/inspector@0.9.4
  - @pikku/core@0.9.6

## 0.9.5

### Patch Changes

- b443405: feat: adding middleware and functions by tags
- Updated dependencies [7e1f5b3]
- Updated dependencies [b443405]
  - @pikku/core@0.9.5

## 0.9.4

### Patch Changes

- 92c1926: feat: adding rpc and websocket client cli commands
- c18800d: feat: adding queue and scheduledTask to interactions
- Updated dependencies [c18800d]
  - @pikku/core@0.9.4

## 0.9.3

### Patch Changes

- 9691aba: fix: add-functions should support both functions only and objects
- 2ab0278: refactor: no longer import ALL functions, only the ones used by rpcs
- 81005ba: feat: creating a smaller meta file for functions to reduce size
- b3c2829: fix (using ai): generating custom types broke imports.. this fixes it, but needs more robust training
- Updated dependencies [9691aba]
- Updated dependencies [2ab0278]
- Updated dependencies [81005ba]
- Updated dependencies [b3c2829]
  - @pikku/inspector@0.9.3
  - @pikku/core@0.9.3

## 0.9.2

### Patch Changes

- 1256238: feat: pikkufunc in types extends function config to include all the different params
- d3a9a09: refactor: change addMiddleware to addHTTPMiddleware due to route support'

  chore: export addHTTPMiddleware from pikku-types for consistency

- 840e078: refactor: change APIMiddleware type to PikkuMiddleware
- a5905a9: chore: updating all dependencies
- Updated dependencies [1256238]
- Updated dependencies [6cf8efd]
- Updated dependencies [d3a9a09]
- Updated dependencies [840e078]
- Updated dependencies [667d23c]
- Updated dependencies [a5905a9]
  - @pikku/core@0.9.2
  - @pikku/inspector@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: feat: adding silent option to cli
- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1
  - @pikku/inspector@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.3

### Patch Changes

- 9156577: Fix import path generation to handle same-package files and node_modules paths
  - When files are in the same package directory, skip packageMappings and use relative paths
  - When import paths include node_modules, strip everything before and including node_modules/ for cleaner imports
  - This prevents issues where files within the same package would incorrectly reference themselves via package names
  - Transforms ugly paths like `../../../../node_modules/@pikku/core/dist/types/core.types.d.js` into clean paths like `@pikku/core/dist/types/core.types.d.js`

## 0.8.2

### Patch Changes

- a02347b: fix: only insert package mapping if it's not the same package
- Updated dependencies [0fb4b3d]
  - @pikku/core@0.8.2

## 0.8.1

### Patch Changes

- 44e3ff4: feat: enhance CLI filtering with type and directory filters
  - Add --types filter to filter by PikkuEventTypes (http, channel, queue, scheduler, rpc, mcp)
  - Add --directories filter to filter by file paths/directories
  - All filters (tags, types, directories) now work together with AND logic
  - Add comprehensive logging interface to inspector package
  - Add comprehensive test suite for matchesFilters function
  - Support cross-platform path handling

- 7c592b8: feat: support for required services and improved service configuration

  This release includes several enhancements to service management and configuration:
  - Added support for required services configuration
  - Improved service discovery and registration
  - Added typed RPC clients for service communication
  - Updated middleware to run per function

- Updated dependencies [3261090]
- Updated dependencies [44e3ff4]
- Updated dependencies [7c592b8]
- Updated dependencies [30a082f]
  - @pikku/core@0.8.1
  - @pikku/inspector@0.8.1

## 0.8.0

### Major Features

- **Model Context Protocol (MCP) Support**: Complete MCP implementation with automatic generation of MCP JSON specifications, resources, tools, and prompts
- **Queue System**: Added queue support
- **RPC (Remote Procedure Calls)**: Added typed RPC call generation with local and remote procedure support
- **Multiple Bootstrap Files**: Added support for generating different transport-specific bootstrap files
- **Service Destructuring Analysis**: Added service destructuring analysis for better code generation
- **Bootstrap Files**: Added support for generating transport-specific bootstrap files
- **Service Destructuring**: Added service destructuring analysis for better code organization
- **Error Handling**: Improved error handling for complex type generation
- **Performance**: Optimized code generation for large projects with multiple event types

## 0.7.7

### Patch Changes

- a5e3903: fix: PikkuFetch import fix

## 0.7.6

### Patch Changes

- 8b4f52e: refactor: moving schemas in channels to functions
- 1d70184: feat: adding multiple bootstrap files for different transports
- 5c4f56f: fix: adding more options to schema generator to support complex types
- a9427b8: fix: import bootstrap file to include all rpc/function code in nextjs wrapper
- Updated dependencies [8b4f52e]
- Updated dependencies [8b4f52e]
- Updated dependencies [1d70184]
  - @pikku/core@0.7.8
  - @pikku/inspector@0.7.7

## 0.7.5

### Patch Changes

- faa1369: refactor: moving function imports into pikku-fun.gen file
- Updated dependencies [faa1369]
  - @pikku/inspector@0.7.6

## 0.7.4

### Patch Changes

- 6af8a19: fix: always write functions meta data
- Updated dependencies [6af8a19]
  - @pikku/core@0.7.7

## 0.7.3

### Patch Changes

- 46d4458: feat: we now have typed rpc calls inside of functions!
- Updated dependencies [46d4458]
  - @pikku/core@0.7.5

## 0.7.2

### Patch Changes

- 598588f: fix: generating output schemas from function meta
- Updated dependencies [598588f]
  - @pikku/inspector@0.7.4
  - @pikku/core@0.7.4

## 0.7.1

### Patch Changes

- 534fdef: feat: adding rpc (locally for now)
- Updated dependencies [534fdef]
  - @pikku/inspector@0.7.3
  - @pikku/core@0.7.3

## 0.7.0

- Now function first. No breaking changes for end user here, just internals

## 0.6.20

### Patch Changes

- 531f4b5: refactor: using userSession.set to set cookies with middleware
- Updated dependencies [531f4b5]
  - @pikku/core@0.6.24

## 0.6.19

### Patch Changes

- 1c8c470: removing a console
- Updated dependencies [1c8c470]
  - @pikku/core@0.6.23

## 0.6.18

### Patch Changes

- 60b2265: refactor: supporting request and response objects
- Updated dependencies [60b2265]
  - @pikku/inspector@0.6.4
  - @pikku/core@0.6.22

## 0.6.17

### Patch Changes

- 57f5d8c: refactor: moving getSession out of nextjs wrapper since it bundles all routes and only needs middleware
- 141d690: feat: creating a nextJS http wrapper for proxying
- e5a5a12: feat: adding watch command (pikki all --watch)
- 0ad27a2: chore: switching from glon to tinyblobby

## 0.6.16

### Patch Changes

- 9fb2b99: refactor: moving schemas to pikku state
- Updated dependencies [9fb2b99]
  - @pikku/core@0.6.19

## 0.6.15

### Patch Changes

- 93c70b5: feat: make user session service a required service for channels

## 0.6.14

### Patch Changes

- ebc04eb: refactor: move all global state into pikku state
- Updated dependencies [ebc04eb]
- Updated dependencies [8a14f3a]
- Updated dependencies [2c47386]
  - @pikku/core@0.6.17

## 0.6.13

### Patch Changes

- c1d8381: feat: adding filtering by tags to minimize produced payload
- ee5c874: feat: moving towards using middleware for http and channels
- Updated dependencies [c1d8381]
- Updated dependencies [ee5c874]
  - @pikku/inspector@0.6.3
  - @pikku/core@0.6.14

## 0.6.12

### Patch Changes

- f0a905d: fix: fixing optional data if no arguments present

## 0.6.11

### Patch Changes

- 3062086: fix: renaming AbstractFetch/Websocket to core
- eb8a8b4: fix: updating schema and cli build issue due to tsconfig settings
- Updated dependencies [eb8a8b4]
  - @pikku/core@0.6.13

## 0.6.10

### Patch Changes

- 06e71be: fix: use readFile instead of import for json file

## 0.6.9

### Patch Changes

- 7e7ec0c: chore: show packageVersion in cli header

## 0.6.8

### Patch Changes

- bdcc89a: feat: adding intro logo to cli based commands

## 0.6.7

### Patch Changes

- 7859b28: breaking: changing overrides for addRoute to wrap instead due to random conflict override errors
- 269a532: fix: fixing some typing issues
- Updated dependencies [7859b28]
- Updated dependencies [269a532]
  - @pikku/core@0.6.11

## 0.6.6

### Patch Changes

- 780d7c2: revert: using import for json
- Updated dependencies [0a92fa7]
  - @pikku/core@0.6.7

## 0.6.5

### Patch Changes

- 4357bca: feat: fixing up nextjs apis
- Updated dependencies [4357bca]
  - @pikku/core@0.6.6

## 0.6.4

### Patch Changes

- 2bc64fd: feat: adding methods to fetch wrapper (and small fixes)
- a40a508: fix: Fixing some generation bugs and other minors
- 4855e68: refactor: changing all generated files to have a .gen in the default name suffix
- Updated dependencies [a40a508]
  - @pikku/inspector@0.6.2
  - @pikku/core@0.6.5

## 0.6.3

### Patch Changes

- f26880f: feat: extracting inspector and adding unique type references
- Updated dependencies [f26880f]
  - @pikku/inspector@0.6.1
  - @pikku/core@0.6.4

## 0.6.2

### Patch Changes

- 09fc52c: feat: adding cloudflare and lambda websockets
  breaking change: moved subscription from channel to services and renamed to event hub
- Updated dependencies [09fc52c]
- Updated dependencies [adecb52]
  - @pikku/core@0.6.3

## 0.6.1

### Patch Changes

- adeb392: feat: more channel improvements, and adding bubble option to runners to avoid all the empty try catches
- Updated dependencies [ed45ca9]
- Updated dependencies [adeb392]
  - @pikku/core@0.6.2

## 0.6

Marking a major release to include channels and scheduled tasks

## 0.5.43

### Patch Changes

- 662a6cf: feat: adding scheduled tasks names
- c8578ea: fix: getting websocket auth to work on individual messages
- d2f8edf: feat: adding channelId to channels for serverless compatability
- Updated dependencies [662a6cf]
- Updated dependencies [c8578ea]
- Updated dependencies [d2f8edf]
  - @pikku/core@0.5.29

## 0.5.42

### Patch Changes

- 886a2fb: refactor: moving singletons (like routes and channels) to global to avoid nodemodule overrides
- 886a2fb: fix: making core routes global to avoid state overrides
- Updated dependencies [a768bad]
- Updated dependencies [886a2fb]
- Updated dependencies [886a2fb]
  - @pikku/core@0.5.28

## 0.5.41

### Patch Changes

- 3f2e365: fix: create custom types if one object thats not a valid alias

## 0.5.40

### Patch Changes

- 57731ed: fix: deleting a deadline in serializer

## 0.5.39

### Patch Changes

- 75a828d: feat: create schemas for custom types extracted from apis

## 0.5.38

### Patch Changes

- 6dc72d5: feat: add support for import attributes to cli options

## 0.5.37

### Patch Changes

- 5d03fac: refactor: removing some dead code

## 0.5.36

### Patch Changes

- aa8435c: fix: fixing up channel apis and implementations
- Updated dependencies [aa8435c]
  - @pikku/core@0.5.27

## 0.5.35

### Patch Changes

- 2160039: fix: fixing alias issue with generated types
- ab42f18: chore: upgrading to next15 and dropping pages support
- Updated dependencies [ab42f18]
  - @pikku/core@0.5.26

## 0.5.34

### Patch Changes

- 0f96787: refactor: dropping cjs support
- 64e4a1e: refactor: seperating core into cleaner sub-packages
- c23524a: refactor: bump to versions to ensure correct package usage
- Updated dependencies [0f96787]
- Updated dependencies [64e4a1e]
- Updated dependencies [c23524a]
  - @pikku/core@0.5.25

## 0.5.33

### Patch Changes

- bba25cc: chore: updating all packages to reflect major changes
- 9deb482: refactor: finalizing stream api
- f37042d: fix: always print out core schema register file
- ee0c6ea: feat: adding ws server
- d97e952: refactor: removing requirement of config method outside of nextjs
- Updated dependencies [bba25cc]
- Updated dependencies [9deb482]
- Updated dependencies [ee0c6ea]
  - @pikku/core@0.5.24

## 0.5.32

### Patch Changes

- e9a9968: refactor: completing rename of stream to channel
- Updated dependencies [7fa64a0]
- Updated dependencies [539937e]
- Updated dependencies [e9a9968]
  - @pikku/core@0.5.23

## 0.5.31

### Patch Changes

- 73973ec: fix: data type for methods is optional
- Updated dependencies [73973ec]
  - @pikku/core@0.5.22

## 0.5.30

### Patch Changes

- 179b9c2: fix: fixing stream types
- Updated dependencies [179b9c2]
  - @pikku/core@0.5.21

## 0.5.29

### Patch Changes

- b20ef35: fix: generate stream types from message array

## 0.5.28

### Patch Changes

- 5be6da1: feat: adding streams to uws (and associated refactors)
- Updated dependencies [5be6da1]
  - @pikku/core@0.5.20

## 0.5.27

### Patch Changes

- d58c440: refactor: making http requests explicit to support other types
- 11c50d4: feat: adding streams to cli
- Updated dependencies [cbcc75b]
- Updated dependencies [d58c440]
- Updated dependencies [11c50d4]
  - @pikku/core@0.5.19

## 0.5.26

### Patch Changes

- b7b78bb: fix: add '& {}' to openapi interfaces as a workaround for not directly refering to a type since it confuses typescript

## 0.5.25

### Patch Changes

- 69d388d: refactor: switching to use config async creator

## 0.5.24

### Patch Changes

- 2307831: fix: removing unused import

## 0.5.23

### Patch Changes

- 30b46aa: fix: looks like using patch lowercase breaks the node fetch client sometimes
- Updated dependencies [30b46aa]
  - @pikku/core@0.5.13

## 0.5.22

### Patch Changes

- f8aa99f: feat: export pikkuFetch instance to avoid needing a singleton class
- Updated dependencies [ff8a563]
  - @pikku/core@0.5.12

## 0.5.21

### Patch Changes

- 5295380: refactor: changing config object a getConfig function
- f24a653: feat: coerce types in ajv for correct validation / usage later on
- Updated dependencies [be68efb]
- Updated dependencies [5295380]
- Updated dependencies [f24a653]
  - @pikku/core@0.5.11

## 0.5.20

### Patch Changes

- effbb4c: doc: adding readme to all packages
- Updated dependencies [effbb4c]
  - @pikku/core@0.5.10

## 0.5.19

### Patch Changes

- 3541ab7: refactor: rename nextDeclarationFile to nextJSFile
- 725723d: docs: adding typedocs
- Updated dependencies [3541ab7]
- Updated dependencies [725723d]
  - @pikku/core@0.5.9

## 0.5.18

### Patch Changes

- b237ace: feat: adding core errors to openapi error specs
- 1876d7a: feat: add error return codes to doc generation
- fda3869: fix: dont ignore decleration files when looking for types
- Updated dependencies [1876d7a]
- Updated dependencies [8d85f7e]
  - @pikku/core@0.5.8

## 0.5.17

### Patch Changes

- 25c6637: fix: fixing a type import for meta types

## 0.5.16

### Patch Changes

- 2654ef1: fix: testing relative files

## 0.5.15

### Patch Changes

- 707b26a: feat: save openapi as yml if needed

## 0.5.14

### Patch Changes

- 0883f00: fix: schema generation error
- Updated dependencies [0883f00]
  - @pikku/core@0.5.6

## 0.5.13

### Patch Changes

- 93b80a3: feat: adding a beta openapi standard
- Updated dependencies [93b80a3]
  - @pikku/core@0.5.5

## 0.5.12

### Patch Changes

- 473ac6a: fix: correcting name of schema root file
  refactor: removing time change in generated files

## 0.5.11

### Patch Changes

- b3dcfc4: feat: adding a bootstrap file to simplify usage

## 0.5.10

### Patch Changes

- 2c0e940: fix: reinspecting after type file is created

## 0.5.9

### Patch Changes

- 0e1f01c: fix: inccorect string replacement

## 0.5.8

### Patch Changes

- 2841fce: fix: create empty schema directory

## 0.5.7

### Patch Changes

- 3724449: fix: fixing a cli path issue

## 0.5.6

### Patch Changes

- 58a510a: refactor: moving routes map into a declaration file

## 0.5.5

### Patch Changes

- 6cac8ab: feat: adding a do not edit to cli generated files
- Updated dependencies [6cac8ab]
  - @pikku/core@0.5.4

## 0.5.4

### Patch Changes

- 8065e48: refactor: large cli refactor for a better dev experience
- Updated dependencies [8065e48]
  - @pikku/core@0.5.3

## 0.5.3

### Patch Changes

- 5e0f033: feat: adding a routes map output file to support frontend sdks in the future
- Updated dependencies [5e0f033]
  - @pikku/core@0.5.2

## 0.5.2

### Patch Changes

- 8712f25: fix: relative paths need to start with ./ for imports to work

## 0.5.1

### Patch Changes

- 45e07de: refactor: renaming packages and pikku structure
- Updated dependencies [97900d2]
- Updated dependencies [d939d46]
- Updated dependencies [45e07de]
  - @pikku/core@0.5.1

## 0.4.7

### Patch Changes

- c382ed3: putting glob back to 10 again for node 18 support

## 0.4.6

### Patch Changes

- 2a2402b: republish since something went wrong
- Updated dependencies [2a2402b]
  - @pikku/core@0.4.6

## 0.4.5

### Patch Changes

- 0650348: fix: export schemas using \*
- 1a708a7: refactor: renaming PikkuCLIConfig back to PikkuConfig
  feat: adding .end() to pikku response for servers that need it
- 3019265: fix: ensuring node 18 compatability
- 642d370: fix: adding schema error logs on fail
- Updated dependencies [0650348]
- Updated dependencies [1a708a7]
- Updated dependencies [642d370]
  - @pikku/core@0.4.4

## 0.4.4

### Patch Changes

- 94f8a74: fix: finalizing cjs and esm packages

## 0.4.3

### Patch Changes

- 28f62ea: refactor: using cjs and esm builds!
- 14783ee: fix: including all types as dependencies to avoid users needing to install them

## 0.4.2

### Patch Changes

- 5a012d9: Fixing typedoc generation
