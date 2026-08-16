---
'@pikku/cli': patch
'@pikku/core': patch
---

Every definer an app calls is now reachable through its `#pikku` leaf.

`defineCredential` had no generated door, so a credential file had to name
`@pikku/core/credential` directly — the one import in an otherwise
`#pikku`-only wiring that reached past the leaf. It is now generated into the
project's own `.pikku` alongside `defineSecret`, `defineVariable` and
`defineScope`, and `cors` joins the names the `#pikku/http` leaf carries.

A leaf index re-exports every entry file the leaf has rather than only the
first, so the definer and the typed service map are both reachable through
`#pikku/<leaf>` instead of one of them being left behind a relative path into
`.pikku`.

The definition types are also generated before the leaf indexes are written,
not after. They read only `config`, so nothing held them back to the inspected
pass, and running them there left the first codegen after an upgrade with a
`#pikku/credentials` that resolved but was missing `defineCredential`.
