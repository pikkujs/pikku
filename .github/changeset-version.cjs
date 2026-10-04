const { execSync } = require('node:child_process')

execSync('npx changeset version')
execSync('bun install')
