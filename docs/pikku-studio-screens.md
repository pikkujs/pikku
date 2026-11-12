# Addon screens in Pikku Studio: `definePlugin`

An addon can ship screens that Pikku Studio mounts. It declares them with
`definePlugin` in its own source, usually `src/screens.ts`, and the app opts in
by wiring the addon with `ui: true`. `pikku new addon <name> --ui` scaffolds an
addon that already has one.

```ts
import { definePlugin } from '@pikku/core/addon'

export default definePlugin({
  title: 'invoices__title',
  screens: [
    {
      path: '/invoices',
      title: 'invoices_list__title',
      scope: 'project',
      nav: {
        area: 'project',
        icon: 'receipt',
        order: 30,
        badge: 'unpaidCount',
      },
      needsApp: true,
      agent: 'invoices',
      scopes: ['invoices:read'],
      component: () => import('./screens/Invoices.js'),
    },
    {
      path: '/invoices/settings',
      title: 'invoices_settings__title',
      scope: 'team',
      nav: { area: 'team', icon: 'settings', order: 40 },
      component: () => import('./screens/Settings.js'),
    },
  ],
})
```

## Screen fields

| Field                | Meaning                                                                                                                                                                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`               | The route path.                                                                                                                                                                                                                                                                                             |
| `title`              | A message key in the addon's catalog. It is also the nav label.                                                                                                                                                                                                                                             |
| `component` or `app` | A lazy `() => import('...')` the host renders, or `app`, a static program it serves in a sandboxed iframe.                                                                                                                                                                                                  |
| `scope`              | `'studio'` gives `/<path>`, `'team'` gives `/<team>/<path>`, `'project'` gives `/<team>/<project>[/<target>]/<path>`.                                                                                                                                                                                       |
| `nav?`               | `{ area: 'rail' \| 'team' \| 'project' \| 'account', icon, order, badge? }`. `badge` names a function of the addon that returns a count. Without `nav` the screen is routed but not listed.                                                                                                                 |
| `replaces?`          | `true` takes over the core screen at the same path. Only first-party addons may use it.                                                                                                                                                                                                                     |
| `needsApp?`          | Project screens only. Defaults to `false`.                                                                                                                                                                                                                                                                  |
| `layout?`            | `'bare'` renders the screen without the shell.                                                                                                                                                                                                                                                              |
| `agent?`             | The agent that answers in Studio's chat panel, in a second tab beside the general chat, while this screen is open. Either a name (`/^[a-z][a-z0-9-]*$/`) for an agent the addon ships, resolving to `agents/<name>.md` in its package, or `studio:<name>` for an agent Studio ships. See [Agents](#agents). |
| `defaultChat?`       | Whether Studio's general Chat tab shows on this screen, beside the `agent` tab. Defaults to `true`; `false` hides it, and with no `agent` the screen has no chat at all. A boolean literal. See [Agents](#agents).                                                                                          |
| `scopes?`            | Hides the screen and its nav from viewers without access. This is not access control: the addon's functions must enforce the same scopes.                                                                                                                                                                   |

The manifest `title` is a message key too: the addon's name in Studio.

## Messages

Titles are keys in `messages/{locale}.json` at the root of the addon's package,
next to its `package.json`. There is no field naming the catalog.

```json
{
  "invoices__title": "Invoices",
  "invoices_list__title": "All invoices",
  "invoices_settings__title": "Invoice settings",
  "invoices_agent__title": "Invoices assistant",
  "invoices_agent__description": "Answers questions about this project's invoices"
}
```

## Agents

A screen's `agent` names a file, `agents/<name>.md`, at the root of the addon's
package. The file is the agent's instructions and names the skills it follows;
skills are plain folders, `skills/<name>/SKILL.md`, found by convention. It
starts with frontmatter whose `title` and `description` are message keys in
`messages/en.json`, like a screen title: `title` labels the chat tab and
`description` is shown with it. For the `/invoices` screen above,
`agents/invoices.md`:

```md
---
title: invoices_agent__title
description: invoices_agent__description
---

You are the invoices agent. Follow the invoice-triage skill.
```

`agent: 'studio:<name>'` (for example `'studio:knowledge'`) picks an agent Studio
itself ships. `pikku all` cannot see Studio's agents, so it only checks the
format (`/^studio:[a-z][a-z0-9-]*$/`): no file is looked up, and no
`agentTitle` or `agentDescription` is recorded, because Studio takes them from
its own catalog. The addon needs no `agents/` folder for it.

For an agent the addon ships, `pikku all` records `agent`, `agentTitle` and `agentDescription` on the screen,
so Studio reads them without opening the markdown. A screen without `agent`
leaves the chat as it is.

The agent's tab sits beside Studio's general Chat tab. `defaultChat: false`
hides the general one, so the screen's agent is the only chat on it:

```ts
{
  path: '/invoices/triage',
  title: 'invoices_triage__title',
  scope: 'project',
  agent: 'invoices',
  defaultChat: false,
  component: () => import('./screens/Triage.js'),
}
```

`defaultChat` defaults to `true` and is only written into the metadata when the
screen declares it. `defaultChat: false` on a screen without `agent` is
allowed: that screen has no chat at all.

### Shipping agents and skills

`agents/` and `skills/` are read from the published package, so npm has to
include them. If `package.json` has a `files` list, it must name them:

```json
{
  "files": ["dist", "messages", "agents", "skills"]
}
```

An entry counts when it is `agents`, `agents/`, or a pattern under `agents/`
(`agents/**/*.md`); the same for `skills`. A root glob such as `**/*.md` does
not count, even though npm would publish the folder through it, so list the
folder as well. With no `files` field the check does not run: npm then leaves
out what `.npmignore` excludes, or `.gitignore` when there is no `.npmignore`,
so make sure neither excludes `agents/` or `skills/`. The `agents/` check only
applies to an agent that is otherwise valid: one that already fails with PKU365
gets that error alone.

### The `studio` block

Studio links an addon by the `studio` block in its `package.json`. Without
`studio.addon` it does not load the addon's agents or skills:

```json
{
  "studio": {
    "addon": "invoices",
    "ui": "./src",
    "messages": "./messages/{locale}.json"
  }
}
```

`addon` is the addon's short name, lowercase letters, digits and hyphens. It is
the `<addon>` in the scope `agent:<addon>:<name>` Studio gives an agent the addon
ships. `ui` is where the screens' source lives, and `messages` is the catalog
pattern.

`pikku new addon <name> --ui` scaffolds both the `files` list and the `studio`
block, with `addon` set to `<name>`.

## Widgets, things and arranged screens

Beside its own screens, an addon can declare three things Studio draws for it,
all optional:

- `widgets`: components the addon ships, by id. Studio draws them from data.
- `things`: something the addon can open as a card beside a screen, by kind.
- `arrangedScreens`: screens Studio lays out from widgets, by id. The addon
  writes no component for them: a `source` returns data, and each slot hands one
  key of it to a widget.

```ts
import { definePlugin } from '#pikku/addon/screens'

export default definePlugin({
  title: 'invoices__title',
  screens: [],
  widgets: {
    'aging-chart': {
      title: 'invoices_aging__title',
      description: 'invoices_aging__description',
      states: ['full', 'tile'],
      actions: ['open'],
      component: () => import('./widgets/AgingChart.js'),
    },
  },
  things: {
    invoice: {
      label: 'invoices_invoice__label',
      source: 'invoiceCard',
      copy: {
        overdue: {
          name: 'invoices_overdue__name',
          compact: 'invoices_overdue__compact',
          primary: { label: 'invoices_remind__label' },
        },
        paid: {
          name: 'invoices_paid__name',
          compact: 'invoices_paid__compact',
        },
      },
      parts: [{ widget: 'aging-chart', from: 'aging' }],
      actions: {
        void: {
          run: 'voidInvoice',
          label: 'invoices_void__label',
          destructive: true,
          confirm: 'invoices_void__confirm',
        },
      },
    },
  },
  arrangedScreens: {
    overview: {
      path: '/invoices-next',
      title: 'invoices_overview__title',
      scope: 'project',
      source: 'invoicesOverview',
      slots: [
        {
          widget: 'verdict',
          from: 'verdict',
          span: 'full',
          copy: {
            late: { headline: 'invoices_verdict_late__headline' },
            fine: { headline: 'invoices_verdict_fine__headline' },
          },
        },
        { widget: 'aging-chart', from: 'aging' },
      ],
      shows: ['invoice'],
      redirect: { empty: '/invoices/getting-started' },
      poll: { fast: 3000, slow: 45000 },
    },
  },
})
```

A slot's `widget` is one of the addon's own `widgets` or a core widget Studio
ships, never another addon's. `related` (on a thing) and `shows` (on an arranged
screen) name the addon's own thing kinds. Arranged screens take `path`, `title`,
`scope`, `scopes` and `needsApp` like any screen, but no `component`, `app` or
`nav`; in this release Studio mounts them at their path only.

### Sources

`source` names the function Studio calls for the data, with
`{ projectKey, stage, range?, subject? }` (`subject` is set for a thing:
`{ kind, id }`). It is either:

- a function of the addon, by name. Its output has one key per slot's `from`;
  a thing's also has `head`, a `StudioCardHead`.
- a project RPC, `<namespace>:<function>`, such as `'console:listAgents'` or
  `'admin:listUsers'`. Studio calls it from the browser with the same client its
  own screens use. Its output is not typed, so `from` and variants are any string.

An action's `run` names a function the same two ways, or is `go:/<path>`:
Studio then takes the viewer to that path instead of calling anything.

### Actions, redirect and poll

- `actions` (on a thing or an arranged screen), by id: `run`, `label` (a message
  key), and `confirm` (a message key whose `{placeholders}` Studio fills from
  the data's `values`). `destructive: true` requires `confirm`; Studio asks
  before it runs.
- `redirect` (arranged screens) sends the viewer elsewhere when the source's
  `variant` is one of its keys: to another arranged screen of the addon, by id,
  or to a path (`'/...'`).
- `poll` (arranged screens) calls the source again: a number of milliseconds,
  or `{ fast, slow }` to back off from `fast` to `slow` once the data stops
  changing. Off by default.

### Text is always a declared key or an explicitly marked dynamic value

No words cross the wire. A source returns data: a `variant`, and raw `values`
(strings and numbers) beside it. The words are declared in `definePlugin` as
`copy`, per variant, and every one is a message key in the addon's catalog:

- a slot's `copy`: for each variant the data at its `from` can name, the texts
  the widget shows, by the widget's own names (`headline`, ...), each a key.
- a thing's `copy`: for each variant its `head` can name, `name`, `compact`,
  `lead?` and `primary?: { label, draft? }`.

A copy entry nests for deeper texts (`status: { text: 'key' }`), and numeric
names place list items (`tags: { 0: 'key' }`). A value that is itself a variant
(`values: { why: { variant: 'why_timeout' } }`) is worded by that variant's
`$`: `why_timeout: { $: 'key' }`. A head or a slot's data can carry `figures`,
`[{ variant, value?: { n, unit: 'count' | 'ms' | 'percent' } }]`, each worded
by its variant's `{ label, note?, value? }` in the same `copy`.

Copy is often shared. The inspector follows a `const` declared at the top of
the same file, and spreads of one, so this reads:

```ts
const VALUES = { why_timeout: { $: 'invoices_why_timeout' } }

copy: { ...VALUES, late: { headline: 'invoices_verdict_late__headline' } }
```

It does not follow a function call (`word('key')`), an import, or a `let`:
write `{ $: 'key' }` in place, or the build fails with PKU345.

Studio resolves the keys, fills their `{placeholders}` from `values`, formats
numbers, dates and plurals with `Intl`, and hands the widget the resolved
strings and the raw values. A widget's own chrome (axis labels, empty states)
lives in its package's catalog. Data that is not the addon's words (a user's
name, an invoice reference) is ordinary data: Studio marks it as dynamic before
it is shown. A plain string is never a way to show text.

`{placeholders}` are not typed against `values`: a key whose placeholder the
data does not carry renders the placeholder's name. Keep the two in step.

### Typing: `#pikku/addon/screens`

`pikku all` writes `#pikku/addon/screens` for an addon: `definePlugin` typed
against the addon's own functions and the keys of its `messages/en.json`.
Imported from there rather than from `@pikku/core/addon`, tsc checks:

- `source` and `run` name a function of the addon, or a project RPC by shape;
- `from` is a key of the source function's output;
- each `copy` words every `variant` its data can name, figures included;
- `redirect` keys are variants of the source and its targets are arranged
  screen ids or paths;
- every message key is in `messages/en.json`.

Core widgets are typed through `WidgetRegistry`, which `@pikku/core` leaves
empty; Studio's widget package fills it by module augmentation, with the data
each widget takes. With `@pikku/core/addon`'s own `definePlugin` everything is a
plain string; the build checks below still run.

Studio decides which addons may place widgets at all; this release declares no
trust field.

### Calling another addon

An addon that calls another addon's functions declares it under `pikku.uses`
in its `package.json`, a record of alias to `package@range`
(`{ "cloud": "@acme/addon-cloud@^1" }`), and the app maps each alias on
`wireAddon({ uses: { cloud: 'cloudApi' } })`; see
[remote-rpc.md](./remote-rpc.md). A project RPC source or action
(`'console:listAgents'`) needs no declaration: Studio calls it through the
host's own project client.

### What the host receives

The generated `installedAddons` carries each addon's `widgets`, `things` and
`arrangedScreens` as records keyed by id (a thing's by its kind), and their
`actions` the same way, as `definePlugin` declares them. A widget's
`component` is a lazy import through the package's `./widgets/*` export.

## What `pikku all` checks

The inspector reads `definePlugin` statically and writes the screens into the
addon's `studio` metadata. It fails the build on:

| Code   | When                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PKU345 | a field is not a literal: a call, an import, a variable that is not a top-level `const` of the same file, or a value outside its set; a `source` that is neither a name nor `<namespace>:<function>`, or a `run` that is none of those nor `go:/<path>`; a destructive action without `confirm`; `lanes` outside 1-6; a `poll` that is not a positive whole number of milliseconds |
| PKU357 | two screens or arranged screens of the addon use the same path                                                                                                                                                                                                                                                                                                                     |
| PKU358 | a title key, an agent's `title` / `description` key, or a key of a widget (`title`, `description`), thing (`label`, `copy`, nested and `$` keys included), arranged screen (`title`, `about`), slot `copy` or action (`label`, `confirm`) is missing from `messages/en.json`                                                                                                       |
| PKU359 | a `nav.badge` names no function of the addon                                                                                                                                                                                                                                                                                                                                       |
| PKU365 | an `agent` is neither a name `/^[a-z][a-z0-9-]*$/` nor `studio:<name>`; or a name has no non-empty `agents/<name>.md`, or that file lacks frontmatter with a `title` and `description`                                                                                                                                                                                             |
| PKU366 | `package.json` has a `files` list that leaves out `agents/` while a screen names a valid agent the addon ships (not `studio:<name>`, and not already PKU365), or leaves out `skills/` while the addon has a `skills/<name>/SKILL.md`                                                                                                                                               |

A key missing from any other locale's catalog is a warning.

`definePlugin` replaces `defineScreens`, which is removed; see
[MIGRATION.md](./MIGRATION.md#definescreens-is-now-pikkustudio).
