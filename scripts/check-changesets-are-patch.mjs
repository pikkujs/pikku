#!/usr/bin/env node
// Every changeset bumps `patch`. A `minor` or `major` slipped through on #1812
// because the rule lived only in the PR checklist.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.changeset')

const offenders = readdirSync(DIR)
  .filter((file) => file.endsWith('.md') && file !== 'README.md')
  .flatMap((file) => {
    const frontmatter =
      readFileSync(join(DIR, file), 'utf8').split('---')[1] ?? ''
    return frontmatter
      .split('\n')
      .filter((line) => /:\s*(minor|major)\s*$/.test(line))
      .map((line) => `.changeset/${file}: ${line.trim()}`)
  })

if (offenders.length) {
  console.error('Changesets must be `patch`:\n' + offenders.join('\n'))
  process.exit(1)
}
