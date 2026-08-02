#!/usr/bin/env node
// Fails if any publishable package's `license` field disagrees with the LICENSE
// file shipped beside it, or if either is missing.
//
// Why this is a gate and not a convention: the repo is deliberately mixed —
// @pikku/cli, @pikku/inspector and @pikku/console are BUSL-1.1, everything else
// (notably @pikku/skills, the agent instruction set other harnesses are meant to
// adopt) is MIT. npm renders the `license` field while lawyers read the LICENSE
// file, so a package where the two disagree is a package whose terms nobody can
// state. Before this check existed, eight publishable packages had no `license`
// field at all, one said UNLICENSED by accident, and no package carried a
// LICENSE file — the grant lived only in the repo root, which npm tarballs
// never include.
//
// Run with --fix to materialise the missing or drifted MIT LICENSE files from
// scripts/licenses/MIT. BUSL packages are never written for you: their
// Licensed Work clause names the package and is a legal decision, not a copy.
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIX = process.argv.includes('--fix')

/** Distinctive text that must appear in a LICENSE file for each identifier. */
const FINGERPRINTS = {
  MIT: 'Permission is hereby granted, free of charge',
  'BUSL-1.1': 'Business Source License 1.1',
}

/** The one MIT text every MIT package ships, so drift is visible as drift. */
const MIT_TEXT = readFileSync(join(ROOT, 'scripts', 'licenses', 'MIT'), 'utf8')

function findPackageJsons(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (
      ['node_modules', 'dist', '.deploy', '.pikku', '.next'].includes(entry)
    ) {
      continue
    }
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) findPackageJsons(full, out)
    else if (entry === 'package.json') out.push(full)
  }
  return out
}

const problems = []
const fixed = []
let checked = 0

// The root manifest is private, but a single SPDX id there would misdescribe a
// deliberately mixed repo — it used to say MIT while the root LICENSE is BUSL.
const rootPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
if (rootPkg.license !== 'SEE LICENSE IN LICENSE') {
  problems.push(
    `package.json: root license should be "SEE LICENSE IN LICENSE" (the repo is ` +
      `mixed BUSL/MIT), not "${rootPkg.license}"`
  )
}

for (const file of findPackageJsons(join(ROOT, 'packages'))) {
  let pkg
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    continue
  }
  if (pkg.private || !pkg.name) continue
  checked++

  const dir = dirname(file)
  const where = relative(ROOT, file)
  const licensePath = join(dir, 'LICENSE')

  if (!pkg.license) {
    problems.push(`${where}: no "license" field`)
  } else if (!FINGERPRINTS[pkg.license]) {
    problems.push(
      `${where}: license "${pkg.license}" is not one this repo uses ` +
        `(${Object.keys(FINGERPRINTS).join(', ')})`
    )
  }

  if (!existsSync(licensePath)) {
    if (FIX && pkg.license === 'MIT') {
      writeFileSync(licensePath, MIT_TEXT)
      fixed.push(relative(ROOT, licensePath))
    } else {
      problems.push(
        `${where}: no LICENSE file beside it — npm always ships LICENSE, and ` +
          `the root one is not in the tarball`
      )
      continue
    }
  }

  const text = readFileSync(licensePath, 'utf8')
  const fingerprint = FINGERPRINTS[pkg.license]
  if (pkg.license === 'MIT' && text !== MIT_TEXT) {
    if (FIX) {
      writeFileSync(licensePath, MIT_TEXT)
      fixed.push(relative(ROOT, licensePath))
    } else {
      problems.push(
        `${relative(ROOT, licensePath)}: differs from scripts/licenses/MIT — ` +
          `every MIT package ships the same text`
      )
    }
  } else if (fingerprint && !text.includes(fingerprint)) {
    problems.push(
      `${where}: declares "${pkg.license}" but its LICENSE file does not read as ${pkg.license}`
    )
  }
  if (pkg.license === 'BUSL-1.1' && !text.includes(pkg.name)) {
    problems.push(
      `${relative(ROOT, licensePath)}: BUSL Licensed Work must name ${pkg.name}`
    )
  }
}

if (fixed.length > 0) {
  console.log(`Wrote MIT LICENSE for:\n  ${fixed.join('\n  ')}`)
}
if (problems.length > 0) {
  console.error(
    `License metadata does not match the LICENSE files:\n  ${problems.join('\n  ')}\n` +
      `Run \`yarn check:licenses --fix\` to write the MIT ones; BUSL packages ` +
      `need their LICENSE authored by hand.`
  )
  process.exit(1)
}
console.log(
  `✓ ${checked} publishable packages: license field matches LICENSE file`
)
