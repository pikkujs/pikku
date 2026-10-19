#!/usr/bin/env node
// Virtual users have one name. The two words they used to go by must not creep
// back into tracked files, as words or inside identifiers. The words are built
// from pieces so this file does not contain them either.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { STANDALONE_TEMPLATES } from './standalone-templates.mjs'

const a = 'ac' + 'tor'
const p = 'pers' + 'ona'
const cap = (w) => w[0].toUpperCase() + w.slice(1)

const PATTERNS = [a, p].map(
  (w) =>
    new RegExp(
      `(?:(?<![A-Za-z])|(?<=\\\\[bnrt]))${w}s?(?![a-z])|${cap(w)}s?(?![a-z])|(?<![A-Z])${w.toUpperCase()}S?(?![A-Z])`,
      'g'
    )
)

const ALLOWED_FILES = [
  /(^|\/)CHANGELOG\.md$/,
  /(^|\/)bun\.lock$/,
  // Applied migrations are history, and the rename migrations must name the
  // column they rename.
  /^(examples|templates)\/[^/]+\/db\/[^/]+\/\d{4}-[^/]*\.sql$/,
  // The upgrade guide has to name what it renames, or nobody can search for it.
  /^docs\/MIGRATION\.md$/,
]

// Standalone templates are pinned snapshots of a released API, which still
// spells these names (see scripts/standalone-templates.mjs).
const STANDALONE = new RegExp(`^templates/(${STANDALONE_TEMPLATES.join('|')})/`)

// The GitHub Actions context property, which is not ours to rename.
const EXTERNAL = new RegExp(`github\\.${a}`, 'g')

const files = execFileSync('git', ['ls-files', '-z'], {
  maxBuffer: 1 << 28,
})
  .toString()
  .split('\0')
  .filter(Boolean)

const offenders = []
for (const file of files) {
  if (STANDALONE.test(file)) continue
  const names = PATTERNS.some((re) => re.test(file))
  PATTERNS.forEach((re) => (re.lastIndex = 0))
  if (names) offenders.push(`${file} (file name)`)
  if (ALLOWED_FILES.some((re) => re.test(file))) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  if (text.includes('\0')) continue
  text = text.replace(EXTERNAL, '')
  text.split('\n').forEach((line, i) => {
    if (PATTERNS.some((re) => ((re.lastIndex = 0), re.test(line)))) {
      offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`)
    }
  })
}

if (offenders.length) {
  console.error(
    'These files still use a name virtual users no longer go by:\n' +
      offenders.join('\n')
  )
  process.exit(1)
}
