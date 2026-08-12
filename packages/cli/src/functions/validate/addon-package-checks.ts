import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { readJsonSafe, readTextSafe } from './shared-checks.js'
import type { ValidateFinding as Finding } from './persona-checks.js'

type AddonPkg = {
  name?: string
  private?: boolean
  files?: string[]
  imports?: unknown
  exports?: unknown
}

/** Where the CLI writes generated output, both in source and once built. */
const GENERATED_DIRS = ['.pikku', join('dist', '.pikku')]

/** Roots that carry generated output into the tarball when listed in `files`. */
const SHIPPING_ROOTS = new Set(['dist', '.pikku'])

/**
 * A package that publishes generated pikku output.
 *
 * The generated files carry relative imports to hand-written sources, so what
 * the package ships and what it references have to agree — which is what the
 * checks below are for.
 *
 * Having a `.pikku` directory is not enough on its own: an app's
 * packages/functions has one too, and it is codegen output for that app rather
 * than something anybody installs. The question is whether the package *ships*
 * it, so the signal is a `files`/`exports` that carries it into the tarball.
 * A private package is excluded for the same reason — nobody installs it, so
 * its published file set is not a thing that can be wrong.
 */
export async function isAddonPackage(pkgDir: string): Promise<boolean> {
  const pkg = await readJsonSafe<AddonPkg>(join(pkgDir, 'package.json'))
  if (!pkg || pkg.private) return false
  if (!GENERATED_DIRS.some((dir) => existsSync(join(pkgDir, dir)))) return false

  const shipsViaFiles = (pkg.files ?? []).some((entry) =>
    SHIPPING_ROOTS.has(entry.replace(/^\.\//, '').split('/')[0]!)
  )
  return shipsViaFiles || JSON.stringify(pkg.exports ?? null).includes('.pikku')
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(path)))
    else out.push(path)
  }
  return out
}

const IMPORT_RE =
  /(?:^|[\s(};])(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g

function relativeSpecifiers(source: string): string[] {
  const found = new Set<string>()
  for (const match of source.matchAll(IMPORT_RE)) {
    const specifier = match[1]!
    if (specifier.startsWith('.')) found.add(specifier)
  }
  return [...found]
}

/**
 * The on-disk file a specifier names, under TypeScript's NodeNext rules.
 *
 * `./x.js` may be satisfied by `x.ts` or `x.d.ts`, and pikku's generated files
 * import hand-written declarations as `./x.d.js` — the `.js` extension the
 * compiler wants, on a file that only ever exists as `.d.ts`.
 */
function resolveCandidates(specifier: string, fromDir: string): string[] {
  const base = resolve(fromDir, specifier)
  if (base.endsWith('.d.js')) return [base.slice(0, -5) + '.d.ts']
  if (base.endsWith('.js')) {
    const stem = base.slice(0, -3)
    return [base, stem + '.ts', stem + '.d.ts', stem + '.tsx']
  }
  // `.mjs` and `.cjs` are scanned as generated files, so they are also imported
  // as one, and each has its own TypeScript twin rather than sharing `.ts`.
  if (base.endsWith('.mjs') || base.endsWith('.cjs')) {
    const stem = base.slice(0, -4)
    const kind = base.slice(-3, -2)
    return [base, `${stem}.${kind}ts`, `${stem}.d.${kind}ts`]
  }
  if (/\.(ts|tsx|json)$/.test(base)) return [base]
  return [
    base + '.ts',
    base + '.d.ts',
    base + '.js',
    join(base, 'index.ts'),
    join(base, 'index.d.ts'),
    join(base, 'index.js'),
  ]
}

/**
 * The directory a `files` entry is rooted at.
 *
 * `dist`, `dist/`, `dist/**` and `dist/*` all publish the same tree, so the
 * root is what decides both whether a path ships and whether the entry has
 * anything behind it. Anything more elaborate than a trailing wildcard is left
 * to npm.
 */
function packedRoot(entry: string): string {
  return entry
    .replace(/^\.\//, '')
    .replace(/\/\*+$/, '')
    .replace(/\/$/, '')
}

/**
 * Whether `files` carries this path into the published tarball.
 *
 * A package with no `files` publishes everything, so the question only has
 * teeth when the field is present.
 */
function isPacked(
  absPath: string,
  pkgDir: string,
  files: string[] | undefined
): boolean {
  if (!files) return true
  const rel = relative(pkgDir, absPath)
  if (rel.startsWith('..')) return false
  return files.some((entry) => {
    const normalized = packedRoot(entry)
    return rel === normalized || rel.startsWith(normalized + sep)
  })
}

/**
 * Every `./…` target reachable through an `exports` or `imports` map, paired
 * with the entry-point name that leads to it.
 *
 * Both fields nest arbitrarily deep — a subpath holds a condition object, which
 * may hold another — so the walk collects strings rather than assuming a shape.
 * A `*` is left in place: the wildcard's own directory is what has to ship.
 */
function entryPointTargets(
  map: unknown,
  name = ''
): Array<{ name: string; target: string }> {
  if (typeof map === 'string') {
    return map.startsWith('./') ? [{ name, target: map }] : []
  }
  if (!map || typeof map !== 'object') return []
  return Object.entries(map).flatMap(([key, value]) =>
    entryPointTargets(value, name || key)
  )
}

/**
 * Every relative import in a shipped generated file must resolve to a file
 * that is itself shipped.
 *
 * Stated as a property rather than as "the build script must copy types/",
 * because the build script is not the only way to get this wrong and will not
 * always be a `cp`. The generated files declare what they need; the check just
 * holds the package to it.
 */
export async function runAddonPackageChecks(
  pkgDir: string
): Promise<Finding[]> {
  const findings: Finding[] = []
  const pkg = await readJsonSafe<AddonPkg>(join(pkgDir, 'package.json'))
  if (!pkg) return findings

  // `files` is the package's own statement of what it publishes, so an entry
  // with nothing behind it means the build has not run — and validating the
  // published file set of a package that has not been built proves nothing.
  const absent = (pkg.files ?? []).filter(
    (entry) => !existsSync(join(pkgDir, packedRoot(entry)))
  )
  if (absent.length > 0) {
    findings.push({
      id: 'addon-not-built',
      severity: 'info',
      message: `${pkg.name ?? relative(dirname(pkgDir), pkgDir)} lists ${absent.join(', ')} in "files" with nothing on disk — packaging was not verified because the package is not built`,
      path: join(pkgDir, absent[0]!),
      fixHint:
        'Run the package build first, then validate. In CI, `build && pikku validate` is the order that checks what actually publishes.',
    })
    return findings
  }

  // The entry points are the package's promise about what can be reached from
  // outside it, and nothing inside dist/.pikku mentions them — so the import
  // walk below cannot see a `#pikku` that still points at the source tree.
  for (const { name, target } of [
    ...entryPointTargets(pkg.imports),
    ...entryPointTargets(pkg.exports),
  ]) {
    const withoutWildcard = target.slice(2).split('*')[0]!

    if (!isPacked(join(pkgDir, withoutWildcard), pkgDir, pkg.files)) {
      findings.push({
        id: 'addon-entry-point-not-packed',
        severity: 'error',
        message: `"${name}" resolves to ${target}, which "files" does not publish — the entry point exists here and not for anyone who installs ${pkg.name ?? 'this addon'}`,
        path: join(pkgDir, withoutWildcard),
        fixHint: `Point it at the built copy under dist, or add ${withoutWildcard.split('/')[0]} to "files".`,
      })
      continue
    }

    // Shipping the directory is not the same as producing the file. A wildcard
    // names a directory whose contents are the point, so only a concrete
    // target can be held to existing.
    if (!target.includes('*') && !existsSync(join(pkgDir, withoutWildcard))) {
      findings.push({
        id: 'addon-entry-point-missing',
        severity: 'error',
        message: `"${name}" resolves to ${target}, which does not exist — importing it fails for anyone who installs ${pkg.name ?? 'this addon'}`,
        path: join(pkgDir, withoutWildcard),
        fixHint:
          'Point the entry point at a file the build produces, or drop it from "exports".',
      })
    }
  }

  // Both generated directories ship, and they are not the same check twice.
  // `exports` maps `./.pikku/*` to the root one, making it a public entry
  // point whose imports climb to `<pkg>/types`, while the copy under dist
  // reaches `<pkg>/dist/types` — two roots, two ways to fall outside the
  // tarball.
  const generatedRoots = GENERATED_DIRS.map((dir) => join(pkgDir, dir)).filter(
    (dir) => existsSync(dir) && isPacked(dir, pkgDir, pkg.files)
  )

  // One missing file is imported by every generated file that needs its types,
  // so reporting per import turns a single packaging mistake into a page of
  // findings. Group by what is actually wrong: the thing that is not shipped.
  const unresolved = new Map<string, { specifier: string; files: string[] }>()
  const unpacked = new Map<string, { target: string; files: string[] }>()

  const shippedFiles = (
    await Promise.all(generatedRoots.map((root) => walk(root)))
  ).flat()

  for (const file of shippedFiles) {
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(file)) continue
    const source = await readTextSafe(file)
    if (!source) continue

    for (const specifier of relativeSpecifiers(source)) {
      const candidates = resolveCandidates(specifier, dirname(file))
      const target = candidates.find((candidate) => existsSync(candidate))

      if (!target) {
        // Keyed by the file that is missing rather than by the specifier: the
        // same absent file is spelled `../types/x` from one directory and
        // `../../types/x` from another, and it is still one thing to fix.
        const missing = candidates[0]!
        const seen = unresolved.get(missing) ?? { specifier, files: [] }
        seen.files.push(file)
        unresolved.set(missing, seen)
      } else if (!isPacked(target, pkgDir, pkg.files)) {
        const seen = unpacked.get(target) ?? { target, files: [] }
        seen.files.push(file)
        unpacked.set(target, seen)
      }
    }
  }

  const alsoIn = (files: string[]): string =>
    files.length > 1
      ? ` (and ${files.length - 1} other generated file${files.length > 2 ? 's' : ''})`
      : ''

  for (const [missing, { specifier, files }] of unresolved) {
    findings.push({
      id: 'addon-shipped-import-unresolved',
      severity: 'error',
      message: `${relative(pkgDir, missing)} is not in the package, but ${files.length} shipped generated file${files.length === 1 ? '' : 's'} import${files.length === 1 ? 's' : ''} it (as "${specifier}" from ${relative(pkgDir, files[0]!)}) — anything installing ${pkg.name ?? 'this addon'} typechecks against a module that is not there`,
      path: missing,
      fixHint:
        'Ship the file it names. The generated output is copied into dist, so whatever it imports has to be copied too — e.g. `cp -r .pikku types dist/` rather than `cp -r .pikku dist/`.',
    })
  }

  for (const { target, files } of unpacked.values()) {
    findings.push({
      id: 'addon-shipped-import-not-packed',
      severity: 'error',
      message: `${relative(pkgDir, files[0]!)} imports ${relative(pkgDir, target)}${alsoIn(files)}, which exists but is excluded by "files" — it resolves here and not for anyone who installs the package`,
      path: target,
      fixHint: `Add ${relative(pkgDir, target).split(sep)[0]} to "files" in package.json, or move the file under a path already listed there.`,
    })
  }

  return findings
}
