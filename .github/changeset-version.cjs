const { execSync } = require('node:child_process')

execSync('npx changeset version')
execSync('node scripts/sync-starter-template-pins.mjs', { stdio: 'inherit' })
execSync('bun install')
