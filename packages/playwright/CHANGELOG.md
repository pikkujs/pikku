# @pikku/playwright

## 0.12.80

### Patch Changes

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

- Updated dependencies [ee9da9e]
- Updated dependencies [7a15c9c]
- Updated dependencies [ee9da9e]
  - @pikku/core@0.12.99

## 0.12.79

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
  - @pikku/core@0.12.91

## 0.12.78

### Patch Changes

- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- 2b57ca8: A persona can name the `app` they sign into, and a browser run takes a url per app (`--app-url <app>=<url>`, or `appUrls` on the environment). Each actor's browser context navigates against its own app's base, so a product that is more than one frontend can be proved in one run — including a scenario that crosses from one app to the other. A run whose personas name an app nobody gave a url for is refused rather than browsing the wrong app's pages.
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

- Updated dependencies [7722ceb]
- Updated dependencies [375c1ff]
- Updated dependencies [02a70cd]
- Updated dependencies [aeef159]
- Updated dependencies [a281de6]
- Updated dependencies [266e3bc]
- Updated dependencies [02a70cd]
- Updated dependencies [786dae5]
- Updated dependencies [6eef0a0]
- Updated dependencies [3561d67]
- Updated dependencies [a91c433]
- Updated dependencies [02a70cd]
- Updated dependencies [9537f74]
- Updated dependencies [2b57ca8]
- Updated dependencies [266e3bc]
- Updated dependencies [9fce0f1]
- Updated dependencies [83683a0]
- Updated dependencies [456c88b]
- Updated dependencies [456c88b]
- Updated dependencies [c127273]
  - @pikku/core@0.12.85

## 0.12.77

### Patch Changes

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
  - @pikku/core@0.12.84

## 0.12.76

### Patch Changes

- eba75ea: export browserConfigFromEnv from the package root so a scenario bootstrap can re-export it

## 0.12.75

### Patch Changes

- 438b776: Move the scenario and feature surface off `@pikku/core/workflow` and onto
  `@pikku/core/scenario`. Scenarios extend workflows, so the production workflow
  wiring no longer names a scenario module in its import graph. Feature and
  scenario types are declared in their own `scenario.types.ts` rather than in
  `workflow.types.ts`. Import `requireActor`, `requireScenarioEnv`, `pollUntil`,
  `createCookieJar`, `addFeature`, `ScenarioHttpResponse` and the rest from
  `@pikku/core/scenario`; `HttpPersonasConfig` now comes from
  `@pikku/core/persona` rather than `@pikku/core/services`.
- Updated dependencies [02c4fe5]
- Updated dependencies [438b776]
- Updated dependencies [438b776]
  - @pikku/core@0.12.83

## 0.12.74

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82

## 0.12.73

### Patch Changes

- c524adf: fix(playwright): count a scenario's captures once, not once per actor

  The index leading a capture's filename exists to give a directory listing the
  order the run happened in. It was held on `ActorSession`, and the provider opens
  one session per actor — so a scenario driving two people wrote `01` twice, and
  the listing described an order that never occurred.

  The scenario name and the count now live on one capture context the provider
  hands to every session by reference, reset as each scenario begins. Sessions
  opened by the previous scenario follow the new name rather than going on writing
  under the old one.

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

- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [e110c55]
- Updated dependencies [acc8077]
- Updated dependencies [905f737]
- Updated dependencies [3cc6428]
- Updated dependencies [c524adf]
- Updated dependencies [e110c55]
  - @pikku/core@0.12.81

## 0.12.72

### Patch Changes

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

- Updated dependencies [c984df6]
- Updated dependencies [63ff32b]
- Updated dependencies [ba6cc08]
- Updated dependencies [d007191]
- Updated dependencies [a7b26c5]
- Updated dependencies [457cb25]
- Updated dependencies [f7567ad]
- Updated dependencies [ba6cc08]
- Updated dependencies [a2e21e5]
- Updated dependencies [457cb25]
- Updated dependencies [86a50b9]
- Updated dependencies [0e0f6eb]
  - @pikku/core@0.12.73

## 0.12.71

### Patch Changes

- fc84daf: `pikku scenario run` can now target a URL that only exists at run time.

  The environment named on the command line was the whole answer: its `apiUrl` and `appUrl` are literal strings in `pikku.config.json`, frozen when the config was written. A suite that wants to run against something provisioned moments earlier — a freshly deployed sandbox with a unique origin — had nowhere to put that address short of synthesising a config file per run.

  `--api-url` and `--app-url` now override the named environment's URLs for one invocation. The environment is still looked up by name and must still exist, so the flags override a target rather than inventing one, and the override is applied once where the environment is resolved: actors, raw-HTTP steps, the browser driver and a `--spawn`ed server all see the same address. A value that is not an absolute http(s) URL is rejected where it was typed, and `--spawn` with a non-local `--api-url` is refused instead of trying to bind a server to a host this machine does not own.

  Browser steps get the same reach. A driver that knows the target from its own environment — `@pikku/playwright` reading `SANDBOX_HOSTNAME`, `E2E_APP_URL` or `APP_URL` — is now allowed to supply the `appUrl` when the config names none; previously the runner refused before the driver was ever consulted. The check still fires when nothing resolved a real target: a driver reporting `appUrlSource: 'default'`, as `@pikku/playwright` now does for its `http://localhost:5001` placeholder, fails the run exactly as a missing `appUrl` always did.

- Updated dependencies [8a2c993]
- Updated dependencies [a261006]
- Updated dependencies [09973b9]
  - @pikku/core@0.12.71

## 0.12.70

### Patch Changes

- 539ee0b: Give browser scenario steps a shared way to name an element: `browser.locate(selector)`. `TestIdSelector` (test id, `prefix`, `where` data attributes, `containing` text, `within` scope) is declared in core so a step's input stays structural, and `@pikku/playwright` resolves it against the page — applying `:visible` by default, since Mantine layouts routinely mount a hidden copy of a control.
- 2f88989: Re-export `expect` from `@playwright/test`, so a scenario step asserts through a retrying web-first matcher instead of sampling a locator once and hand-rolling the wait. `@playwright/test` is already this package's peer dependency, so a consumer reaches it here rather than depending on the test runner directly.
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

- Updated dependencies [539ee0b]
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
- Updated dependencies [5962e51]
- Updated dependencies [5962e51]
- Updated dependencies [61b9bf8]
  - @pikku/core@0.12.70
