---
'@pikku/core': major
'@pikku/inspector': major
'@pikku/cli': major
'@pikku/addon-console': major
---

Remove the config-level model alias map. Agents now declare their model
directly in the provider-qualified `<provider>/<model>` form (e.g.
`openai/gpt-5-mini`); the `models`, `agentDefaults`, and `agentOverrides`
keys in `pikku.config.json` are gone, along with the indirection they
introduced. `resolveModelConfig` is now a pass-through that stays the single
merge point for request-time `input.model` overrides.

The inspector's `validateAgentModels` (PKU146) changes meaning: it now fails
when an agent's `model` is not provider-qualified (does not contain `/`),
instead of when a bare alias is missing from the `models` map. `PKU145`
(missing `model`) is unchanged. The PKU146 docs page still describes the old
"unknown alias" meaning and should be updated.

Migration: if your `pikku.config.json` declared `models`, replace each agent's
bare `model: 'foo'` with the provider-qualified value the alias resolved to
(e.g. `model: 'openai/gpt-4-turbo'`) and delete the `models` /
`agentDefaults` / `agentOverrides` blocks. Per-agent `temperature` / `maxSteps`
move onto the agent definition. Note that a request-time `input.model` override
is no longer validated at codegen time — an unqualified value now surfaces as a
runtime `parseModel` error rather than a PKU146.

`@pikku/addon-console`'s `AllMeta` / `PikkuMetaState` no longer expose
`modelAliases` (there is no alias list to surface). Consumers building a model
picker from `meta.modelAliases` should switch to a free-text provider-qualified
model input.
