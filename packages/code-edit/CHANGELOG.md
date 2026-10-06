# @pikku/code-edit

## 0.12.3

### Patch Changes

- 83681ee: Ready-made transactional emails (invitation, magic link, password reset, receipt, welcome) in `@pikku/code-edit/emails`, and the console `getEmailCatalog` / `addCatalogEmail` RPCs that list them and add one to a project.
- 4b24966: addon-console reads and edits a project's message catalogs: `getI18n`, `writeI18nLocale`, `addI18nLocale`, `deleteI18nLocale`, `syncI18n` and `setI18nDefaultLocale`, behind the `pikku:console:i18n` scopes.
- 83e9a6a: addon-console extracts a design profile from a site, crawls it, generates a favicon, fetches stock images and lists placeholder brands (`extractDesign`, `crawlSite`, `generateFavicon`, `fetchStockImages`, `getPlaceholderBrands`, `getDesignServer`) through `@pikku/code-edit/brand`, behind the `pikku:console:design` scopes.
- 352ab63: addon-console lists, creates, applies, edits and deletes a project's themes and reads the shadcn components and blocks, with prop edits (`getThemes`, `getThemeSpec`, `getThemePresets`, `createTheme`, `applyTheme`, `updateThemeSpec`, `setActiveTheme`, `deleteTheme`, `getUiComponents`, `getComponentMeta`, `listBlocks`, `getBlock`, `getJsxProps`, `updateJsxProp`), behind the `pikku:console:design` scopes.
- 223eeee: addon-console lists, reads and writes a project's files (`listProjectFiles`, `listProjectFilePaths`, `readProjectFile`, `writeProjectFile`) through `@pikku/code-edit/files`, confined to the workspace, behind the `pikku:console:files` scopes.
- 78803bf: addon-console reads a project's git status, diff and log and commits, pulls and pushes it (`getGitStatus`, `getGitDiff`, `getGitLog`, `commitGitChanges`, `pullGitChanges`, `pushGitChanges`) through `@pikku/code-edit/git`, behind the `pikku:console:git` scopes.
- 1b7b884: addon-console lists a project's frontend pages from their route files and photographs them in a browser (`getPages`, `screenshotPages`), behind the `pikku:console:pages` scopes.
- 6575e3d: addon-console runs verify over a project (codegen, type-checks, correctness checks) and reads the latest result and a file's type errors (`runVerify`, `getVerifyResults`, `getFileDiagnostics`), behind the `pikku:console:verify` scopes.
- Updated dependencies [e930b7b]
  - @pikku/shadcdn@0.0.2

## 0.12.2

### Patch Changes

- 4c7a1b5: Run the monorepo's own scripts through bun instead of yarn. What moves is the
  package manager each package's `prepublishOnly` and build scripts invoke, plus
  the two manifest fixes bun needs to resolve the tree: `uWebSockets.js` is
  declared with an explicit `github:` specifier, and `@pikku/uws-handler` marks
  its `uWebSockets.js` peer optional so a bun install of a consumer that brings
  its own uWS app does not try to fetch it from the registry.

  Three published behaviours change, all of them cases where an isolated
  `node_modules` or bun as the runtime had been papered over by yarn's hoisting:

  - `@pikku/migrator-sql` turns foreign keys on when it opens a sqlite database
    through bun. `node:sqlite` enforces them by default and `bun:sqlite` does not,
    which silently turned every `ON DELETE CASCADE` into a no-op under
    `bunx --bun pikku`.
  - `@pikku/cli` resolves a deploy provider against the project being deployed
    rather than against wherever the CLI itself is installed, which is what its
    own "is not installed" error asks the user to arrange.
  - `@pikku/cli` treats a specifier a runtime hands straight back — bun does this
    for the modules it implements itself — as not resolved from the project, so
    it falls back rather than loading the runtime's own copy.

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
