---
'@pikku/code-edit': patch
'@pikku/core': patch
'@pikku/playwright': patch
'@pikku/addon-console': patch
'@pikku/cli': patch
---

Pages and routes move into OSS. `@pikku/code-edit/routes` discovers every frontend's pages from its TanStack Router route files (`discoverPages`, `discoverRoutes`, `PagesService`), so `pikku scenario coverage` and the console's `getScenarioCoverage` list unvisited pages without `--routes`, and a route with `$params` counts as visited by any path it serves (`routeMatchesPath`). `pikku pages list` and the `console:getPages` RPC list each page with its app, route file and params; `pikku pages screenshot --base-url <url>` (optionally `--as <persona>`) and the `console:screenshotPages` RPC photograph a running frontend through `@pikku/playwright`'s new `screenshotPages`/`openPageSession`. New scopes: `pikku:console:pages:read|screenshot`.
