#!/usr/bin/env node
// Installs @pikku/cli the way a user does — `bun install` from a registry —
// and checks that the native engine's binary for this platform came with it.
//
// The branch's @pikku/cli, @pikku/inspector, @pikku/inspector-go and every
// workspace package they depend on are packed with `npm pack` (what
// `changeset publish` ships) at a prerelease version, served by a local
// registry that proxies everything else to npm, and installed into an empty
// project with each of bun's linkers. For each install it checks that:
//   - @pikku/inspector-go arrived with every target's binary under prebuilt/,
//     so one lockfile installs the same package on every platform;
//   - @pikku/inspector-go, resolved from the installed CLI, picks this
//     platform's binary and the binary runs.
//
// Needs the packages built (dist) and every binary in prebuilt/
// (`node scripts/build-go.mjs --all`).
//
//   node packages/inspector-go/install-smoke/run.mjs
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PLATFORMS, executableName, targetName } from '../scripts/platforms.mjs'

const pkgDir = fileURLToPath(new URL('..', import.meta.url))
const repo = join(pkgDir, '..', '..')
const work = mkdtempSync(join(tmpdir(), 'pikku-install-smoke-'))
const tarballs = join(work, 'tarballs')
mkdirSync(tarballs)

const host = `${process.platform}-${process.arch}`
// Every workspace package the CLI reaches through its dependencies is packed
// too: the branch's CLI can import a subpath that a published dependency does
// not export yet.
const WORKSPACE_GROUPS = [
  'packages',
  'packages/addon',
  'packages/frontend',
  'packages/services',
  'packages/gateways',
  'packages/runtimes',
  'packages/deploy',
]
const workspaceDirs = new Map()
for (const group of WORKSPACE_GROUPS) {
  for (const entry of readdirSync(join(repo, group), { withFileTypes: true })) {
    const pj = join(repo, group, entry.name, 'package.json')
    if (!entry.isDirectory() || !existsSync(pj)) continue
    const m = JSON.parse(readFileSync(pj, 'utf8'))
    if (!m.private) workspaceDirs.set(m.name, `${group}/${entry.name}`)
  }
}
const reached = ['packages/cli', 'packages/inspector', 'packages/inspector-go']
for (let i = 0; i < reached.length; i++) {
  const m = JSON.parse(
    readFileSync(join(repo, reached[i], 'package.json'), 'utf8')
  )
  for (const dep of Object.keys(m.dependencies ?? {})) {
    const dir = workspaceDirs.get(dep)
    if (dir && !reached.includes(dir)) reached.push(dir)
  }
}
const dirs = reached

const fail = (message) => {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

// A prerelease above whatever is on npm, so the install takes these.
const manifests = dirs.map((d) =>
  JSON.parse(readFileSync(join(repo, d, 'package.json'), 'utf8'))
)
const versions = Object.fromEntries(
  manifests.map((m) => [m.name, `${m.version}-smoke.${Date.now()}`])
)

const local = new Map()
for (const d of dirs) {
  const tmp = mkdtempSync(join(work, 'pack-'))
  execFileSync(
    'npm',
    ['pack', '--pack-destination', tmp, '--ignore-scripts', '--silent'],
    { cwd: join(repo, d), stdio: ['ignore', 'ignore', 'inherit'] }
  )
  const [tgz] = readdirSync(tmp).filter((f) => f.endsWith('.tgz'))
  execFileSync('tar', ['-xzf', tgz], { cwd: tmp })
  const pj = join(tmp, 'package', 'package.json')
  const m = JSON.parse(readFileSync(pj, 'utf8'))
  m.version = versions[m.name]
  for (const field of [
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const dep of Object.keys(m[field] ?? {})) {
      if (versions[dep]) m[field][dep] = versions[dep]
    }
  }
  writeFileSync(pj, JSON.stringify(m, null, 2))
  const file = `${m.name.slice(1).replace('/', '-')}-${m.version}.tgz`
  execFileSync('tar', ['-czf', join(tarballs, file), 'package'], {
    cwd: tmp,
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  })
  const data = readFileSync(join(tarballs, file))
  local.set(m.name, { manifest: m, file, data })
}

const serve = async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/-/')) {
    res.writeHead(200, { 'content-type': 'application/octet-stream' })
    res.end(readFileSync(join(tarballs, url.slice(3))))
    return
  }
  if (url.includes('/-/')) {
    res.writeHead(302, { location: `https://registry.npmjs.org${url}` })
    res.end()
    return
  }
  const name = url.slice(1)
  let upstream
  for (let attempt = 1; !upstream; attempt++) {
    try {
      upstream = await fetch(
        `https://registry.npmjs.org/${name.replace('/', '%2f')}`,
        { headers: { accept: 'application/json' } }
      )
    } catch (error) {
      if (attempt === 3) {
        res.writeHead(502)
        res.end(String(error))
        return
      }
    }
  }
  let body = upstream.ok ? await upstream.json() : null
  const mine = local.get(name)
  if (mine) {
    body ??= { name, versions: {}, 'dist-tags': {}, time: {} }
    body.versions[mine.manifest.version] = {
      ...mine.manifest,
      _id: `${name}@${mine.manifest.version}`,
      dist: {
        tarball: `${registry}/-/${mine.file}`,
        shasum: createHash('sha1').update(mine.data).digest('hex'),
        integrity:
          'sha512-' + createHash('sha512').update(mine.data).digest('base64'),
      },
    }
    body['dist-tags'].latest = mine.manifest.version
  }
  if (!body) {
    res.writeHead(upstream.status)
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
const server = createServer((req, res) => void serve(req, res))
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const registry = `http://127.0.0.1:${server.address().port}`

const exec = (command, args, options) =>
  new Promise((resolve) => {
    const child = spawn(command, args, options)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d))
    child.stderr.on('data', (d) => (stderr += d))
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })

const smoke = async (linker) => {
  const project = join(work, `project-${linker}`)
  mkdirSync(project)
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({
      name: 'install-smoke',
      private: true,
      type: 'module',
      dependencies: { '@pikku/cli': versions['@pikku/cli'] },
    })
  )
  // Not spawnSync: the registry is served from this process's event loop.
  const install = await exec('bun', ['install', `--linker=${linker}`], {
    cwd: project,
    env: {
      ...process.env,
      BUN_CONFIG_REGISTRY: registry,
      BUN_INSTALL_CACHE_DIR: join(work, 'bun-cache'),
    },
  })
  if (install.status !== 0) {
    fail(`[${linker}] bun install failed:\n${install.stdout}${install.stderr}`)
    return
  }

  const cli = realpathSync(join(project, 'node_modules', '@pikku', 'cli'))
  const goEntry = createRequire(join(cli, 'package.json')).resolve(
    '@pikku/inspector-go'
  )
  const goDir = realpathSync(join(dirname(goEntry), '..'))
  const shipped = PLATFORMS.filter((p) =>
    existsSync(
      join(goDir, 'prebuilt', targetName(p), executableName(p.platform))
    )
  ).map(targetName)
  if (shipped.length !== PLATFORMS.length) {
    fail(
      `[${linker}] @pikku/inspector-go has prebuilt binaries for only ${shipped.join(', ') || 'none'}`
    )
  }

  const { findInspectorBinary } = await import(pathToFileURL(goEntry).href)
  const binary = findInspectorBinary({})
  const want = join(goDir, 'prebuilt', host, executableName(process.platform))
  if (realpathSync(binary) !== want) {
    fail(`[${linker}] the CLI's inspector-go found ${binary}, want ${want}`)
  }
  const run = spawnSync(binary, ['helper', 'readModuleSpecifiers'], {
    input: JSON.stringify({
      fileName: 'a.ts',
      content: 'export * from "./b.js"',
    }),
    encoding: 'utf8',
  })
  if (run.stdout.trim() !== '{"result":["./b.js"]}') {
    fail(`[${linker}] ${binary} answered: ${run.stdout}${run.stderr}`)
  }

  const help = spawnSync(
    join(project, 'node_modules', '.bin', 'pikku'),
    ['--help'],
    { cwd: project, encoding: 'utf8' }
  )
  if (help.status !== 0) {
    fail(`[${linker}] pikku --help exited ${help.status}:\n${help.stderr}`)
  }
  if (!process.exitCode) {
    console.log(`✓ [${linker}] ${host}: ${binary}`)
  }
}

try {
  if (!existsSync(join(pkgDir, 'prebuilt', host))) {
    throw new Error(`no prebuilt binary for ${host}`)
  }
  for (const linker of ['hoisted', 'isolated']) await smoke(linker)
} finally {
  server.close()
  rmSync(work, { recursive: true, force: true })
}
