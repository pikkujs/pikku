---
'@pikku/addon-graph': patch
'@pikku/next': patch
---

Bound two peer ranges that were declared as `*`, and add a check that keeps peer ranges across the monorepo mutually satisfiable.

`@pikku/addon-graph` declared `@pikku/core` as `*` and `@pikku/next` declared `react-dom` as `*`. A wildcard promises compatibility with majors that do not exist yet, and because it intersects every other range nothing ever flags it. They are now `^0.12.83` (the core version addon-graph is built against) and `^18 || ^19` (matching `@pikku/react`, `@pikku/mantine` and `@pikku/assistant-ui`).

`scripts/check-peer-dependency-consistency.mjs` runs in CI and in `yarn release`. It does not require every declaration of a peer to be the same string — a range is a constraint, and intersecting constraints is the package manager's job, so `^0.12.44` and `^0.12.83` coexisting is correct and pinning them into lockstep would invent floors nobody verified. It fails only when ranges have no version in common, or when a peer another package bounds is left unbounded.
