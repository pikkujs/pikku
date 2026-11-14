#!/usr/bin/env node
// Fails if any publishable package's `license` field disagrees with the LICENSE
// file shipped beside it, or if either is missing, or if an MIT package depends
// on or imports an AGPL package.
//
// Why this is a gate and not a convention: the repo is deliberately mixed —
// @pikku/cli, @pikku/inspector, @pikku/inspector-go and the Rust inspector are
// AGPL-3.0-only, and so is every package that depends on or imports them
// (@pikku/addon-console, @pikku/code-edit, @pikku/n8n-import,
// @pikku/addon-changes-cli, @pikku/addon-cloud-cli). Everything else (core, runtimes, services, clients, addons,
// @pikku/skills) is MIT. npm renders the `license` field while lawyers read the
// LICENSE file, so a package where the two disagree is a package whose terms
// nobody can state. Every LICENSE file must be the canonical text in
// scripts/licenses/ byte for byte, so drift is visible as drift.
//
// The dependency rule: an MIT package that depends on or imports an AGPL one is
// MIT on paper only — whoever ships the two together is bound by the AGPL. Code
// that ends up in a user's app must never reach an AGPL package. Private
// packages count too: they are checked like published ones. This is an error,
// not a warning: fix it by moving the shared code to an MIT package or by
// relicensing the dependant.
//
// Run with --fix to materialise missing or drifted LICENSE files from
// scripts/licenses/.
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join, dirname, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIX = process.argv.includes('--fix')

/** The one canonical text per identifier; every LICENSE file must equal it. */
const TEXTS = {
  MIT: readFileSync(join(ROOT, 'scripts', 'licenses', 'MIT'), 'utf8'),
  'AGPL-3.0-only': readFileSync(
    join(ROOT, 'scripts', 'licenses', 'AGPL-3.0'),
    'utf8'
  ),
}

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.deploy',
  '.pikku',
  '.next',
  'target',
  'testdata',
])

function walk(dir, match, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, match, out)
    else if (match(entry)) out.push(full)
  }
  return out
}

const problems = []
const warnings = []
const fixed = []
let checked = 0

// The root manifest is private, but a single SPDX id there would misdescribe a
// deliberately mixed repo.
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
if (rootPkg.license !== 'SEE LICENSE IN LICENSE') {
  problems.push(
    `package.json: root license should be "SEE LICENSE IN LICENSE" (the repo is ` +
      `mixed AGPL/MIT), not "${rootPkg.license}"`
  )
}

/** Checks (and with --fix writes) the LICENSE beside a manifest. */
function checkLicenseFile(dir, license, where) {
  const licensePath = join(dir, 'LICENSE')
  const canonical = TEXTS[license]
  if (!license) {
    problems.push(`${where}: no license field`)
    return
  }
  if (!canonical) {
    problems.push(
      `${where}: license "${license}" is not one this repo uses ` +
        `(${Object.keys(TEXTS).join(', ')})`
    )
    return
  }
  if (!existsSync(licensePath)) {
    if (FIX) {
      writeFileSync(licensePath, canonical)
      fixed.push(relative(ROOT, licensePath))
    } else {
      problems.push(
        `${where}: no LICENSE file beside it — npm always ships LICENSE, and ` +
          `the root one is not in the tarball`
      )
    }
    return
  }
  if (readFileSync(licensePath, 'utf8') !== canonical) {
    if (FIX) {
      writeFileSync(licensePath, canonical)
      fixed.push(relative(ROOT, licensePath))
    } else {
      problems.push(
        `${relative(ROOT, licensePath)}: differs from the canonical ${license} ` +
          `text in scripts/licenses/`
      )
    }
  }
}

const packages = []
for (const file of walk(join(ROOT, 'packages'), (e) => e === 'package.json')) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  if (!pkg.name) continue
  packages.push({ pkg, dir: dirname(file) })
  if (pkg.private) continue
  checked++
  checkLicenseFile(dirname(file), pkg.license, relative(ROOT, file))
}

// Rust crates declare their licence in Cargo.toml; same rule.
for (const file of walk(join(ROOT, 'packages'), (e) => e === 'Cargo.toml')) {
  const toml = readFileSync(file, 'utf8')
  const pkgSection = toml.split(/^\[(?!package\])/m)[0]
  const m = pkgSection.match(/^license\s*=\s*"([^"]+)"/m)
  checked++
  checkLicenseFile(dirname(file), m?.[1], relative(ROOT, file))
}

// ── The dependency rule: MIT must not reach AGPL ──────────────────────────
const agpl = new Set(
  packages
    .filter(({ pkg }) => pkg.license === 'AGPL-3.0-only')
    .map(({ pkg }) => pkg.name)
)
const SHIPPED_DEPS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies',
]
const SOURCE_EXT = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.mjs',
  '.cjs',
])
const isTestFile = (p) =>
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
  /(^|\/)(test|tests|__tests__)\//.test(p)
// `import … from 'x'`, `export … from 'x'`, `import 'x'`, `import('x')`,
// `require('x')`. Group 1 is set for `import type` / `export type`.
const IMPORT_RE =
  /(?:\b(?:import|export)\s+(type\s+)?[\w*{}\s,$]*?\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)['"]((?:@[^'"/]+\/)?[^'"/]+)(?:\/[^'"]*)?['"]/g

for (const { pkg, dir } of packages) {
  if (pkg.license !== 'MIT') continue
  const where = relative(ROOT, dir)
  for (const field of SHIPPED_DEPS) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (agpl.has(dep)) {
        warnings.push(`${where} (${pkg.name}): ${field} on AGPL ${dep}`)
      }
    }
  }
  const srcDir = join(dir, 'src')
  if (!existsSync(srcDir)) continue
  const seen = new Map()
  for (const file of walk(srcDir, (e) => SOURCE_EXT.has(extname(e)))) {
    const rel = relative(ROOT, file)
    if (isTestFile(rel)) continue
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = m[2]
      if (!agpl.has(target)) continue
      const typeOnly = Boolean(m[1])
      const key = `${target}${typeOnly ? ' (type-only)' : ''}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  }
  for (const [key, count] of seen) {
    warnings.push(
      `${where} (${pkg.name}): source imports AGPL ${key} in ${count} place(s)`
    )
  }
}

if (fixed.length > 0) {
  console.log(`Wrote LICENSE for:\n  ${fixed.join('\n  ')}`)
}
if (warnings.length > 0) {
  console.error(
    `\nERROR: MIT packages that depend on or import an AGPL package ` +
      `(${warnings.length}):\n  ${warnings.join('\n  ')}\n` +
      `An MIT package must not reach AGPL code. Move the shared code to an MIT ` +
      `package, or relicense the dependant.\n`
  )
  problems.push(`${warnings.length} MIT -> AGPL dependency violation(s)`)
}
if (problems.length > 0) {
  console.error(
    `License metadata does not match the LICENSE files:\n  ${problems.join('\n  ')}\n` +
      `Run \`bun run check:licenses --fix\` to write the canonical LICENSE files.`
  )
  process.exit(1)
}
console.log(
  `✓ ${checked} publishable packages and crates: license field matches LICENSE file`
)
