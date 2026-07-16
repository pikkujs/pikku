---
'@pikku/console': patch
---

Extract a presentation-only `UsersTable` component from `AdminUsersPage` and export it. It takes `users`, translated `labels`, and an optional `renderActions` slot — no data fetching, router, or auth client — so external hosts (e.g. Fabric's server-brokered stage Users tab) can render the same table fed from their own source instead of duplicating the UI.
