const { execSync } = require('node:child_process')

execSync('npx changeset version')
execSync('node scripts/sync-starter-template-pins.mjs', { stdio: 'inherit' })
// The first install, run over the checkout's existing node_modules, rewrites
// only some of the workspace ranges the version bump moved; a second one
// finishes the job. Publish installs from a clean checkout and refuses a
// lockfile that install would still change.
execSync('bun install')
execSync('bun install')
