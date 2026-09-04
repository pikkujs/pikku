# Adding a second frontend

Read this when the split you recorded in Phase 2 is "separate apps" and you have
reached the milestone that needs the second one. **Not before.** Cloning
`apps/app` materialises a directory of copied screens; doing it during planning
leaves `pikkufabric.config.json` pointing at an app nobody has designed yet.

If the split is "one app with paths", you never need this file — add route
segments under `/app` and give each audience its own entries in `useNavItems()`.

## The clone

```bash
cp -R apps/app apps/admin
rm -rf apps/admin/node_modules apps/admin/src/paraglide
```

`src/paraglide` is compiled from `messages/` by the Vite plugin on first run;
copying it forward ships one app's compiled strings inside another.

Then, in order:

### 1. `apps/admin/package.json`

- `name` → `@project/admin`
- `dev` and `preview` ports → `7105`. Every frontend needs its own, or the second
  one fails to bind and the dev runner looks like it hung.
- the `--tsBuildInfoFile` path inside the **`tsc` script** → `admin-tsc.tsbuildinfo`.
  In this template it is a CLI flag on that script (`tsc --noEmit --incremental
  --tsBuildInfoFile node_modules/.cache/app-tsc.tsbuildinfo`), not a
  `compilerOptions` entry — `tsconfig.json` needs no change. Left alone, the two
  apps fight over one incremental cache and you get type errors that vanish on a
  clean build: an hour of debugging for a one-word edit.

### 2. `pikkufabric.config.json`

This file is the source of truth for what apps exist, and it is read whether or
not you ever deploy to Fabric.

```json
{
  "projectId": "__PROJECT_ID__",
  "frontends": {
    "app": {
      "cwd": "apps/app", "primary": true, "deploy": true, "kind": "ssr",
      "dev": { "command": ["bun", "run", "dev"], "port": 7104, "healthPath": "/" },
      "serves": "tenant",
      "personas": ["visitor", "chidi"]
    },
    "admin": {
      "cwd": "apps/admin", "primary": false, "deploy": true, "kind": "ssr",
      "dev": { "command": ["bun", "run", "dev"], "port": 7105, "healthPath": "/" },
      "serves": "owner",
      "personas": ["amina", "bilal"]
    }
  }
}
```

Two things to fix while you are in here, not just add:

- **The shipped `app` entry may say `["yarn", "dev"]`** while the rest of the
  project is driven with bun. Correct it. A frontend that starts under a package
  manager the project does not use is a failure that only appears on someone
  else's machine.
- **`serves` and `personas` name real personas.** Every persona should appear
  under exactly one frontend. A persona listed nowhere is a person with no way
  in, and that is a design bug worth seeing now rather than at review.

### 3. The dev runner

`dev.mjs`, under the project's scripts directory, spawns `@project/app` **by
name** and will silently never start your second app — the frontend simply is not
there, with no error to explain it.

Make it read the `frontends` map and spawn one child per entry, rather than
adding a second hardcoded line. Two sources of truth for "which apps exist" is
the drift this whole file is trying to avoid.

### 4. `personas.ts` → `app`, and `pikku.config.json` → `appUrls`

The `personas` array in `pikkufabric.config.json` documents the split. It is NOT
what the scenario runner reads: each persona in `packages/functions/src/personas.ts`
carries its own `app: '<frontend>'`, and `@pikku/playwright` resolves a persona's
base url from that name at sign-in. Set it on every persona in both apps — a
persona with no `app` lands on the fallback frontend, which is the other app's
screens with the right session on them.

One environment is enough. `pikku.config.json` takes an `appUrls` map beside the
single `appUrl` fallback, and the CLI takes `--app-url <app>=<url>,<app>=<url>`:

```json
"local": {
  "apiUrl": "http://localhost:3000",
  "appUrl": "http://localhost:7104",
  "appUrls": { "app": "http://localhost:7104", "admin": "http://localhost:7105" }
}
```

Three things follow, and each one has cost a run:

- **An actor is bound to ONE app for the whole run.** The resolution happens once,
  at sign-in. A staff persona cannot be walked through the customer app to check
  something is absent from it — drive that assertion with a persona who lives
  there, and say in the scenario's docblock why the witness is who it is. This
  binds a SIGNED-OUT scenario too, and that is where it bites: 'a visitor with no
  session cannot open the admin desk' driven by a customer-app persona points the
  browser at a router with no such route at all, so what the assertion measures is
  a 404, not the guard — and on an app with a catch-all redirect to login it
  passes while proving nothing. Pick the actor by which app owns the ROUTE, not by
  who should be refused, and drop their session instead.
- **Every frontend needs its API proxy pointed at the API you are actually
  running.** `vite.config.ts` reads a variable (`VITE_API_PROXY`) with a default
  port in it; start the second app without it and every RPC from that app
  answers 500 while the first app is green, which reads as an auth bug for as
  long as you let it.
- **A route sweep must be scoped to one app.** `staticRoutes(repoRoot)` in
  `@pikku/playwright` unions the route trees of every directory under `apps/`, so
  a sweep driven by a customer opens the admin app's routes and reports 404s that
  are correct behaviour. Give the sweep step an `app` input and hand it a root
  containing only that app.

### 5. Re-run `bun install`

`apps/*` is already globbed in the root workspaces, so this just links the new
one.

## Sessions across two origins

Better Auth lives once, at `/api/auth/*`, and every app proxies to it (see
`vite.config.ts` — `/api/auth` keeps its prefix, everything else under `/api` is
rewritten to the pikku dev server).

- **In local dev, cookies are scoped by host and ignore the port**, so
  `localhost:7104` and `localhost:7105` share a session. Convenient, and a trap:
  the app boundary is invisible in dev and only the role check is doing work.
  That is the correct design — but do not read a working dev session as evidence
  the permission check exists. The refusal scenario is the evidence.
- **In production on two subdomains**, the session cookie needs a parent domain
  (`.example.com`) or each app gets its own login. Decide which, set it per the
  `pikku-auth` skill, and record it in `knowledge/decisions/security/`.
- **Never hardcode a host or port.** The API base resolves to same-origin `/api`.

## Building the second app's screens

Same rules as the first: pages in `apps/admin/src/pages/`, routes in
`apps/admin/src/routes/`, the same generated hooks from
`@project/functions-sdk/pikku/api.gen`, its own `useNavItems()`, its own
`messages/` directory.

A string used by both apps belongs to whichever app renders it. Duplicating it
beats a shared bundle that couples the two apps together — the moment they share
a string file, they share a release.
