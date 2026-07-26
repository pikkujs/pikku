// Verifies every `import { X } from '@pikku/pkg'` in a package README resolves
// to a symbol the package actually exports, following `export * from` chains.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'

const ROOT = process.cwd()
const byName = new Map()
function walk(d) {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === 'dist') continue
    const f = join(d, e)
    if (statSync(f).isDirectory()) walk(f)
    else if (e === 'package.json') {
      try {
        const p = JSON.parse(readFileSync(f, 'utf8'))
        if (p.name && !p.private) byName.set(p.name, { dir: d, pkg: p })
      } catch {}
    }
  }
}
walk(join(ROOT, 'packages'))

/** Collect exported symbol names from a module, following `export *`. */
function exportsOf(file, seen = new Set()) {
  if (!existsSync(file) || seen.has(file)) return new Set()
  seen.add(file)
  const src = readFileSync(file, 'utf8')
  const out = new Set()
  if (/export\s+default/.test(src)) out.add('__default__')
  for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:class|const|function|interface|type|enum)\s+(\w+)/g)) out.add(m[1])
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g))
    for (const s of m[1].split(',')) {
      const t = s.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()
      if (t) out.add(t.trim())
    }
  for (const m of src.matchAll(/export\s+\*\s+from\s+'(\.[^']+)'/g)) {
    const rel = resolve(dirname(file), m[1].replace(/\.js$/, '.ts'))
    for (const s of exportsOf(rel, seen)) out.add(s)
  }
  return out
}

/** Map an import specifier (incl. subpaths) to its source index file. */
function entryFor(spec) {
  for (const [name, { dir, pkg }] of byName) {
    if (spec === name) return join(dir, 'src', 'index.ts')
    if (spec.startsWith(name + '/')) {
      const sub = './' + spec.slice(name.length + 1)
      const exp = pkg.exports?.[sub]
      if (!exp) return null
      const target = typeof exp === 'string' ? exp : (exp.import ?? exp.default)
      if (!target) return null
      return join(dir, target.replace(/^\.\/dist\//, '').replace(/\.js$/, '.ts'))
    }
  }
  return null
}

let bad = 0, checked = 0
for (const [name, { dir }] of byName) {
  const rp = join(dir, 'README.md')
  if (!existsSync(rp)) continue
  const md = readFileSync(rp, 'utf8')
  for (const m of md.matchAll(/import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+'(@pikku\/[^']+)'/g)) {
    const entry = entryFor(m[2])
    if (!entry) { console.log(`✖ ${name}: README imports unresolvable '${m[2]}'`); bad++; continue }
    if (!existsSync(entry)) continue
    const ex = exportsOf(entry)
    if (ex.size === 0) continue
    for (const sym of m[1].split(',').map(s => s.trim().replace(/^type\s+/, '')).filter(Boolean)) {
      checked++
      if (!ex.has(sym)) { console.log(`✖ ${name}: '${sym}' not exported by ${m[2]}`); bad++ }
    }
  }
  for (const m of md.matchAll(/import\s+(\w+)\s+from\s+'(@pikku\/[^']+)'/g)) {
    const entry = entryFor(m[2]); if (!entry || !existsSync(entry)) continue
    checked++
    if (!exportsOf(entry).has('__default__')) { console.log(`✖ ${name}: default import from ${m[2]}, no default export`); bad++ }
  }
}
console.log(bad === 0 ? `✓ ${checked} README imports resolve` : `\n${bad} broken`)
process.exit(bad ? 1 : 0)
