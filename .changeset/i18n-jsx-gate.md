---
'@pikku/react': patch
'@pikku/code-edit': patch
'@pikku/cli': patch
---

Add `@pikku/react/i18n-jsx`, a JSX import source whose DOM and SVG elements only accept `I18nString` text (children and title, placeholder, alt, label, aria-label and the other aria text attributes). `pikku verify` runs `tsc -p tsconfig.i18n.json` for every directory under `apps/` and `packages/` (to three levels, library packages and `packages/addons/*` included) that has one, three at a time, and reports each error once as an `i18n-gate` finding. With the gate on, `jsx-literal-text` and `jsx-literal-prop` skip lowercase DOM elements and keep reporting fragments, components and helper calls; both lints now cover `packages/addons/*` and any directory with a `package.json` or `tsconfig*.json` to three levels. Removes the `as-i18n-misuse` check.

Add `sep` to `@pikku/react`: `sep(' · ')` brands a literal made only of whitespace, punctuation and symbols as `I18nString`, so neutral separators between translated pieces pass the gate without a message key. Letters, digits, the empty string, `string` variables and templates with substitutions are type errors. `pikku verify` reports the same misuse as `sep-argument` (error), counting only `sep` imported from `@pikku/react`.

Add the `string-literal-copy` check to `pikku verify`: English (two or more words) written as a string or template literal in `.ts`/`.tsx` outside JSX, where copy lives (property values, array elements, returns, defaults, branches, call arguments, initialisers). A warning, an error under strict; honours `i18n.ignore`.

Add `pikku verify --strict` (also `runVerify({ strict: true })`): `i18n-stub` and `string-literal-copy` become errors.
