---
name: pikku-admin-to-fabric
description: 'Port a legacy back-office admin (ActiveAdmin, Django admin, Rails Admin, Laravel Nova, Filament) to Fabric admin screens, driven by a `.knowledge/` Product Blueprint. Covers the admin-DSL→Fabric mapping (resources→screens, index/column→tables, filter→query params, scope→query variants, member_action/collection_action→pikkuFuncs, permit_params→input schemas), the "the admin is half your app" audit, and admin-specific permissions. TRIGGER when: porting/rebuilding a legacy app that has a generated/DSL-driven admin, or the user says "port the admin screens" / "implement the admin". DO NOT TRIGGER when: no legacy admin exists (use pikku-fabric to build screens fresh), or the app is being extended rather than ported (use pikku-feature).'
installGroups: [fabric]
argument-hint: '<path to .knowledge/> [resource to port next]'
---

# Legacy admin → Fabric admin screens

## Agent Operating Procedure

1. **Count first.** How many commands cite the admin? That number decides whether this is a chore or a third of the project.
2. **The blueprint already has the commands.** Do not re-derive them from the DSL. Map to them.
3. **Port the actions before the screens.** A screen with no action behind it is a table; the actions are the product.
4. **One resource per slice**, same as `pikku-blueprint-to-fabric`. Verify green before the next.
5. **An admin permission is not a checkbox.** Legacy admins routinely authenticate and do not authorize. Do not port that.
6. **Record what you did NOT port**, per resource, in the parity report.

## The mistake this skill exists to prevent

> "It's just the admin — CRUD screens over the same tables. We'll scaffold it at the end."

This is wrong in a specific, measurable way, and you can check it in one command
before you believe anything else in this file:

```bash
node -e "
const c = require('./.knowledge/commands.json').commands
const admin = c.filter(x => (x.evidence||[]).some(e => (e.file||'').match(/admin/)))
console.log(admin.length + ' of ' + c.length + ' commands live in the admin')
"
```

On a real Rails app (Applause, 39 ActiveAdmin resources, 5,545 lines of DSL) the
answer was **82 of 187 — 44%**, plus 71 of 223 API surfaces. The admin was not a
side panel over the customer-facing app. It was nearly **half the application's
write surface**, and a large share of those commands existed *nowhere else*:
issue a refund, retrigger a payment, queue a sync, impersonate a user, mark a
blade returned, reassign a company. There is no customer screen for any of them.

So: the admin is not the last 10% of the port. Budget it as what the count says.

**Corollary — the admin is where the unguarded capabilities live.** A
`member_action :impersonate` or `:create_stripe_refund` is a command that moves
money or identity, defended in legacy by nothing more than "you reached an
`/admin` URL". Every one of these needs a real `pikkuPermission` in the rebuild,
and writing them is the point of the port, not overhead on top of it.

## Stage 0 — Preflight

- The `.knowledge/` blueprint must exist and validate (`0 error(s)`). If not, run
  **pikku-software-archaeology** first. This skill maps to the blueprint; it does
  not parse Ruby.
- Read `parity-*.md` for the domains you are about to touch. Renames decided in an
  earlier slice (a `tenant` that became a `Market`, a `membership_level` that
  became a `certification_level`) are binding here. An admin screen that reintroduces
  the old word undoes the decision.
- Run the count above and say the number out loud in your plan.

## Stage 1 — Inventory the DSL

Every generated admin is the same six ideas under different syntax. Inventory
them, do not read them line by line:

```bash
# ActiveAdmin
grep -rhoE "^\s{0,4}(index|show|form|filter|scope|action_item|member_action|collection_action|batch_action|permit_params|csv|sidebar|panel|actions)\b" app/admin/*.rb | sort | uniq -c | sort -rn
grep -rhoE "(member_action|collection_action) :[a-z_]+" app/admin/*.rb | sort -u
```

| Legacy | Also called | Becomes in Fabric |
|---|---|---|
| `ActiveAdmin.register X` / `class XAdmin` | resource, ModelAdmin, Nova Resource | one TanStack route + one screen |
| `index do … column :x` | `list_display`, `columns()` | a Mantine `Table`/`DataTable`, columns from the query's return type |
| `filter :x` | `list_filter`, `searchable` | typed input fields on the list query |
| `scope :active` | `get_queryset` variants, `Nova::Filters` | a named variant of the list query — NOT a new function per scope |
| `form do f.input …` | `fields()`, `fieldsets` | a Mantine form; inputs from the command's zod input schema |
| `permit_params` | `fields`, `$fillable` | you already have this: it is the command's input schema. Cross-check, don't re-derive. |
| `member_action :foo` | custom action, `Nova::Actions` | **a `pikkuFunc`** — almost always already in `commands.json` |
| `collection_action :foo` | bulk action | a `pikkuFunc` taking a set |
| `batch_action` | admin action | a `pikkuFunc` taking ids[] |
| `csv do … end` | export | a readonly func returning rows; render client-side |
| `panel`/`sidebar` | inlines, `relations` | a section on the show screen, fed by a related query |
| `action_item` | — | a button. It is not a capability; find the action it calls. |

**`action_item` vs `member_action` is the distinction that matters.** An
`action_item` is a *button*; a `member_action` is a *capability*. Legacy files
pair them, and a fast reader counts the buttons. Count the capabilities.

## Stage 2 — Map actions to blueprint commands (do this before any UI)

For each `member_action`/`collection_action`, find its command in
`commands.json`. Three outcomes, and the third is the valuable one:

1. **Found** — the archaeology already lifted it (`ArchiveProduct`,
   `CancelInvoice`). Wire the screen to it. Nothing to build.
2. **Found under a different name** — the blueprint names concepts in domain
   language, the DSL names them after routes. `member_action :rerun` may be
   `RetryWebhookDelivery`. Match on behaviour, not spelling. **Use the blueprint's
   name.**
3. **Not found** — stop. Either the archaeology missed a command (fix
   `.knowledge/`, do not paper over it here) or the action is dead code. Both are
   findings. Do not quietly invent a command to fill the gap: a command with no
   blueprint entry has no evidence, no policy and no actor, and you will not
   notice which.

Two legacy shapes to expect and *not* reproduce:

- **`*_form` + `*` action pairs** (`create_stripe_refund_form` +
  `create_stripe_refund`, `issue_payment_form` + `issue_payment`). The `_form` half
  is a GET that renders a modal — it is a *screen*, not a capability. It collapses
  into the screen; only the second half is a `pikkuFunc`. Porting both doubles your
  command count with phantoms.
- **A `member_action` that only redirects** to another action. That is routing.
- **An action disabled in the production environment is not a live capability.**
  Grep the environment guards before porting:
  ```bash
  grep -rn "env.production?\|env\.development?\|ENV\[" app/admin/*.rb
  ```
  On Applause, both halves of `create_stripe_refund` open with
  `return redirect_to … if Rails.env.production?` — the admin refund screen has
  never run in production, and refunds are actually issued in the Stripe dashboard.
  Porting it faithfully would ship a prominent button for a capability the business
  does not use through this app, and quietly move refunds into a surface nobody has
  ever tested. Whether it should now exist is a **product decision**, not a port.
  Check the guard is on the *mutating* half too: if the form is blocked and the POST
  is not, you have found a hole rather than a dead feature.

## Stage 3 — Permissions (the part legacy skipped)

Generated admins authenticate and then trust. The whole admin sits behind one
"is an admin" check, and every action inside it is equally reachable — refunds,
impersonation and editing an FAQ all guarded identically.

- Read `policies.json` for the real rule per command. If the blueprint says the
  policy is `enforcedBy: nothing`, that is a **gap you are now closing**, not a
  behaviour to port.
- With Better Auth's `admin()` plugin, `user.role` is the platform role and
  `session.impersonated_by` is set during impersonation. Both are yours already.
- **Money and identity actions deserve their own permission**, not the blanket one.
  If the blueprint offers no rule, that is a `decisionsNeeded` entry — ask, do not
  invent.
- **Impersonation:** Better Auth's `impersonateUser`/`stopImpersonating` replace the
  hand-rolled version. If the legacy audit table recorded only the *start* of an
  impersonation (no `ended_at`, no session id), do not port it — the Fabric audit
  table already answers "what did they do while impersonating", which was the whole
  question it failed to answer.

## Stage 4 — Screens

- The list query is `pikkuSessionlessFunc` + `readonly: true`; filters and scopes
  are **input fields on one function**, not one function per scope. Legacy needs a
  method per scope because the DSL has no parameters. You do not.
- Columns come from the query's return type. If a column exists in the DSL but not
  in the type, the DSL was computing it in Ruby per row — that is an N+1 wearing a
  column, and it belongs in the query.
- Reuse the app's Mantine theme. An admin styled differently from the product is
  how design systems fork.
- **Server-computed charts** (chartkick/groupdate and friends) do not port. The
  aggregation becomes a real query; the plot becomes a chart component. This is the
  one genuinely expensive screen in most admins — cost it separately.
- **Drag-and-drop reordering** (`acts_as_list`, sortable tables) is custom logic,
  not a table. Port the position semantics deliberately.

## Stage 5 — Verify and report

```bash
pikku all && pikku fabric validate --json
```

Per resource, the parity report records:

- **Ported** — screens + which blueprint commands back them.
- **Deliberately not ported** — with the reason. Expect: `*_form` halves, dead
  actions, single-member enums, screens over dropped tables.
- **Now authorized** — every action that was guarded by "reached an /admin URL"
  and now has a real permission. This is the port's dividend; name it.
- **Still open** — actions whose rule the blueprint could not settle.

## Red Flags

| Thought | Reality |
|---|---|
| "The admin is just CRUD, scaffold it last" | Run the count. It was 44% of commands on a real app, and those commands exist nowhere else. |
| "I'll read the DSL and write the commands" | The blueprint already has them, with evidence, actors and policies. Map; don't re-derive. |
| "One function per scope" | A scope is a filter argument. The DSL needed a method because it has no parameters. |
| "`action_item` count = capability count" | Buttons aren't capabilities. Count `member_action`/`collection_action`. |
| "Port `create_stripe_refund_form` too" | It is a GET that renders a modal. It is a screen. Only the non-`_form` half is a command. |
| "Admins are admins; one permission is fine" | That is the legacy bug. Refunds and FAQ edits are not the same risk. |
| "The admin action isn't in commands.json, I'll add it" | Stop. Either the archaeology missed it (fix the blueprint) or it is dead. Both are findings. |
| "I'll restyle the admin, it's internal" | An admin off the product's theme is how a design system forks. |

## Quick Reference

```bash
# 1. how much of the app is actually the admin?
node -e "const c=require('./.knowledge/commands.json').commands;console.log(c.filter(x=>(x.evidence||[]).some(e=>(e.file||'').match(/admin/))).length+'/'+c.length)"

# 2. inventory the capabilities (not the buttons)
grep -rhoE "(member_action|collection_action) :[a-z_]+" app/admin/*.rb | sort -u

# 3. per resource: map actions -> commands.json, then build the screen
# 4. verify
pikku all && pikku fabric validate --json
```

## Related skills

- **pikku-software-archaeology** — produces the `.knowledge/` blueprint this needs.
- **pikku-blueprint-to-fabric** — the parent port; run this per-domain alongside it.
- **pikku-better-auth** — `admin()` plugin: roles, ban, impersonation.
- **pikku-fabric** — screens, theme, Mantine conventions.
