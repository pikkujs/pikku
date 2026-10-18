# Phase 2 — Who it is for, and what it is made of (§3, §4)

Part of the app workflow (`app.md` is the index and the rules that hold throughout). Declare the people, then decide the apps.

## 3. Declare the people — virtual users and roles

The answer to "who uses it" becomes code, in one file:
`packages/functions/src/virtual-users.ts`. It ships with a single `visitor`; add the
people the user named, and the roles they imply.

```typescript
import { defineVirtualUsers } from '#pikku/scopes/pikku-virtual-users.gen.js'
import { defineSystemRole } from '#pikku/scopes'

defineSystemRole({
  owner: {
    displayName: 'Owner',
    description: 'Runs their own properties — sees only what they own',
    scopes: [],
  },
  tenant: {
    displayName: 'Tenant',
    description: 'Lives in one unit — sees only their own tenancy',
    scopes: [],
  },
})

defineVirtualUsers({
  visitor: {
    name: 'Visitor',
    jobTitle: 'Synthetic health-check user',
    account: {},
  },
  amina: {
    name: 'Amina',
    jobTitle: 'Property owner',
    personality: 'Checks arrears first, every single time',
    roles: ['owner'],
    account: {},
  },
  bilal: {
    name: 'Bilal',
    jobTitle: 'Property owner',
    personality:
      'A second owner — exists so "you see yours, not theirs" is testable',
    roles: ['owner'],
    account: {},
  },
  chidi: {
    name: 'Chidi',
    jobTitle: 'Tenant',
    personality: 'Reports the boiler, wants to know it was seen',
    roles: ['tenant'],
    account: {},
  },
})
```

- **Keep `visitor`.** The shipped scenarios name `virtualUsers.visitor`, and PKU677
  requires a browser step's virtual user to be a literal `virtualUsers.<name>`. Removing it
  stops `virtualUsers.visitor` type-checking, which fails `pikku all`, and nothing you
  write after that registers.
- **One `defineVirtualUsers` call for the whole project.** Codegen builds the
  `VirtualUserId` union from it, materialises one scenario virtual user per person, and
  seeds a user row each. A second call site is a second answer to "who uses this
  app".
- **`roles` is typechecked against `defineSystemRole`.** An undeclared role is a
  build error rather than a runtime surprise.
- **Never write an email address.** Each is derived from the virtual user id and
  `scenarios.emailDomain` in `pikku.config.json` — `visitor@virtualuser.local`.
  Hand-writing one is how a run signs in as somebody who was never created.
- **Declare a second person of the same kind** whenever the rule is ownership
  (`bilal` above). "You see yours, not theirs" is not testable with one owner,
  and §7 is where it gets caught.
- **Build the roles the user's answer produces, no more.** An invented role
  becomes invented screens and invented rules, and it is the user who has to
  live with them.
- **Roles are what a permission check reads, not where it lives.** The check goes
  in the function's `permissions` field (§6), never in the body. Read the
  `pikku-auth` skill.

`pikku virtual-user list` shows who is declared and `pikku roles audit` reports roles
the database still holds that code no longer declares — both need §0's bootstrap
to have run, and both are worth a look once it has.

**One warning about the scaffold's own notes:** `knowledge/index.md` may claim
the people live in `pikku.config.json`, put there by a virtual user command.
That is stale. In this template they live in `virtual-users.ts` as above, and
`pikku.config.json` carries no virtual users key at all — only `scenarios.emailDomain`.
Trust the file you can read over the note describing it.

## 4. Declare the apps — one API, several frontends

### The rule that makes it cheap

**One backend, many frontends. Never fork `packages/functions`.**

Every app imports the same generated SDK (`@project/functions-sdk`) and calls the
same RPCs. What differs is which screens exist and what the shell looks like.
What must NOT differ is the data layer: two copies of a `listProperties` function
is two places for the permission check to be wrong.

**The app split is presentation, not security.** A tenant app that simply never
renders the arrears screen is not access control — it is a hidden button.
Security is the `permissions` field on the function, and it holds whether the
caller arrived from the admin origin, the tenant origin, curl, or the generated
client. Build the split for clarity, and prove the boundary with a refusal
scenario in §7.

### Choosing the split

- **Separate apps on separate hosts** (`admin.example.com`, `portal.example.com`)
  — when the two audiences share almost no screens, when they should not see each
  other's brand register, or when one may later ship independently.
- **One app with paths** (`/app/admin/*`, `/app/portal/*`) — when they share most
  of the shell and the difference is a handful of screens. Cheaper, and honest:
  two nav trees in one app is still two apps to a user.

Either way, write the choice and its reason into `knowledge/decisions/`.

### Adding a second frontend — later, not now

Recording the decision is Phase 2 work. **Creating the directory is not.**
Cloning `apps/app` materialises a folder of copied screens, so it belongs to the
changeset that first needs the second app, not to planning.

When you get there, read the multi-app reference (see SKILL.md). It carries the clone, the
`package.json` edits, the `frontends` map in `pikku.config.json`, the dev-runner
change that otherwise silently never starts your second app, the per-frontend
scenario environments, and how sessions behave across two origins.

What Phase 2 owes you now is only this: the split, its reason, and who each app
serves, written into `knowledge/decisions/`.
