# Addon screens in Pikku Studio: `definePlugin`

An addon can ship screens that Pikku Studio mounts. It declares them with
`definePlugin` in its own source, usually `src/screens.ts`, and the app opts in
by wiring the addon with `ui: true`. `pikku new addon-ui <name>` scaffolds an
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
| `agent?`             | The agent that answers in Studio's chat panel, in a second tab beside the general chat, while this screen is open. A name (`/^[a-z][a-z0-9-]*$/`) that resolves to `agents/<name>.md` in the addon's package. See [Agents](#agents). |
| `scopes?`            | Hides the screen and its nav from viewers without access. This is not access control: the addon's functions must enforce the same scopes.                                                                                            |

The manifest `title` is a message key too: the addon's name in Studio.

## Messages

Titles are keys in `messages/{locale}.json` at the root of the addon's package,
next to its `package.json`. There is no field naming the catalog.

```json
{
  "invoices__title": "Invoices",
  "invoices_list__title": "All invoices",
  "invoices_settings__title": "Invoice settings"
}
```

## Agents

A screen's `agent` names a file, `agents/<name>.md`, at the root of the addon's
package. The file is the agent's instructions and names the skills it follows;
skills are plain folders, `skills/<name>/SKILL.md`, found by convention. It
starts with frontmatter whose `title` and `description` are message keys in
`messages/en.json`, like a screen title: `title` labels the chat tab and
`description` is shown with it.

```md
---
title: invoices_agent__title
description: invoices_agent__description
---

You are the invoices agent. Follow the invoice-triage skill.
```

`pikku all` records `agent`, `agentTitle` and `agentDescription` on the screen,
so Studio reads them without opening the markdown. A screen without `agent`
leaves the chat as it is.

## What `pikku all` checks

The inspector reads `definePlugin` statically and writes the screens into the
addon's `studio` metadata. It fails the build on:

| Code   | When                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| PKU345 | a field is not a literal: a variable, a call, a spread or a value outside its set                                                             |
| PKU357 | two screens of the addon use the same path                                                                                                    |
| PKU358 | a title key, or an agent's `title` / `description` key, is missing from `messages/en.json`                                                    |
| PKU359 | a `nav.badge` names no function of the addon                                                                                                  |
| PKU365 | an `agent` is not `/^[a-z][a-z0-9-]*$/`, has no non-empty `agents/<name>.md`, or that file lacks frontmatter with a `title` and `description` |

A key missing from any other locale's catalog is a warning.

`definePlugin` replaces `defineScreens`, which is removed; see
[MIGRATION.md](./MIGRATION.md#definescreens-is-now-pikkustudio).
