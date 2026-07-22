---
'@pikku/addon-console': minor
'@pikku/console': minor
---

Page the addon and API catalogues instead of loading them whole.

The APIs tab fetched a fixed first 100 entries out of ~2,500 and never fetched
more, so most of the catalogue was unreachable and its search box only ever
searched those 100. Both galleries now use infinite queries, pulling the next
page as the grid scrolls.

Because a paged list can only be filtered honestly by the server, search,
category, sort and the All/Official/Installed filter all moved to the registry,
and the category rail's counts now come from a catalogue-wide facet call rather
than being derived from the loaded rows.

**Breaking (`@pikku/addon-console`):** `getAddonMeta` took no input and returned
`AddonMeta[]`. It now takes `{ cursor?, limit?, search?, category?, sort?,
official?, names? }` and returns `{ packages, total, nextCursor }`. Callers that
want the whole catalogue should walk `nextCursor` — the `useAddonMeta` hook in
`@pikku/console` does this and still returns a flat array.

Adds `getAddonCategories` and `getOpenapiCategories`, and `category` to
`getOpenapis`.
