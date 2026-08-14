#!/usr/bin/env node
// Fails when the peer ranges declared across this monorepo cannot all be
// satisfied by one installed version.
//
// A peer range is a constraint, not a pin: resolving overlapping constraints
// down to a single version is the package manager's job, and two packages
// asking for `^0.12.44` and `^0.12.83` are both correctly served by 0.12.83.
// Forcing every declaration to the same string would instead invent floors
// nobody verified — raising `@pikku/jose` to `^0.12.83` tells a project on
// core 0.12.50 it must upgrade, which is not true.
//
// What does break is drift into ranges with no version in common (`ai` at
// `^5` and `^6`). npm 7+ hard-fails that with ERESOLVE, but yarn and pnpm only
// warn — so it lands here silently and detonates in a consumer's install.
// Hence two rules:
//
//   1. Every pair of ranges declared for the same peer must intersect.
//   2. A peer another package bounds may not be declared unbounded (`*`).
//      A wildcard intersects everything, so rule 1 can never catch it, yet it
//      promises compatibility with majors that do not exist yet.
//
// Run with --fix to narrow unbounded ranges. A first-party peer narrows to the
// version of that workspace package, which is demonstrably what the declaring
// package compiles against; a third-party peer narrows to the widest bound its
// siblings declare. Rule 1 conflicts are a judgement call, never auto-fixed.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  intersects,
  isUnbounded,
  isParseable,
  isSatisfiable,
} from './semver-ranges.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = ['packages', 'templates']
const FIX = process.argv.includes('--fix')

/** Recursively collect every package.json, skipping build and install output. */
function findPackageJsons(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.deploy')
      continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) findPackageJsons(full, out)
    else if (entry === 'package.json') out.push(full)
  }
  return out
}

/** The lowest version a range admits, for picking the widest of several. */
function floorOf(range) {
  const first = range.split('||')[0].trim()
  const match = first.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return [0, 0, 0]
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function compareFloors(a, b) {
  const [x, y] = [floorOf(a), floorOf(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

const files = SCAN_DIRS.flatMap((d) => findPackageJsons(join(ROOT, d)))

/** peer name -> range -> [{ pkg, file }] */
const declarations = new Map()
/** workspace package name -> its own version */
const workspaceVersions = new Map()
for (const file of files) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  if (pkg.name && pkg.version) workspaceVersions.set(pkg.name, pkg.version)
  for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
    if (typeof range !== 'string') continue
    if (!declarations.has(name)) declarations.set(name, new Map())
    const byRange = declarations.get(name)
    if (!byRange.has(range)) byRange.set(range, [])
    byRange.get(range).push({ pkg: pkg.name ?? file, file })
  }
}

const disjoint = []
const unbounded = []
const invalid = []

for (const [name, byRange] of [...declarations].sort()) {
  const ranges = [...byRange.keys()]

  for (const range of ranges) {
    if (!isParseable(range))
      invalid.push({ name, range, byRange, why: 'is not a valid semver range' })
    else if (!isSatisfiable(range))
      invalid.push({ name, range, byRange, why: 'admits no version at all' })
  }

  const bounded = ranges.filter((r) => !isUnbounded(r))
  for (const range of ranges) {
    if (!isUnbounded(range) || bounded.length === 0) continue
    // A workspace package links its local copy during development, so its
    // current version is what the declaring package demonstrably compiles
    // against. For a third party there is no such evidence, so fall back to
    // the widest bound a sibling already claims.
    const local = workspaceVersions.get(name)
    const suggestion = local
      ? `^${local}`
      : bounded.reduce((a, b) => (compareFloors(b, a) < 0 ? b : a))
    unbounded.push({
      name,
      range,
      suggestion,
      basis: local ? 'workspace version' : 'widest sibling bound',
      users: byRange.get(range),
    })
  }

  // One report per peer, not per pair: a single stray range is disjoint with
  // every other range declared for that peer, which would print N near-identical
  // blocks for one root cause.
  const pairs = []
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      // null means one side could not be parsed; that is reported separately.
      if (intersects(ranges[i], ranges[j]) === false)
        pairs.push([ranges[i], ranges[j]])
    }
  }
  if (pairs.length > 0) disjoint.push({ name, pairs, byRange })
}

const label = (users) => users.map((u) => u.pkg).join(', ')

if (disjoint.length === 0 && unbounded.length === 0 && invalid.length === 0) {
  console.log(
    `✓ ${declarations.size} peer dependencies across ${files.length} package.json files — every range mutually satisfiable, none unbounded`
  )
  process.exit(0)
}

if (!FIX || disjoint.length > 0 || invalid.length > 0) {
  console.error('')
  for (const { name, pairs, byRange } of disjoint) {
    console.error(`✖ ${name}: declared ranges have no version in common`)
    for (const [range, users] of byRange) {
      console.error(`    ${range.padEnd(18)} ${label(users)}`)
    }
    const shown = pairs.slice(0, 3).map(([a, b]) => `${a} ✕ ${b}`)
    console.error(
      `  Disjoint: ${shown.join(', ')}${pairs.length > 3 ? ` (+${pairs.length - 3} more)` : ''}`
    )
    console.error(
      `  A consumer of both cannot install: npm fails with ERESOLVE, yarn and pnpm only warn.\n`
    )
  }
  for (const { name, range, byRange, why } of invalid) {
    console.error(`✖ ${name}: "${range}" ${why}`)
    console.error(`    ${label(byRange.get(range))}\n`)
  }
  if (!FIX) {
    for (const { name, range, suggestion, basis, users } of unbounded) {
      console.error(`✖ ${name}: declared "${range}" by ${label(users)}`)
      console.error(
        `  Other packages bound it, so "${range}" promises compatibility with majors that`
      )
      console.error(
        `  do not exist yet. Suggested: ${suggestion} (${basis}). Run \`yarn check:peer-deps --fix\`.\n`
      )
    }
  }
  process.exit(1)
}

let rewritten = 0
for (const { name, range, suggestion, users } of unbounded) {
  for (const { pkg, file } of users) {
    const source = readFileSync(file, 'utf8')
    // Rewrite in place rather than re-serialising: a package.json is
    // hand-edited far more often than generated, and JSON.stringify would
    // reflow indentation and drop the trailing newline.
    const pattern = new RegExp(
      `("${name.replace(/[/@.]/g, '\\$&')}"\\s*:\\s*)"${range.replace(/[.^*|+]/g, '\\$&')}"`
    )
    const next = source.replace(pattern, `$1"${suggestion}"`)
    if (next === source) {
      console.error(`✖ could not rewrite ${name} in ${pkg} — edit it by hand`)
      process.exit(1)
    }
    writeFileSync(file, next)
    console.log(`  ${pkg}: ${name} ${range} → ${suggestion}`)
    rewritten++
  }
}
console.log(
  `\n✓ narrowed ${rewritten} unbounded peer ranges — confirm each package really supports its new floor`
)
