---
'@pikku/cli': patch
'@pikku/core': patch
---

Collections for addon tables. An addon declares its collections in its own `db/collections.ts`, with named actions and a tags field, and exports their handlers as `collectionHandlers` from `<package>/collections`. `pikku all` checks the declaration, refuses a package without that export and publishes it. An app opts in with `{ from: '<name the addon is wired under>' }` and can only switch operations and actions off and add checks. It gets the same scoped, validated and audited functions, one scope per action, which call the handlers: no query on an addon's tables is generated. A missing handler fails the app's build. `@pikku/core/collections` exports the `CollectionShape` type, which an addon built with `declaration: true` needs to name.
