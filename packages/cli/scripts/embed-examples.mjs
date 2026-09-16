#!/usr/bin/env node
// Generates src/examples.gen.ts — every recipe under examples/ as a typed module.
//
// Embedded rather than read from disk for the same reason @pikku/skills embeds its
// markdown: the `bun build --compile` binaries only carry the JS import graph, so files
// reached through readdir are invisible to the bundler and `pikku examples` would work
// from npm and throw from Homebrew.
//
// The source of truth is the recipe FILES. A recipe is real TypeScript with a `//~`
// header block, so it can be type-checked where it lives; this step only collects them.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  statSync,
} from 'node:fs'
import { join, dirname, extname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(root, '..', '..')

// Where recipes are collected from. The backend corpus is the CLI's own; the React
// corpus lives inside the field-service example app so CI type-checks it against a real
// generated client, which a file beside the CLI could never be.
const SOURCE_DIRS = [
  join(root, 'examples'),
  join(repoRoot, 'examples/field-service/apps/app/src/examples'),
]

const HEADER_FIELDS = new Set([
  'name',
  'title',
  'when',
  'lang',
  'entity',
  'requires',
  'deferUntil',
  'include',
  'steps',
])

// `//~ steps:` opens a BLOCK carried to the caller verbatim — the follow-up a recipe
// cannot perform itself (registering an entrypoint, enabling a plugin). Every other
// `//~` line is teaching, stripped before anything lands on disk.
function parseHeader(content, ext) {
  const meta = { lang: ext === '.tsx' ? 'tsx' : 'ts' }
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(/^\s*\/\/~\s*([a-zA-Z]+):\s*(.*?)\s*$/)
    if (!m) {
      if (line.trim() === '' || line.trim().startsWith('//~')) continue
      break
    }
    if (m[1] === 'steps' && m[2] === '') {
      const block = []
      while (i + 1 < lines.length) {
        const next = lines[i + 1]
        if (!next.trim().startsWith('//~')) break
        const field = next.match(/^\s*\/\/~\s*([a-zA-Z]+):\s/)
        if (field && HEADER_FIELDS.has(field[1])) break
        block.push(next.replace(/^\s*\/\/~ ?/, ''))
        i++
      }
      meta.steps = block.join('\n').trim()
      continue
    }
    meta[m[1]] = m[2]
  }
  return meta
}

// `//~ include: <file>` splices a sibling partial in place of the line, so a fragment
// several recipes share is written once.
function expandIncludes(content, sourceFile, seen = []) {
  return content
    .split('\n')
    .map((line) => {
      const m = line.match(/^\s*\/\/~\s*include:\s*(.+?)\s*$/)
      if (!m) return line
      const target = join(dirname(sourceFile), m[1])
      if (!existsSync(target)) {
        throw new Error(
          `[embed-examples] ${relative(repoRoot, sourceFile)} includes missing partial ${m[1]}`
        )
      }
      if (seen.includes(target)) {
        throw new Error(
          `[embed-examples] circular include of ${m[1]} from ${relative(repoRoot, sourceFile)}`
        )
      }
      return expandIncludes(readFileSync(target, 'utf-8'), target, [
        ...seen,
        sourceFile,
      ])
    })
    .join('\n')
}

// The folder a recipe lives in is NOT part of its identity — discovery is keyed off the
// `//~ name` header, so a recipe can move between folders without a runtime change.
// A leading underscore marks a shared fragment pulled in by `include:`, never a recipe.
function collect(dir, out = []) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collect(full, out)
      continue
    }
    if (entry.startsWith('_')) continue
    if (extname(entry) === '.ts' || extname(entry) === '.tsx') out.push(full)
  }
  return out
}

/**
 * Refuse a `//~ entity:` the recipe never actually spells.
 *
 * The rename is substring-based, so an entity that appears in no form is a silent no-op:
 * the command demands `--entity`, reports success, and writes the example domain into
 * someone's app anyway. It is invisible at every later point, so it is caught here.
 */
function assertEntityAppears(entity, content, relPath) {
  const parts = entity
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
  const pascal = parts.map((w) => w[0].toUpperCase() + w.slice(1)).join('')
  const forms = [
    pascal,
    pascal[0].toLowerCase() + pascal.slice(1),
    parts.join('-'),
  ]
  if (!forms.some((f) => content.includes(f))) {
    throw new Error(
      `[embed-examples] ${relPath} declares "//~ entity: ${entity}" but never spells it ` +
        `(${forms.join(' / ')}) — the rename would silently do nothing`
    )
  }
}

const examples = []
const names = new Map()
for (const dir of SOURCE_DIRS) {
  if (!existsSync(dir)) continue
  for (const file of collect(dir)) {
    const relPath = relative(repoRoot, file).split(sep).join('/')
    const raw = readFileSync(file, 'utf-8')
    const meta = parseHeader(raw, extname(file))
    if (!meta.name)
      throw new Error(`[embed-examples] ${relPath} has no "//~ name:"`)
    if (!meta.title)
      throw new Error(`[embed-examples] ${relPath} has no "//~ title:"`)
    if (names.has(meta.name)) {
      throw new Error(
        `[embed-examples] two recipes are called "${meta.name}": ${names.get(meta.name)} and ${relPath}`
      )
    }
    names.set(meta.name, relPath)
    const content = expandIncludes(raw, file)
    if (meta.entity) assertEntityAppears(meta.entity, content, relPath)
    examples.push({
      name: meta.name,
      title: meta.title,
      when: meta.when ?? '',
      lang: meta.lang,
      entity: meta.entity ?? '',
      deferUntil: meta.deferUntil ?? '',
      requires: (meta.requires ?? '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean),
      steps: meta.steps ?? '',
      source: relPath,
      content,
    })
  }
}

for (const example of examples) {
  for (const required of example.requires) {
    if (!names.has(required)) {
      throw new Error(
        `[embed-examples] ${example.source} requires "${required}", which no recipe declares`
      )
    }
  }
}

examples.sort((a, b) => a.name.localeCompare(b.name))

const out = `// Generated by scripts/embed-examples.mjs — do not edit.
// Run \`bun run embed\` in @pikku/cli after changing anything under examples/.
//
// A plain typed module rather than a JSON import: the \`bun --compile\` binaries carry
// only the JS import graph, so a recipe read from disk ships to npm and not to the
// binary most people run. See scripts/embed-examples.mjs.

export interface PikkuExample {
  name: string
  title: string
  when: string
  lang: string
  /** The example domain symbol this recipe spells, which \`--entity\` renames. */
  entity: string
  /** A precondition the recipe declares, refusing \`add\` until it holds. */
  deferUntil: string
  requires: string[]
  /** The follow-up the recipe cannot perform itself, carried to the caller verbatim. */
  steps: string
  /** Where the recipe lives, repo-relative. */
  source: string
  content: string
}

export const EXAMPLES: PikkuExample[] = ${JSON.stringify(examples, null, 0)}
`

writeFileSync(join(root, 'src', 'examples.gen.ts'), out)
console.log(
  `Embedded ${examples.length} examples (${(Buffer.byteLength(out) / 1024).toFixed(0)} KB)`
)
