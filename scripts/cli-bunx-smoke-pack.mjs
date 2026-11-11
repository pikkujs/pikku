// Packs @pikku/cli and every workspace @pikku package it reaches, with each
// tarball's @pikku dependencies and required peers pointed at the others.
//
// Packing only the CLI and core is not enough: a workspace package and its
// published namesake share a version until the release, so a CLI importing an
// export that is new in @pikku/inspector, or a package importing a core subpath
// that was just renamed, resolves the published copy and fails there instead.
// Peers count too — bun satisfies a peer on @pikku/core from the registry
// rather than from a file: tarball it already installed.
//
// Usage: bun scripts/cli-bunx-smoke-pack.mjs <repo root> <work dir>
// Writes <work>/cli/pikku-cli-<v>.tgz (the rewritten CLI) and
// <work>/pikku-cli-<v>.tgz (the CLI as published), and prints the CLI's
// declared @pikku/core range.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [root, work] = process.argv.slice(2)
if (!root || !work)
  throw new Error('usage: cli-bunx-smoke-pack.mjs <root> <work>')

const workspace = new Map()
for (const file of new Bun.Glob('packages/**/package.json').scanSync({
  cwd: root,
})) {
  if (file.includes('node_modules')) continue
  const dir = join(root, file.slice(0, -'/package.json'.length))
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  if (pkg.name && !pkg.private) workspace.set(pkg.name, { dir, pkg })
}

const linked = (pkg) => {
  const optional = pkg.peerDependenciesMeta ?? {}
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}).filter(
      (n) => !optional[n]?.optional
    ),
  ].filter((n) => workspace.has(n))
}

const closure = new Set()
const visit = (name) => {
  if (closure.has(name)) return
  closure.add(name)
  linked(workspace.get(name).pkg).forEach(visit)
}
linked(workspace.get('@pikku/cli').pkg).forEach(visit)

const tarballName = (pkg) =>
  `${pkg.name.replace(/^@/, '').replace('/', '-')}-${pkg.version}.tgz`
const pack = (dir, dest) => {
  mkdirSync(dest, { recursive: true })
  execFileSync(
    'npm',
    ['pack', '--ignore-scripts', '--pack-destination', dest],
    {
      cwd: dir,
      stdio: 'ignore',
    }
  )
}

const final = join(work, 'deps')
const staged = join(work, 'staged')
const tarballsIn = (dir, skip = []) =>
  Object.fromEntries(
    [...closure]
      .filter((n) => !skip.includes(n))
      .map((n) => [n, join(dir, tarballName(workspace.get(n).pkg))])
  )
const tarballs = tarballsIn(final)

// The "as published" variant must still install from the registry: a release
// PR bumps packages that are not published yet, so their ranges cannot resolve
// there. It links every closure package except @pikku/core, which the stale
// cache check needs to take from the registry.
const registryCore = join(work, 'deps-registry-core')
const tarballsNoCore = tarballsIn(registryCore, ['@pikku/core'])

const pointAtTarballs = (pkg, links = tarballs) => {
  for (const field of ['dependencies', 'peerDependencies'])
    for (const name of Object.keys(pkg[field] ?? {}))
      if (links[name]) pkg[field][name] = 'file:' + links[name]
  return pkg
}

const repack = (name, from, dest, links = tarballs) => {
  const tgz = join(from, tarballName(workspace.get(name).pkg))
  const out = join(work, 'unpacked', tarballName(workspace.get(name).pkg))
  mkdirSync(out, { recursive: true })
  execFileSync('tar', ['xzf', tgz, '-C', out])
  const manifest = join(out, 'package', 'package.json')
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  writeFileSync(
    manifest,
    JSON.stringify(pointAtTarballs(pkg, links), null, 2)
  )
  pack(join(out, 'package'), dest)
  return pkg
}

for (const name of closure) {
  pack(workspace.get(name).dir, staged)
  repack(name, staged, final)
  if (name !== '@pikku/core')
    repack(name, staged, registryCore, tarballsNoCore)
}

pack(workspace.get('@pikku/cli').dir, staged)
const cli = workspace.get('@pikku/cli').pkg
const range =
  cli.dependencies?.['@pikku/core'] ?? cli.peerDependencies?.['@pikku/core']
if (!tarballs['@pikku/core'])
  throw new Error('@pikku/core is not in the CLI closure')
repack('@pikku/cli', staged, join(work, 'cli'))
repack('@pikku/cli', staged, work, tarballsNoCore)
console.log(range)
