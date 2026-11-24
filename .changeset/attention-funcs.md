---
'@pikku/core': patch
'@pikku/cli': patch
'@pikku/addon-admin': patch
'@pikku/skills': patch
---

`pikkuAttentionFunc({ widget, every, func })` declares in a `*.attention.ts` file whether a widget of an addon's arranged screens needs a look. It runs as the workflow `attention.<widget>` (a retried get step, then a store step), stores every run per project and widget with `updatedAt`, and refreshes on its `every` schedule and on demand. `@pikku/core/attention-func` exports it with `getAttention` and `refreshAttention`; `@pikku/addon-admin` exposes both as `getAttention` and `refreshAttention` functions. `pikku all` refuses a `widget` that is not a slot of the plugin's own arranged screens, naming the plugin.
