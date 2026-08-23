---
'@pikku/code-edit': patch
'@pikku/addon-console': patch
---

The AST-locate-then-text-splice editor that backs `console:updateFunctionConfig`
and `console:updateAgentConfig` is now `@pikku/code-edit` instead of a private
service inside the console addon. Nothing about the behaviour or the scopes
changed — the file moved and the addon imports it.

Editing a Pikku declaration is not a console concern: the CLI needs the same
operation, and the alternative was a second copy that drifts. It stays out of
`@pikku/inspector` deliberately, because the inspector is the read model that
codegen and validation depend on precisely because it does not mutate.

The addon still reaches it through a lazy dynamic import, so self-contained
bundles that never edit code continue not to ship the TypeScript compiler.
