# Making Pikku bun-first

Branch: `pikku-bun-default` (worktree at `/Users/yasser/git/pikku/pikku-bun-default`,
based on `origin/main` @ `e0353809d`). bun 1.3.14 is installed locally.

## Why bun
- **Standalone binaries** via `bun build --compile`.
- **Native uWebSockets** under `Bun.serve` — `Bun.serve` embeds uWebSockets, so `pikku dev`
  on bun gets uws performance for free without consuming the `uWebSockets.js` npm package.
- **Native bundling + native TS + built-in test runner** — drops tsx, c8, glob, esbuild
  juggling.
- **Faster installs/scripts** than yarn; one tool for fabric too (replaces yarn there).

Node stays a first-class target — not everyone uses bun. bun is added as an **option**
everywhere, and made the **default for fabric**.

## Strategy: three axes, sequenced A → B → C (each gated on prev = green)

The work splits into three independent axes with very different blast radius. We do the
lowest-risk, highest-signal one first; its result ("do the libs actually work under
bun") informs the next.

---

## Phase A — bun as a template package manager (FIRST)
**Goal:** prove user apps install + build + test + run under bun. Lowest risk, directly
answers the "do the libraries work" question. Touches only the `create` CLI, the
template test script, and CI matrix — not the monorepo's own toolchain.

**Current state worth knowing:**
- CI `templates` job *already* has a `package-manager: [yarn]` matrix axis, but
  `scripts/test-template.sh` **ignores it** — it hardcodes `--package-manager yarn`,
  `--yarn-link`, and a yarn-portal-specific dedup hack (kysely/fastify symlinking).
- `create` CLI already *offers* `bun` interactively ("experimental") but `bun` is **not**
  in the validated `packageManagers` array (`['npm','yarn','pnpm']`), and local linking
  (`--yarn-link`) is yarn-only.

**Steps:**
1. `create` CLI (`packages/create/src/index.ts`): add `'bun'` to the validated
   `packageManagers` array; handle `bun install` (no `--no-immutable`); add a bun local-
   link path (`bun link` / `overrides` to the worktree) so CI can test in-repo packages
   under bun. Update `utils.ts` `packageManager` handling (the `yarn@4.9.2` write).
2. `scripts/test-template.sh`: take package manager as `$3` (default yarn); branch
   install/link/dedup on it. The yarn portal dedup hack has no bun analog — under bun,
   linking resolves differently; verify whether the TS2345 dup-package problem even
   occurs, and only add a bun-specific workaround if it does.
3. CI (`develop.yml` + `main.yml` `templates` job): make the `package-manager` axis real
   — `[yarn, bun]`, pass `$3` through to `test-template.sh`. **Start narrow:** add only
   `express` to the bun side first, confirm green, then fan out the matrix.
   **uws is intentionally NOT in the bun matrix** — the `uws` template stays Node-only
   (bun apps use `Bun.serve`, which is uWebSockets anyway; see Phase C.0 decision). So
   the bun template matrix should exclude `uws` (and `cloudflare-*`, `aws-lambda*`,
   `nextjs` follow their own runtime rules). express is the clean first canary.
4. **Verifier (TDD):** a test that `test-template.sh <tpl> <branch> bun` succeeds for
   express; must fail before step 2 (script ignores `$3`) and pass after.

**Exit gate:** express template green under bun in CI (uws stays Node-only, excluded).

---

## Phase B — `Bun.serve` runtime adapter + standalone binaries
**Goal:** a real bun runtime for Pikku apps. This is what the branch name implies.

**Key point:** `Bun.serve` IS uWebSockets internally — bun embeds uWebSockets as its HTTP
server. So the bun runtime uses `Bun.serve` directly and **does NOT consume the
`uWebSockets.js` npm package**. There is no separate uws-for-bun adapter to build; you get
uws performance for free via `Bun.serve`. (The existing Node-target `uws-server`/
`uws-handler` packages keep using the npm package — they're unaffected.)

**Steps:**
1. New `packages/runtimes/runtime-bun` (mirror an existing http runtime, e.g. uws/ws, for
   the wiring shape only): a `Bun.serve`-based HTTP wireup; WebSocket via `Bun.serve`'s
   native `websocket` handler (not the `uWebSockets.js` package); reuse the core
   request/response abstraction.
2. New `templates/bun` template using it; add to template registry in
   `packages/create/src/index.ts`.
3. `bun build --compile` path for standalone binaries — wire into `pikku` CLI deploy /
   a template script. Confirm tree-shaking + serverless target still behave.
4. Add `bun` template to CI templates matrix.
5. **Verifier (TDD):** runtime smoke test hitting an HTTP route + a WS echo on the bun
   adapter; fails before adapter exists, passes after.

**Exit gate:** bun template serves HTTP + WS and compiles to a standalone binary in CI.

---

## Phase C — replace yarn with bun for the monorepo dev toolchain (LAST, highest blast radius)
**Goal:** the repo itself uses bun. Affects every contributor + all the yarn machinery.

**Current yarn machinery being replaced:**
- `packageManager: yarn@4.10.3`, `.yarnrc.yml` (nodeLinker: node-modules), `yarn.lock`,
  `.yarn/`.
- Root scripts on `yarn workspaces foreach --topological-dev` (build ordering matters).
- `resolutions: { esbuild: 0.27.2 }`.
- **35** per-package `run-tests.sh` wrappers running `node --import tsx --test` + `c8`
  for coverage. **142** files import `node:test`.
- Husky `pre-commit`: `yarn install --immutable` + `npx lint-staged`
  (lint-staged runs `oxlint` + `prettier --write` on `*.ts`).
- CI `setup` action: corepack + setup-node (cache: yarn) + `yarn install`.

**Two unknowns that gate Phase C — SPIKE FIRST (Phase C.0):**
1. **`node:test` under `bun test`.** 110 files import `node:test`/`node:assert`. Does
   `bun test` run them as-is, or must imports move to `bun:test`? Spike: `cd packages/core
   && bun test src` and read the result. (`node:assert` is supported by bun; the question
   is the `node:test` runner + mock/subtest APIs.)
2. **Topological build ordering.** `build:packages` relies on `--topological-dev`. Does
   `bun run --filter '@pikku/*' build` honor dependency order, or do we need tsc project
   refs / a topo wrapper / turbo? Spike from a clean dist.

   Note: `build`/`tsc` are already `tsc -b` (TS project references), which carry their own
   dependency ordering — so the topo risk is mostly about non-tsc build steps and the
   `foreach` parallelism, not type compilation.

### Phase C.0 SPIKE RESULTS — run 2026-05-29, bun 1.3.14, in this worktree
Real command output only. (An earlier draft of this section cited a clean 1112-pkg
install and a "327 tests / 16 fail / msgpackr phantom-dep" result — those came from runs
that were **cancelled mid-flight** and are NOT reliable. Disregard them; verified facts
below.)

1. **`bun install --no-frozen-lockfile` FAILS at the root — blocker for Phase C step 1.**
   Output: `UnsupportedYarnLockfileVersion: failed to migrate lockfile: 'yarn.lock'` →
   `warn: Ignoring lockfile` → `Resolved, downloaded and extracted [5208]` →
   `warn: incorrect peer dependency "pino@10.3.1"` →
   `error: GET https://registry.npmjs.org/uWebSockets.js - 404`.
   No `node_modules` / no `bun.lock` produced (verified: `node_modules/@pikku/core` and
   `node_modules/uWebSockets.js` both absent afterwards).
   **Root cause:** `packages/runtimes/uws-server/package.json` declares
   `"uWebSockets.js": "uNetworking/uWebSockets.js#v20.58.0"` (GitHub-shorthand) and
   `uws-handler` declares `"uWebSockets.js": "*"`. yarn resolves the bare `owner/repo#ref`
   shorthand as a git dep; **bun treats it as an npm package name and 404s.**
   NOTE: this is purely a **full-monorepo `bun install`** concern — these are the existing
   **Node-target** uws packages. The bun *runtime* (Phase B) never consumes this npm
   package (`Bun.serve` is uWebSockets internally). So this only affects Phase C's repo-wide
   install, not Phase B — and even there it's sidestepped, not fixed (see below).
   **DECISION: don't run uws under bun at all.** The uws packages
   (`@pikku/uws` / `@pikku/uws-handler`) and the `uws` template stay **Node-only** — bun
   apps use `Bun.serve` (which is uWebSockets anyway), so there's no reason to make the uws
   npm package resolve under bun. Rather than rewrite the dep spec, **exclude these
   packages from the bun install/test/CI scope.** For the repo-wide `bun install` (Phase C),
   either keep these as Node-only workspaces excluded from the bun toolchain or skip
   their install — TBD in Phase C step 1. The dep spec is left as-is (yarn is happy with
   it).

2. **`node:test` describe/it/beforeEach/assert WORK under `bun test`.**
   `cd packages/core && bun test src` → **841 tests across 61 files [3.28s]; 814 pass /
   26 fail / 1 skip**. The bulk of core's 60 `node:test` files run unmodified — no
   wholesale `node:test`→`bun:test` codemod needed. (Sanity: `bun test
   src/permissions.test.ts` → 20 pass / 0 fail. Running a file *directly*, `bun
   file.test.ts`, correctly errors "Cannot use beforeEach() outside of the test runner" —
   same as `node --test`; go through `bun test`.) Caveat: this ran against a partial env
   (root install failed), so re-run after fixing #1 to trust exact counts — but the
   runner-compat conclusion holds.

3. **The real `node:test` gap is the `mock` API — `mock.fn is not a function` under bun.**
   Dominant failure bucket (~20 of 26): `packages/core/src/wirings/oauth2/
   oauth2-client.test.ts`, every case doing `globalThis.fetch = mock.fn(...)`. Bun's
   `node:test` shim doesn't implement `mock.fn`/`mock.method`/`mock.timers`. **Blast radius
   is tiny: exactly 1 file in the whole repo uses `mock.*`** (grep-verified). Fix: rewrite
   that one file to `import { mock } from 'bun:test'` (or a hand fake), or keep just it on
   the node runner. The remaining ~4 fails are in `src/dev/hot-reload.test.ts` — `fs.watch`
   debounce **timing** assertions (got 'old' vs 'new', count 0 vs 5); bun's watch timing
   differs from node's so the 300ms waits flake — re-tune or mark runtime-specific, not a
   correctness bug. (No msgpackr failure occurred in this run; the earlier msgpackr claim
   is withdrawn.)

4. **Topological build — only a narrow probe so far.** `bun run --filter '@pikku/core'
   build` runs `tsc -b`, exit 0. Since every package's `build` is `tsc -b` with TS project
   references, TypeScript self-orders the type build regardless of bun's `--filter`
   scheduling — low risk there. NOT yet proven for a clean-dist `--filter '@pikku/*'` run
   or for **non-tsc** steps (console vite build, addon bundling, `build:console` copy) —
   those keep explicit ordering when translated off
   `yarn workspaces foreach --topological-dev`.

**Net read:** Phase C's feared big cost (rewriting 110 test files for a new runner) is NOT
needed — `node:test` is largely drop-in under `bun test`. The concrete blockers are small
and specific: (a) the uws packages 404 under `bun install` — **handled by excluding uws
from the bun scope (Node-only), not by fixing the dep**; (b) one file uses the unsupported
`node:test` mock API; (c) a few `fs.watch` timing tests flake. With uws excluded, re-run
the full install + `bun test` for trustworthy counts.

The spike outcomes decide whether C is a 1-day or 1-week job. No guessing.

**Steps (after spikes):**
1. **Package manager:** drop `.yarnrc.yml`/`.yarn/`/`yarn.lock`; add `bunfig.toml`;
   `packageManager: yarn` removed; `resolutions` → bun `overrides`; keep `workspaces`
   globs (bun supports `workspace:*`). `bun install`, commit `bun.lock`.
2. **Scripts:** `yarn workspaces foreach …` → `bun run --filter` (or topo wrapper from
   spike #2); `yarn workspace X` → `bun run --filter X`.
3. **Tests:** replace the 36 `run-tests.sh` + `node --import tsx --test` with `bun test`;
   node coverage (lcov) → `bun test --coverage`. No mass `node:test`→`bun:test` codemod
   needed (spike #2). EXCEPT: rewrite the one `mock.*` file
   (`packages/core/src/wirings/oauth2/oauth2-client.test.ts`) to `bun:test`'s mock or a
   hand fake (spike #3), and re-tune `src/dev/hot-reload.test.ts` watch timings.
4. **Hooks/docs:** `.husky/pre-commit` → `bunx`/`bun run`; update `CLAUDE.md`, README,
   `run-tests.sh` references.
5. **CI:** `setup` action → `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`;
   all `yarn X` → `bun run X` in `develop.yml`/`main.yml`/`build` action; `npx pikku`
   → `bunx pikku` in `e2e-codegen`; `release` under bun (changeset publish works).
6. **fabric:** switch fabric to bun (its own repo/worktree per memory — separate change).
7. **Verifier (TDD):** CI dry-run that build + a sample `bun test` is green; treeshaking
   + types verifiers still pass under the new toolchain.

**Exit gate:** full CI green on bun; contributors run `bun install` / `bun test`.

---

## Cross-cutting risks
- **GitHub-shorthand dep specs break `bun install`** (proven: uWebSockets.js 404). Any
  `"pkg": "owner/repo#ref"` dep would need `"github:owner/repo#ref"` for bun. The only
  current case is the uws packages — and the **decision is to keep uws Node-only and exclude
  it from the bun scope** rather than fix the spec. Still worth auditing for *other*
  shorthand git deps before Phase C (none found so far).
- **`node:test` `mock` API is unimplemented in bun** (`mock.fn`/`mock.method`/`mock.timers`).
  Only 1 file uses it today; keep new tests off `mock.*` or use `bun:test`'s mock.
- **`fs.watch` timing differs** under bun — time-based watch/debounce tests flake. Hot-
  reload itself works (it's production-capable per repo memory); only the test timings need
  re-tuning.
- **Bun CJS→ESM named-import interop** is stricter than Node's: `import { X } from 'cjs-pkg'`
  can fail under bun where node's CJS named-export heuristic succeeds. NOT yet observed in
  this codebase (the earlier msgpackr example was from an unverified run) — but worth a
  quick audit of static named imports of CJS-only deps once `bun install` succeeds.
- **trustedDependencies:** bun blocks postinstalls by default; native deps need trusting in
  `bunfig.toml`/package.json or they won't build in CI. (Couldn't enumerate them this run —
  install failed before reaching postinstall; re-check after fixing the uws dep.)
- Native deps (uws, better-sqlite3, bullmq's ioredis, pg) under `bun install` — surfaces
  in Phase A (the canary) before it can bite Phase C.
- Portal dedup hack (TS2345) has no direct bun analog — Phase A step 2.
- Contributor friction: bun becomes required for repo work (Phase C).

## Repo rule reminders (from CLAUDE.md)
- Every phase needs verifier coverage that **fails before, passes after** (TDD/BDD).
- All pikku work needs a **GitHub issue**; branch names must include the issue ID — this
  worktree branch (`pikku-bun-default`) should be renamed/backed by an issue before PRs.
- No new inline comments; never remove existing comments/JSDoc.
