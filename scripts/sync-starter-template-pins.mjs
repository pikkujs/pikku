import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? process.cwd())
const template = join(root, 'templates', 'starter-template')
const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'overrides']

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

const expand = (pattern) => {
  if (pattern.startsWith('!')) return []
  const parts = pattern.split('/')
  let dirs = [root]
  for (const part of parts) {
    dirs = dirs.flatMap((dir) => {
      if (part !== '*') return existsSync(join(dir, part)) ? [join(dir, part)] : []
      return existsSync(dir)
        ? readdirSync(dir).map((name) => join(dir, name)).filter((p) => statSync(p).isDirectory())
        : []
    })
  }
  return dirs
}

const versions = new Map()
const rootPackage = readJson(join(root, 'package.json'))
const patterns = Array.isArray(rootPackage.workspaces)
  ? rootPackage.workspaces
  : (rootPackage.workspaces?.packages ?? [])
for (const dir of patterns.flatMap(expand)) {
  if (dir.startsWith(template)) continue
  const manifest = join(dir, 'package.json')
  if (!existsSync(manifest)) continue
  const { name, version } = readJson(manifest)
  if (name && version) versions.set(name, version)
}

const manifests = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full)
    else if (name === 'package.json') manifests.push(full)
  }
}
walk(template)

const retarget = (spec, version) => {
  if (typeof spec !== 'string') return spec
  if (/^\d/.test(spec)) return version
  if (spec.startsWith('^')) return `^${version}`
  if (spec.startsWith('~')) return `~${version}`
  return spec
}

let changed = 0
for (const file of manifests) {
  const manifest = readJson(file)
  let touched = false
  for (const section of sections) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      const version = versions.get(name)
      if (!version) continue
      const next = retarget(spec, version)
      if (next !== spec) {
        manifest[section][name] = next
        touched = true
        changed++
      }
    }
  }
  if (touched) writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`)
}

console.log(`starter-template: ${changed} pin(s) moved to the versions in this repo`)
