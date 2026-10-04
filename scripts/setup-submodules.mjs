import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('git', ['submodule', 'update', '--init', '--recursive'], root)

const sources = new Map()
const collect = (dir, depth) => {
  if (depth > 3 || !existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    const manifest = join(path, 'package.json')
    if (existsSync(manifest)) {
      const { name } = JSON.parse(readFileSync(manifest, 'utf8'))
      if (name?.startsWith('@pikku/')) sources.set(name, path)
    }
    collect(path, depth + 1)
  }
}
collect(join(root, 'packages'), 0)

const modules = readFileSync(join(root, '.gitmodules'), 'utf8')
const submodules = [...modules.matchAll(/^\s*path\s*=\s*(.+)$/gm)].map((m) => join(root, m[1].trim()))

const manifestsUnder = (dir, depth = 0, found = []) => {
  if (depth > 3) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (existsSync(join(path, 'package.json'))) found.push(path)
    manifestsUnder(path, depth + 1, found)
  }
  return found
}

const link = (dir) => {
  const scope = join(dir, 'node_modules', '@pikku')
  if (!existsSync(scope)) return 0
  let linked = 0
  for (const name of readdirSync(scope)) {
    const source = sources.get(`@pikku/${name}`)
    if (!source) continue
    const target = join(scope, name)
    if (existsSync(target) || lstatSync(target, { throwIfNoEntry: false })) {
      rmSync(target, { recursive: true, force: true })
    }
    mkdirSync(scope, { recursive: true })
    symlinkSync(source, target)
    linked++
  }
  return linked
}

for (const submodule of submodules) {
  if (!existsSync(join(submodule, 'package.json'))) continue
  run('bun', ['install'], submodule)
  const linked = [submodule, ...manifestsUnder(submodule)].reduce((n, dir) => n + link(dir), 0)
  console.log(`${submodule.replace(`${root}/`, '')}: ${linked} @pikku package(s) linked to packages/`)
}
