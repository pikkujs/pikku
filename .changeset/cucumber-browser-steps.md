---
"@pikku/cucumber": minor
---

Add `@pikku/cucumber/browser` — a universal Playwright browser-test harness so
projects (and build agents) write only `.feature` files, never step code.

- Third-person actor grammar via a `{actor}` Cucumber parameter type: a quoted
  persona name (`"the admin"`) creates/reuses an actor with its OWN browser
  context (window, cookie jar, session); `they` resolves to the last-referenced
  actor. The transformer resolves straight to the `ActorSession`. Multi-actor
  scenarios (realtime: one actor publishes, another sees it live) work out of
  the box.
- A Mantine-aware step vocabulary mapping to component families: `click(s)`,
  `fill(s)` (+ table form), `turn(s) on/off` (Switch/Checkbox/Chip),
  `select(s) … from` (Select/Autocomplete), `choose(s) … in`
  (Radio/SegmentedControl), `pick(s) date`, `upload(s)`, `switch(es) to the …
  tab`, row-scoped steps, `confirm(s)`/`dismiss(es)` (Modal + native dialogs),
  notification/table/URL/text assertions, and a `wait(s) until they see`
  long-poll.
- An element registry (`elements.json`, meant to be generated from the app's
  data-testids): per-kind `name → selector` maps (buttons/fields/links/tabs/
  tables/menus) resolved first, with Mantine heuristics (testid → role/label →
  placeholder → text) as fallback.
- Smoke built-ins: `a test account exists`, `sign(s) in through the login
  form`, `land(s) on the app`, and the `every page loads without errors` route
  sweep (TanStack route-tree enumeration, per-page console/pageerror/failed-
  request/API-error collection, transient-aware retries).
- Better Auth session bootstrap per actor (`is/are signed in`), personas from
  `E2E_PERSONAS` or derived deterministically from the actor name, and a
  data-reset bridge (`the app data is reset`) for a dev-only reset RPC.

Consumers pass their cucumber API in (`registerBrowserSteps({ Given, When,
Then, defineParameterType })`, `registerBrowserHooks({ Before, After })`) —
the package depends only on `@playwright/test` (optional peer).
