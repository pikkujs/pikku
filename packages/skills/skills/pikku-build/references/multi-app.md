# Adding a second frontend

Read this when the split you recorded in Phase 2 is "separate apps" and you have
reached the milestone that needs the second one. **Not before.** Cloning
`apps/app` materialises a directory of copied screens; doing it during planning
leaves `pikkufabric.config.json` pointing at an app nobody has designed yet.

If the split is "one app with paths", you never need this file — add route
segments under `/app` and give each audience its own entries in `useNavItems()`.

## Deciding it is two apps, not one

The split you are acting on should already be recorded, but this is the reasoning
behind it — and the place people get it wrong is the third case at the bottom.

**A group that comes in through its own front door gets its own app.** A role
*inside* an app is not that: it changes which nav items and which buttons a person
sees, and lives in `useNavItems()` and the `permissions` on the function, not in a
route subtree.

**The test is which side of the counter they are on.** Colleagues share one app and
differ by nav — the mechanic, the person on the counter, the bookkeeper. Someone
across the counter with an account of their own gets their own — the customer, the
tenant, the patient. One app is a real answer and often the right one.

**The asymmetry that forces a split is sign-up.** Where staff accounts are created
*for* people and customers create their own, the two need different sign-up, different
onboarding and different session shape, and bending one app around both costs more
than the second app does. Do not collapse two audiences into one app to save a build.

Never invent a person the notes do not name in order to reach two.

### The group that never signs in

Some people use the product with no account at all — ordering from a menu, booking a
table, opening an invitation. They are not a third case, and **they do not get their
own frontend**: an app is built around the personas who sign into it. What they get is
the public route space every app already has.

- **`/app/*` is the signed-in application.** One `beforeLoad` on `/app` bounces a
  signed-out visitor to the login. There is no per-route exception.
- **Every other route is public** — `/`, `/menu`, `/book`, `/r/$code`. No gate, no
  session.
- **`/` is a landing page and you must write it.** A starter that forwards `/` to
  `/app` does so only because it ships no homepage. Leave the forward in and the
  product's front door is a sign-in form: the anonymous visitor arrives at a login it
  has no account for and never reaches the thing it came for — **while every check
  still passes**, because everything that looks at the app signs in first. This is the
  failure this section exists for.

So a screen whose users have no account goes at `/menu`, never `/app/menu`.

### The frontend guard is UX and proves nothing

The bundle is on the origin and the nav is a client-side decision; anyone can read
both. The security boundary is the `permissions` field on the function — see
pikku-permissions. Hiding a nav item keeps people out of screens that would confuse
them; it never protects data. Never let a hidden UI be the only thing between a user
and someone else's record: if the invoices nav item is hidden but `listAllInvoices`
has no `permissions`, the app is wide open and the nav is decoration.

Worth a scenario each, because they are two different claims: that a mechanic cannot
*see* the invoices nav item, and that their call to an invoices RPC is *refused*. The
second is the one that catches a `permissions` field nobody wired.

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

### 4. `pikku.config.json` → `environments`

`local.appUrl` points at one app. Add an environment per frontend (`local`,
`local-admin`) so the browser scenario pass can drive either one. A browser
scenario run against the wrong `appUrl` fails on a missing element and reads like
a UI bug rather than a config one.

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
