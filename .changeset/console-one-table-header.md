---
'@pikku/console': patch
---

Give every table in the console the same column header. The list grid painted its sticky head with `--mantine-color-body`, which resolves to the page background rather than the panel the table sits in, so the header read as a black band floating over the card — and the labels under it were 14px full-contrast bold, outweighing the rows they name.

The head is now a `.tableHead` class in `console.module.css`: a 34px strip of 11px uppercase `--app-text-dim`, the same field-label idiom the console already uses everywhere else. `.tableHeadSticky` adds the sticky positioning and paints `--app-surface` for the one grid that has to occlude rows scrolling under it. Detail panels that dressed their own heads inline (`c="dimmed" fw={500} fz="xs"`, sometimes monospace) drop those props and use the class, so no `Table.Th` in the package carries styling.

Column casing moves to CSS with it: the 71 header strings go from `'ENV VARS'` to `'Env vars'`, which stops screen readers spelling out shouted words and leaves translators real strings. `TableListPage`'s `align` option, declared on the column type but never applied, now reaches both the header cell and the body cell.
