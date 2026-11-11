#!/usr/bin/env node
// `changeset version` never consumes a private package (privatePackages is
// {version: false, tag: false}), so a changeset naming one leaves the Publish
// action opening a release PR with no commits. That stalled Publish on #2323
// and #2351. Fail on the PR instead.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
)
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const workspaceDirs = () => {
  const patterns = readJson(join(ROOT, 'package.json')).workspaces.packages
  const excluded = new Set(
    patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1))
  )
  return patterns
    .filter((p) => !p.startsWith('!'))
    .flatMap((pattern) => {
      if (!pattern.endsWith('/*')) return [pattern]
      const parent = pattern.slice(0, -2)
      const full = join(ROOT, parent)
      return existsSync(full)
        ? readdirSync(full, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => `${parent}/${entry.name}`)
        : []
    })
    .filter((dir) => !excluded.has(dir))
}

const packages = new Map()
for (const dir of workspaceDirs()) {
  const file = join(ROOT, dir, 'package.json')
  if (!existsSync(file)) continue
  const { name, private: isPrivate } = readJson(file)
  if (name) packages.set(name, { private: isPrivate === true })
}

const changesetDir = join(ROOT, '.changeset')
const problems = []
for (const file of readdirSync(changesetDir)) {
  if (!file.endsWith('.md') || file === 'README.md') continue
  const frontmatter =
    readFileSync(join(changesetDir, file), 'utf8').split('---')[1] ?? ''
  const names = frontmatter
    .split('\n')
    .map((line) => line.match(/^\s*['"]?([^'":\s]+)['"]?\s*:\s*\w+\s*$/)?.[1])
    .filter(Boolean)

  const unknown = names.filter((name) => !packages.has(name))
  const privateNames = names.filter((name) => packages.get(name)?.private)
  if (unknown.length) {
    problems.push(
      `.changeset/${file} names ${unknown.join(', ')}, which is not a workspace package. Use the exact "name" from the package's package.json.`
    )
  }
  if (privateNames.length) {
    problems.push(
      `.changeset/${file} names private package(s) ${privateNames.join(', ')}. ` +
        '`changeset version` never consumes a private package, so the release PR would have no commits and Publish would fail. ' +
        'These packages are bundled into @pikku/cli (devDependencies): name `@pikku/cli` (or another published package that carries the change) instead, ' +
        'or delete the file if no release note is needed.'
    )
  }
}

if (problems.length) {
  console.error(
    'Changesets must name only published packages:\n' + problems.join('\n')
  )
  process.exit(1)
}
