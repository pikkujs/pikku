#!/usr/bin/env node
// Every changeset bumps `patch`. A `minor` or `major` slipped through on #1812
// because the rule lived only in the PR checklist.
//
// The one exception is a planned minor release, declared by a marker file
// `.changeset/release-<version>.json`:
//
//   { "version": "0.13.0", "minor": ["@pikku/core", "@pikku/cli", …] }
//
// While a marker exists, a changeset may bump a listed package `minor`, and
// only when that minor lands exactly on the marker's version (0.12.x → 0.13.0).
// `major` is never allowed. `.github/changeset-version.cjs` deletes the marker
// once `changeset version` has consumed the changesets, so the exception ends
// with the release that needed it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(ROOT, '.changeset')
const MARKER = /^release-(\d+\.\d+\.\d+)\.json$/

/** Every package.json under packages/, by name, for the current versions. */
function workspaceVersions(dir, out = new Map()) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.deploy')
      continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) workspaceVersions(full, out)
    else if (entry === 'package.json') {
      const { name, version } = JSON.parse(readFileSync(full, 'utf8'))
      if (name && version) out.set(name, version)
    }
  }
  return out
}

const nextMinor = (version) => {
  const [major, minor] = version.split('.').map(Number)
  return `${major}.${minor + 1}.0`
}

const files = readdirSync(DIR)
const problems = []

const markers = files.filter((file) => MARKER.test(file))
if (markers.length > 1) {
  problems.push(`Only one release marker may exist: ${markers.join(', ')}`)
}

/** package name -> the version its minor bump must land on */
const allowedMinor = new Map()
if (markers.length === 1) {
  const [file] = markers
  const marker = JSON.parse(readFileSync(join(DIR, file), 'utf8'))
  const target = file.match(MARKER)[1]
  const versions = workspaceVersions(join(ROOT, 'packages'))
  if (marker.version !== target) {
    problems.push(
      `.changeset/${file}: "version" is ${marker.version}, the file name says ${target}`
    )
  }
  for (const name of marker.minor ?? []) {
    const current = versions.get(name)
    if (!current) {
      problems.push(`.changeset/${file}: ${name} is not a workspace package`)
    } else if (nextMinor(current) !== target) {
      problems.push(
        `.changeset/${file}: ${name} is at ${current}, so a minor bump would not land on ${target}`
      )
    } else {
      allowedMinor.set(name, target)
    }
  }
}

for (const file of files) {
  if (!file.endsWith('.md') || file === 'README.md') continue
  const frontmatter =
    readFileSync(join(DIR, file), 'utf8').split('---')[1] ?? ''
  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^\s*['"]?([^'":]+)['"]?\s*:\s*(minor|major)\s*$/)
    if (!match) continue
    const [, name, type] = match
    if (type === 'minor' && allowedMinor.has(name)) continue
    problems.push(`.changeset/${file}: ${line.trim()}`)
  }
}

if (problems.length) {
  const exception = allowedMinor.size
    ? ` (or \`minor\` for a package listed in .changeset/${markers[0]})`
    : ''
  console.error(
    `Changesets must be \`patch\`${exception}:\n` + problems.join('\n')
  )
  process.exit(1)
}
if (allowedMinor.size) {
  console.log(
    `✓ changesets are patch, or minor to ${[...allowedMinor.values()][0]} for the ${allowedMinor.size} packages in .changeset/${markers[0]}`
  )
}
