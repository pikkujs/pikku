# @pikku/code-edit

## 0.12.1

### Patch Changes

- d1c6956: The AST-locate-then-text-splice editor that backs `console:updateFunctionConfig`
  and `console:updateAgentConfig` is now `@pikku/code-edit` instead of a private
  service inside the console addon. Nothing about the behaviour or the scopes
  changed — the file moved and the addon imports it.

  Editing a Pikku declaration is not a console concern: the CLI needs the same
  operation, and the alternative was a second copy that drifts. It stays out of
  `@pikku/inspector` deliberately, because the inspector is the read model that
  codegen and validation depend on precisely because it does not mutate.

  The addon still reaches it through a lazy dynamic import, so self-contained
  bundles that never edit code continue not to ship the TypeScript compiler.

- 56d6fde: `pikku meta apply` edits your own source from a batch of operations, so an agent
  that wants to set a permission, retag a function or rewrite a body no longer has
  to regenerate the whole project once per property.

  Three things had to exist for that to be safe:

  `permissions` joins the function change-set. Unlike every field before it, its
  value is an identifier rather than a literal, so the change-set carries the
  module each symbol comes from and the missing import is spliced in — widening an
  existing import from that module rather than adding a second one. The same
  mechanism fixes `tools`, which has always emitted `ref(...)` without ever
  importing `ref`.

  `applyOperations` is all-or-nothing. Every operation resolves against in-memory
  content first and nothing is written unless all of them succeed, so a batch
  cannot leave a project half-edited and uncompilable with no record of how far it
  got. Operations on one file compose in order, each re-parsing the last result,
  because a splice invalidates every offset after it. A failure names the
  operation that caused it.

  Newly added properties no longer leave a blank line behind them, and a missing
  trailing comma is now added after the last property instead of on its own line.
