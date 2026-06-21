---
'@pikku/addon-console': patch
'@pikku/addon-graph': patch
---

Stop addon packages from rebuilding via the workspace pikku CLI at publish time.

`npx changeset publish` runs up to 10 `npm publish` processes concurrently, and
`@pikku/cli`'s publish build (`build.sh`) starts with `rm -rf -- .pikku dist`.
An addon whose `prepublishOnly` ran the workspace CLI (`pikku all`, or a
`build.sh` invoking `cli/dist/bin/pikku.js`) could read `packages/cli/dist`
mid-wipe and fail with `Cannot find module '.../cli/dist/src/services.js'`,
breaking the release. `yarn release` already builds every package before
publishing, so the `prepublishOnly` rebuild was redundant; it has been removed
from both addons and a `check:no-publish-rebuild` guard now fails CI if any
published package reintroduces a publish-time CLI rebuild.
