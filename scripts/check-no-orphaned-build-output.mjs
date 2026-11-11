#!/usr/bin/env node
// Fails if a publishable package's tarball would ship compiled output whose
// source no longer exists.
//
// Why: `tsc -b` never deletes what it emitted for a file that has since been
// removed or renamed, so a long-lived `dist/` keeps the old modules. CI
// publishes from a fresh checkout and is unaffected, but a local publish ships
// them: @pikku/core once carried 34 files from the old virtual-user modules that no source
// produced any more. `npm pack` includes whatever is on disk, so the check runs
// against its file list, after the build and before `changeset publish`.
//
// A packed file is checked when it sits under an `outDir` that one of the
// package's tsconfig*.json files pairs with a `rootDir`; its source must exist
// at the same relative path under that rootDir. Anything else (bundles, copied
// assets, generated JSON) is out of scope.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, dirname, relative, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.deploy',
  '.pikku',
  '.next',
])
// A hand-written or generated declaration copied into the outDir (an addon's
// `types/*.d.ts`, the `.pikku/**/*.gen.d.ts` maps) is its own source.
const SOURCE_EXTS = [
  '.d.ts',
  '.d.mts',
  '.d.cts',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]
const EMITTED = /(\.d)?\.(m|c)?js(\.map)?$|\.d\.(m|c)?ts(\.map)?$/
const CONCURRENCY = 8

const run = promisify(execFile)

function findPackageJsons(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) findPackageJsons(full, out)
    else if (entry === 'package.json') out.push(full)
  }
  return out
}

/** `outDir` → `rootDir` pairs from every tsconfig*.json in the package. */
function outputRoots(pkgDir) {
  const roots = []
  for (const entry of readdirSync(pkgDir)) {
    if (!/^tsconfig.*\.json$/.test(entry)) continue
    let options
    try {
      options = JSON.parse(
        readFileSync(join(pkgDir, entry), 'utf8')
      ).compilerOptions
    } catch {
      continue
    }
    if (!options?.outDir || !options?.rootDir) continue
    roots.push({
      outDir: posix.normalize(options.outDir),
      rootDir: posix.normalize(options.rootDir),
    })
  }
  // Longest outDir first, so `dist/cjs` wins over `dist`.
  return roots.sort((a, b) => b.outDir.length - a.outDir.length)
}

function hasSource(pkgDir, rootDir, emittedRel) {
  const stem = emittedRel.replace(EMITTED, '')
  return SOURCE_EXTS.some((ext) =>
    existsSync(join(pkgDir, rootDir, stem + ext))
  )
}

async function orphansIn(pkgDir) {
  const roots = outputRoots(pkgDir)
  if (roots.length === 0) return []
  const { stdout } = await run(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: pkgDir, maxBuffer: 64 * 1024 * 1024 }
  )
  const [{ files }] = JSON.parse(stdout)
  const orphans = []
  for (const { path } of files) {
    if (!EMITTED.test(path)) continue
    const root = roots.find((r) => path.startsWith(r.outDir + '/'))
    if (!root) continue
    if (!hasSource(pkgDir, root.rootDir, path.slice(root.outDir.length + 1))) {
      orphans.push(path)
    }
  }
  return orphans
}

const packages = findPackageJsons(join(ROOT, 'packages')).flatMap((file) => {
  try {
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    return pkg.private || !pkg.name ? [] : [dirname(file)]
  } catch {
    return []
  }
})

const problems = []
const queue = [...packages]
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let pkgDir = queue.shift(); pkgDir; pkgDir = queue.shift()) {
      const orphans = await orphansIn(pkgDir)
      if (orphans.length > 0) {
        problems.push(
          `${relative(ROOT, pkgDir)}: ${orphans.length} packed file(s) with no source\n    ` +
            orphans.join('\n    ')
        )
      }
    }
  })
)

if (problems.length > 0) {
  console.error(
    `Tarballs would ship build output from deleted sources:\n  ${problems.sort((a, b) => a.localeCompare(b)).join('\n  ')}\n` +
      'Delete the stale dist/ (and tsbuildinfo) and rebuild.'
  )
  process.exit(1)
}
console.log(
  `✓ ${packages.length} publishable packages: no packed build output without a source`
)
