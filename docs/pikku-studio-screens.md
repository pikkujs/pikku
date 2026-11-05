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

| Field                | Meaning                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `path`               | The route path.                                                                                                                                                                                                                      |
| `title`              | A message key in the addon's catalog. It is also the nav label.                                                                                                                                                                      |
| `component` or `app` | A lazy `() => import('...')` the host renders, or `app`, a static program it serves in a sandboxed iframe.                                                                                                                           |
| `scope`              | `'studio'` gives `/<path>`, `'team'` gives `/<team>/<path>`, `'project'` gives `/<team>/<project>[/<target>]/<path>`.                                                                                                                |
| `nav?`               | `{ area: 'rail' \| 'team' \| 'project' \| 'account', icon, order, badge? }`. `badge` names a function of the addon that returns a count. Without `nav` the screen is routed but not listed.                                          |
| `replaces?`          | `true` takes over the core screen at the same path. Only first-party addons may use it.                                                                                                                                              |
| `needsApp?`          | Project screens only. Defaults to `false`.                                                                                                                                                                                           |
| `layout?`            | `'bare'` renders the screen without the shell.                                                                                                                                                                                       |
| `agent?`             | The agent that answers in Studio's chat panel, in a second tab beside the general chat, while this screen is open. Either a name (`/^[a-z][a-z0-9-]*$/`) for an agent the addon ships, resolving to `agents/<name>.md` in its package, or `studio:<name>` for an agent Studio ships. See [Agents](#agents). |
| `defaultChat?`       | Whether Studio's general Chat tab shows on this screen, beside the `agent` tab. Defaults to `true`; `false` hides it, and with no `agent` the screen has no chat at all. A boolean literal. See [Agents](#agents). |
| `scopes?`            | Hides the screen and its nav from viewers without access. This is not access control: the addon's functions must enforce the same scopes.                                                                                            |

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
(`agents/**/*.md`); the same for `skills`. With no `files` field npm publishes
everything, and there is nothing to check. The `agents/` check only applies to
an agent that is otherwise valid: one that already fails with PKU365 gets that
error alone.

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

## What `pikku all` checks

The inspector reads `definePlugin` statically and writes the screens into the
addon's `studio` metadata. It fails the build on:

| Code   | When                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PKU345 | a field is not a literal: a variable, a call, a spread or a value outside its set                                                             |
| PKU357 | two screens of the addon use the same path                                                                                                    |
| PKU358 | a title key, or an agent's `title` / `description` key, is missing from `messages/en.json`                                                    |
| PKU359 | a `nav.badge` names no function of the addon                                                                                                  |
| PKU365 | an `agent` is neither a name `/^[a-z][a-z0-9-]*$/` nor `studio:<name>`; or a name has no non-empty `agents/<name>.md`, or that file lacks frontmatter with a `title` and `description` |
| PKU366 | `package.json` has a `files` list that leaves out `agents/` while a screen names a valid agent the addon ships (not `studio:<name>`, and not already PKU365), or leaves out `skills/` while the addon has a `skills/<name>/SKILL.md` |

A key missing from any other locale's catalog is a warning.

`definePlugin` replaces `defineScreens`, which is removed; see
[MIGRATION.md](./MIGRATION.md#definescreens-is-now-pikkustudio).
