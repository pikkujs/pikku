---
'@pikku/console': patch
---

feat(console): the URL as state, over whichever router is reading it

Keeping something on screen in the URL is the same handful of rules every time
— merge rather than overwrite the params you don't own, clear on null, fall
back to the first row when the value names one that is gone, replace rather
than push so scanning a list does not fill the back stack — and they were being
written out again at each call site, here and in every host with pages of its
own.

`createUrlState(useSearchParams)` holds the rules and takes the router,
returning `useUrlState(key)`, `useUrlSelection(key, options)` and
`useUrlWrite()` for a change that means nothing by halves. The console binds it
to the router shim and exports the bound hooks; a host binds it to its own
router, which is what a page outside the shim's provider needs — Fabric's file
tree and ticket board are its pages, not the console's, and they keep a
selection by the same rules.

`TabbedSurface` is the first to use it. Its tab used to be written by replacing
the whole param set, which quietly dropped every other param on the surface;
the tab and the search box it clears now go in one merged write.
