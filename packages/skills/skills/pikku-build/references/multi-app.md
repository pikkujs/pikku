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
pikku new app admin --serves staff --personas manager,mechanic
```

One command does every step this section used to list by hand: it clones the
primary frontend (skipping `node_modules` and `src/paraglide`, which is
compiled from `messages/` on first run and would otherwise ship one app's
strings inside another), re-points the clone's `package.json` at its own name,
its own dev/preview port and its own `--tsBuildInfoFile`, stamps `app: '<slug>'`
onto each named persona in `definePersonas({…})`, adds the `frontends` entry,
and re-runs `bun install`.

`--from <slug>` clones something other than the primary app. `--install false`
skips the install when you are batching several.

**The `--tsBuildInfoFile` edit is the one that used to bite.** Two apps sharing
one incremental cache produce type errors that vanish on a clean build: an hour
of debugging for a one-word edit. It is handled now, but it is why you should
not clone by hand.

### What it refuses, and why that is the valuable part

The scaffolding is five file edits. Getting the audience wrong is a whole
second app nobody needed, so the command will not create one when:

- **`--serves` names a surface.** `dashboard`, `portal`, `admin`, `console`,
  `ui` and friends say nothing — every frontend is an app. Name the people in
  their own word: staff, customer, supplier, patient.
- **An existing app already serves that audience.** People sharing an audience
  share ONE app and differ by nav and permitted actions. A new app is for a
  group the first app is not for.
- **A named persona already signs into another app.** A person signs into one
  app; move them out first if they really belong here.
- **The slug is what the plan calls an app that already exists.** The plan's
  FIRST app is the one the project starts with — only the apps after it get
  created.
- **A persona is not in `definePersonas({…})`.** The app is built around who
  signs into it, so it is not created for people who do not exist yet.

It also repairs its own half-states: a run that died between writing the
directory and writing the config entry leaves one without the other, and
neither survives alone, so the next run clears the remains and carries on
rather than sending you in to do the surgery by hand.

### What it does NOT do

It stops after `bun install`. Serving the new app — a reverse proxy, a
supervisor, a dev runner, a deploy target — belongs to whatever is hosting it.
On a plain checkout, `bun --filter @project/<slug> dev` is enough.

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
