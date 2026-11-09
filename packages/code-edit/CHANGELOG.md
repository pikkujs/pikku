# @pikku/code-edit

## 0.12.12

### Patch Changes

- 54def56: Add `pikku check`, which answers whether the project builds and type-checks without doing the work again. `pikku watch` and `pikku dev` now type-check the backend and every frontend with the project's own `tsc`, one process per project in parallel, killing any a newer edit supersedes, and publish the result to `.pikku/status.json`. `pikku check` reads that, waits only if the watcher is working on the latest files, never reports a result older than the newest edit, and fails naming the stage if the watcher is stuck (`--timeout`, default 120 seconds). Each frontend's `paraglide` or `i18n:compile` script runs before the type check when its messages change. With no watcher running it does one full `pikku all`, message compile and `tsc`. `--json` is available. `CodedDiagnostic` gains optional `file`, `line` and `column`. When codegen fails, `pikku check` now lists the run's real errors, causes first and without stack frames. `pikku all` recovers on its own from a generated variables or secrets file that imports something the project removed, and a second `pikku all` on the same output directory waits instead of corrupting it. Both also generate a TanStack Router route tree before the type check, so `pikku check` no longer depends on a running Vite.

  An idle watcher now catches up on files written behind a run even when no file event arrives, and `pikku check` wakes it instead of timing out.

  `pikku watch` and `pikku dev` pass `--security` on to codegen and record it, and `pikku check --security` ignores a watcher that skipped the lint. `--config` now selects the frontends too, one `--timeout` bounds a whole check including its fallback full run, and `tsc` failing only in files outside the project is reported rather than passing. A run interrupted before its message or route stage keeps that stage requested, a stage that throws becomes a failed result, and editing `tsr.config.json` moves the watched route paths.

- Updated dependencies [e5a83ec]
- Updated dependencies [daca7c7]
- Updated dependencies [0e75982]
- Updated dependencies [2121973]
  - @pikku/inspector-go@0.12.11

## 0.12.11

### Patch Changes

- 91e7fc8: The Rust inspector (`pikku-inspect-rs`) can now be selected beside the Go one with `PIKKU_INSPECTOR=go|rs`, `--inspector` or the `inspector` key of `pikku.config.json`, with `PIKKU_INSPECTOR_RS_BIN` to point at a binary; `@pikku/inspector-go` ships it for linux-x64, linux-arm64 and darwin-arm64. The default engine is now Rust; set `PIKKU_INSPECTOR=go` for the Go reference.
- c254266: The TypeScript inspector engine is retired: `pikku-inspect` (the Go binary built on typescript-go) is the only inspector. No Pikku package depends on TypeScript 6 any more.

  - `@pikku/cli`: the `--inspector` flag, the `PIKKU_INSPECTOR` variable, the `inspector` key in `pikku.config.json`, `pikku inspector parity` and `pikku experiment native-comparison` are removed. A CLI with no `pikku-inspect` binary for its platform fails at inspection and names `PIKKU_INSPECTOR_GO_BIN`; it no longer falls back.
  - `@pikku/inspector` keeps only its types, `ErrorCode`, serializers and data helpers, and drops its `typescript`, `ts-json-schema-generator`, `zod`, `tsx`, `path-to-regexp` and `openapi-types` dependencies. `inspect`, `analyzeProgram`, `finalizeInspectorState`, `collectSurface`, `readModuleSpecifiers`, `readJsxLiteralText`, `readTsconfigOutDir`, `findWireRemoteAddonSpecs` and the `./lite`, `./finalize` and `./schema-generator` entry points are gone; `InspectorState` has no `typesLookup` or `program`, and `InspectorOptions` has no `oldProgram` or `sourceFile`. `./surface` exports the surface types only.
  - `@pikku/inspector-go` gains the helpers that replace the compiler API (`readSyntaxErrors`, `scanMessageUsage`, `readJsxProps`, `writeJsxProp`, `writeJsxStyle`, `findPikkuCall`, `readImports`, `findWireRemoteAddonSpecs`, the `scan*` source checks), an `InspectorSession` for the type-checking `serve` process, and the Zod helpers the Node schema fallback uses. `output.schema.json` lists `stats.filesReused`.
  - `@pikku/code-edit` and `@pikku/n8n-import` no longer depend on `typescript`. `TypeScriptService.diagnostics()` is now async and the service has a `dispose()` method; the console's `get-file-diagnostics` awaits it.

- Updated dependencies [90e6a50]
- Updated dependencies [91e7fc8]
- Updated dependencies [7aedf4e]
- Updated dependencies [8d4195c]
- Updated dependencies [c254266]
  - @pikku/inspector-go@0.12.9

## 0.12.10

### Patch Changes

- b746b55: Security: stop OpenAPI spec titles, versions and tag names from breaking out of generated comments; restrict agent-config edits to known keys and escape their values; refuse addon server URLs containing line breaks before writing them to `.env`.
- 1cc6cf7: `pikku validate` now fails when a language the app serves (listed in `project.inlang/settings.json` `locales`) is missing translations: absent keys, values still marked `%i18n-missing%`, mismatched placeholders, invalid plurals or stale keys. Locales with a messages file that are not listed are drafts and are skipped. `pikku i18n check` also reports keys missing from a locale as errors and `I18nCheckReport` gains `liveLocales` and per-catalog `missing`.

## 0.12.9

### Patch Changes

- 4af4a6d: `pikku ui theme apply --mode dark` derives every token for a dark design: `--page`/`--ink` are the dark ground and its text, and card, muted, border, input, the `-foreground` tokens and ring are derived for it, written to both `:root` and `.dark` with `color-scheme: dark`. Derived foregrounds are now contrast-checked against their fill on the light path too (no more white on a light primary), and apply prints a contrast report. Default light output is unchanged.

## 0.12.8

### Patch Changes

- 674af8a: Bump every external dependency to its latest minor or patch release.
- 135811c: Move @types/node to 26.
- 19895c4: Every publishable package now ships only what it needs,, as `@pikku/core` does:

  - A `files` allow-list: `dist` (and `@pikku/aws-services`' `scripts`), plus the `README.md`, `LICENSE` and `package.json` npm always includes. Tarballs no longer carry `knowledge/`, `run-tests.sh`, test fixtures, stray `src/` files, the CHANGELOG or `tsconfig.tsbuildinfo`.
  - `build` deletes `dist/` and `tsconfig.tsbuildinfo` first (`bun run clean`), so a local publish can no longer ship modules whose sources were deleted.
  - `./package.json` is exported, so `import pkg from '@pikku/<name>/package.json'` resolves under an `exports` map.

## 0.12.7

### Patch Changes

- fdcc821: Fabric is gone from the open toolchain. The previous names are removed with no aliases.

  The CLI group is `pikku cloud …` and the export is `@pikku/cli/cloud`. The project link is the `cloud` key of `pikku.config.json` (`cloud.projectId`), the CLI keeps its local state in `~/.pikkustudio` (run `pikku cloud login` again), and the project config file is `pikkustudio.config.json`.

  Every environment variable drops the `FABRIC_` prefix for `PIKKUSTUDIO_` with the same suffix: `PIKKUSTUDIO_API_URL`, `PIKKUSTUDIO_PROJECT_ID`, `PIKKUSTUDIO_TOKEN`, `PIKKUSTUDIO_OPERATOR_TOKEN`, `PIKKUSTUDIO_AUTH_PUBLIC_KEY`, `PIKKUSTUDIO_STAGE_ID` and the rest. Rename them wherever you set them.

  Wire ids: the operator sign-in route is `/sign-in/cloud`, the plugin and mode literal is `'cloud'`, the Better Auth plugin is `pikkuCloud`, its session field is `pikkustudioadmin`, and the signature header is `x-cloud-sig`. The cloud API calls are `getCloudLogs`, `getCloudLogsByStageKind`, `cloudCliProjects`, `cloudCliDeployments`, `providedByCloud` and `recordCloudAnalyticsEvents`. Addon packages are `@pikkustudio/*`, scaffolded files live under `scaffold/cloud` and `__cloud_*__`, and the API hosts are the `pikkustudio.app` and `pikkustudio.dev` domains.

  `pikku skills install --fabric` is `--cloud`, the install group is `cloud`, and the skills are `pikku-cloud`, `pikku-cloud-debug`, `pikku-admin-to-cloud` and `pikku-blueprint-to-cloud`.

  The stale analytics forwarder copies are removed from the online-shop example and the starter template.

  The sealed-box salt stays `pikkufabric/sealed-box/v1`: it is a cryptographic constant that already-sealed secrets depend on.

- 9e9bfd3: The console can save a picked element's look: `updateJsxStyle` writes CSS properties onto the element's className as Tailwind arbitrary-property classes.

## 0.12.6

### Patch Changes

- 43e4e8e: `pikku ui theme list|apply` puts the app's themes in the CLI, and the generated theme header names `pikku ui theme apply`.
- 862a4f5: `pikku validate` now warns when an app still carries a starter template's name (the `app__name` wordmark, the tab title, the emails' sender name). The check moved out of `@pikku/code-edit/brand`: `BrandWorkspace.placeholders()`, `placeholderBrands`, `productBrand`, `isPlaceholderName`, the `PLACEHOLDER_*` constants and the `PlaceholderBrand` and `BrandApp` types are gone. Stock-image search (Unsplash) and site crawling (Cloudflare) are removed: `BrandWorkspace.stockImages()` and `BrandWorkspace.crawl()`, the `unsplashAccessKey`, `cloudflare` and `fetch` options, `StockImagesResult`, `CrawlResult`, `CloudflareCredentials`, `StockImageOrientation`, `searchUnsplash`, `crawlSite`, `CloudflareCrawler` and `extractImages`. The console addon no longer exposes the `getPlaceholderBrands`, `fetchStockImages` and `crawlSite` functions, and stops reading `UNSPLASH_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` for brand use.

## 0.12.5

### Patch Changes

- c3e8f50: The i18n service handles plural messages and checks message catalogs (a key held by two catalogs, mismatched placeholders, stale keys, keys no source file uses). `@pikku/code-edit/verify` reports broken catalogs.
- d036518: Add `@pikku/react/i18n-jsx`, a JSX import source whose DOM and SVG elements only accept `I18nString` text (children and title, placeholder, alt, label, aria-label and the other aria text attributes). `pikku verify` runs `tsc -p tsconfig.i18n.json` for every directory under `apps/` and `packages/` (to three levels, library packages and `packages/addons/*` included) that has one, three at a time, and reports each error once as an `i18n-gate` finding. With the gate on, `jsx-literal-text` and `jsx-literal-prop` skip lowercase DOM elements and keep reporting fragments, components and helper calls; both lints now cover `packages/addons/*` and any directory with a `package.json` or `tsconfig*.json` to three levels. Removes the `as-i18n-misuse` check.

  Add `sep` to `@pikku/react`: `sep(' · ')` brands a literal made only of whitespace, punctuation and symbols as `I18nString`, so neutral separators between translated pieces pass the gate without a message key. Letters, digits, the empty string, `string` variables and templates with substitutions are type errors. `pikku verify` reports the same misuse as `sep-argument` (error), counting only `sep` imported from `@pikku/react`.

  Add the `string-literal-copy` check to `pikku verify`: English (two or more words) written as a string or template literal in `.ts`/`.tsx` outside JSX, where copy lives (property values, array elements, returns, defaults, branches, call arguments, initialisers). A warning, an error under strict; honours `i18n.ignore`.

  Add `pikku verify --strict` (also `runVerify({ strict: true })`): `i18n-stub` and `string-literal-copy` become errors.

## 0.12.4

### Patch Changes

- dbc9c5c: `@pikku/shadcdn` is gone, and so is the hand-rolled shadcn installer. Components are added with the shadcn CLI (`npx shadcn add`); `ShadcnCatalog` only reads what the app already has (`componentNames`, `componentMeta`, with a cva parser that now lives in code-edit). The console's `listBlocks` and `getBlock` functions and the block library behind them are removed.

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
