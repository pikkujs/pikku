import { existsSync } from 'node:fs'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { ErrorCode } from '@pikku/inspector'
import { readJsonSafe } from './shared-checks.js'
import type { ValidateFinding } from './persona-checks.js'

/**
 * Packages whose TYPE identity matters, not just their runtime identity.
 *
 * Two copies of one of these at different versions give TypeScript two
 * unrelated declarations of the same interface, and every place they meet
 * becomes a structural comparison of the full shape. Inside a generic inference
 * chain that compounds: one project went from a 1.3GB/13s typecheck to an
 * unbounded OOM (8GB and 12GB ceilings both died, 7.7M types, single
 * assignability checks taking 8s) because one dependency's `dist` was symlinked
 * into a sibling checkout that carried its own better-auth. It reads as "codegen
 * is slow", never as a version problem, which is why it is worth a check.
 *
 * Distinct from the duplicate-copy check, which is two copies of the SAME
 * version splitting module state at runtime. This is a compile-time blow-up and
 * only fires when the versions differ.
 */
const TYPE_IDENTITY_PKGS = [
  'better-auth',
  '@better-auth/core',
  '@pikku/core',
  'kysely',
  'zod',
]

/**
 * Installed version of `pkg` as seen FROM `fromDir`, walking parent
 * node_modules the way node resolution does. Used to ask what a linked
 * dependency resolves in its own checkout, which is not what the project
 * resolves.
 */
async function versionResolvedFrom(
  fromDir: string,
  pkg: string
): Promise<string | null> {
  let dir = fromDir
  for (;;) {
    const j = await readJsonSafe<{ version?: string }>(
      join(dir, 'node_modules', pkg, 'package.json')
    )
    if (j?.version) return j.version
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Where `pkg` resolves for the project itself. The root alone is not enough:
 * an isolated/pnpm-style install (bun's default) links dependencies under the
 * workspace package that declares them and leaves the root node_modules
 * without them, so probing only the root silently finds nothing.
 */
async function projectResolvedVersion(
  root: string,
  pkg: string
): Promise<{ version: string; from: string } | null> {
  const bases = [root]
  for (const group of ['packages', 'apps', 'backends']) {
    const groupDir = join(root, group)
    if (!existsSync(groupDir)) continue
    const entries = await readdir(groupDir, { withFileTypes: true }).catch(
      () => []
    )
    for (const d of entries) {
      if (d.isDirectory()) bases.push(join(groupDir, d.name))
    }
  }
  for (const base of bases) {
    const j = await readJsonSafe<{ version?: string }>(
      join(base, 'node_modules', pkg, 'package.json')
    )
    if (j?.version) return { version: j.version, from: base }
  }
  return null
}

/**
 * Dependencies whose code physically lives outside the project: a `link:` or
 * `portal:` dep, or a hand-made symlink into a sibling checkout. Only these can
 * introduce a second version of a type-identity package, because a normal
 * install dedupes through the lockfile.
 *
 * The symlink is often NOT the package directory but a build output inside it
 * (`node_modules/@scope/pkg/dist -> ../../../other-repo/packages/pkg/dist`),
 * which still moves type resolution to the other tree since TypeScript resolves
 * symlinks to their realpath. So each candidate subdir is probed too.
 *
 * Only symlinks are resolved. `realpath` lstats every component of the path, so
 * running it over every installed package costs 20x more on a hoisted install
 * (1781 packages at the root) than on an isolated one (35) — and a path that
 * traverses no symlink cannot leave the project anyway. `readdir` already hands
 * back the entry type, so ruling a package out is free.
 */
async function externalDependencyRoots(
  root: string
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const nodeModules = join(root, 'node_modules')
  if (!existsSync(nodeModules)) return found
  // Compare realpath against realpath: on macOS the temp/project path is often
  // itself a symlink (/var -> /private/var), which would otherwise make every
  // dependency look external.
  const realRoot = await realpath(root).catch(() => root)

  const topLevel = await readdir(nodeModules, { withFileTypes: true }).catch(
    () => []
  )
  const pkgDirs: Array<{ dir: string; link: boolean }> = []
  for (const entry of topLevel) {
    if (entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      const scoped = await readdir(join(nodeModules, entry.name), {
        withFileTypes: true,
      }).catch(() => [])
      for (const inner of scoped) {
        pkgDirs.push({
          dir: join(nodeModules, entry.name, inner.name),
          link: inner.isSymbolicLink(),
        })
      }
    } else {
      pkgDirs.push({
        dir: join(nodeModules, entry.name),
        link: entry.isSymbolicLink(),
      })
    }
  }

  const linkTarget = async (path: string): Promise<string | null> => {
    const stats = await lstat(path).catch(() => null)
    if (!stats?.isSymbolicLink()) return null
    return realpath(path).catch(() => null)
  }
  const isExternal = (real: string) => relative(realRoot, real).startsWith('..')

  for (const { dir: pkgDir, link } of pkgDirs) {
    // A package linked to a path inside the project (bun's .bun store) is not
    // external, but the build output *inside* that target still can be.
    const target = link ? await realpath(pkgDir).catch(() => null) : null
    if (link && !target) continue
    const candidates: Array<string | null> = [
      target && isExternal(target) ? target : null,
      await linkTarget(join(target ?? pkgDir, 'dist')),
    ]
    for (const real of candidates) {
      if (!real || !isExternal(real)) continue
      const name = relative(nodeModules, pkgDir)
      // `real` may point at a build output (…/pkg/dist); report the linked
      // package's own root so the message names something a reader can act on.
      let owner = real
      while (
        !existsSync(join(owner, 'package.json')) &&
        dirname(owner) !== owner
      ) {
        owner = dirname(owner)
      }
      if (!found.has(name)) found.set(name, owner)
      break
    }
  }
  return found
}

/**
 * A linked dependency resolves its own imports from its own checkout, so it can
 * hand the project types built against a different version of a shared package.
 * The symptom is a typecheck that OOMs rather than one that fails, so nothing
 * else in this validator would catch it.
 *
 * Runs against the workspace root only. The mismatch is a property of the
 * install, not of any one package in it, so running per workspace package would
 * report the same pair once per package.
 */
export async function runTypeIdentityChecks(
  root: string
): Promise<ValidateFinding[]> {
  const findings: ValidateFinding[] = []
  const external = await externalDependencyRoots(root)
  if (external.size === 0) return findings

  for (const pkg of TYPE_IDENTITY_PKGS) {
    const local = await projectResolvedVersion(root, pkg)
    if (!local) continue
    const ours = local.version
    for (const [depName, depRoot] of external) {
      const theirs = await versionResolvedFrom(depRoot, pkg)
      if (!theirs || theirs === ours) continue
      findings.push({
        id: `split-type-identity-${depName.replace(/[@/]/g, '-')}-${pkg.replace(/[@/]/g, '-')}`,
        severity: 'error',
        message: `"${depName}" is linked to ${depRoot} and resolves ${pkg}@${theirs} there, while this project resolves ${pkg}@${ours} — two type identities for ${pkg}`,
        path: join(root, 'node_modules', depName),
        fixHint: [
          `TypeScript treats the two ${pkg} declarations as unrelated types and structurally compares them wherever they meet, which can make a typecheck OOM instead of fail.`,
          `Align the versions so both trees resolve one ${pkg}: either bump ${pkg} to ${theirs} here, or to ${ours} in ${depRoot}.`,
          `If the link is no longer needed, remove it and reinstall so "${depName}" comes from the registry.`,
        ].join('\n'),
      })
    }
  }
  return findings
}

/**
 * Preflight for codegen. Runs BEFORE the typecheck, because the failure it
 * explains kills the process rather than failing it: a V8 heap OOM aborts, so
 * nothing printed after the fact is ever seen. By the time the user has a
 * symptom, the only thing that can help them is already on screen above it.
 *
 * Warns rather than throws. A skewed linked dependency is a strong signal, not
 * a certainty — plenty of them are harmless, and refusing to build on one would
 * break working setups over a heuristic.
 */
export async function warnOnSplitTypeIdentity(
  rootDir: string,
  logger: { warn: (message: string) => void }
): Promise<void> {
  if (process.env?.PIKKU_SKIP_TYPE_IDENTITY_CHECK) return
  const findings = await runTypeIdentityChecks(rootDir).catch(() => [])
  if (findings.length === 0) return

  logger.warn(
    `[${ErrorCode.SPLIT_TYPE_IDENTITY}] ${findings.length === 1 ? 'A linked dependency resolves a shared package' : 'Linked dependencies resolve shared packages'} at a different version than this project:\n` +
      findings.map((f) => `  ${f.message}`).join('\n') +
      `\nTypeScript treats each pair as two unrelated types and structurally compares them\n` +
      `wherever they meet, which inside a generic inference chain can exhaust the heap —\n` +
      `codegen then dies of memory pressure instead of reporting an error.\n\n` +
      `Fix: align the versions so both trees resolve one copy, or drop the link and\n` +
      `reinstall. Set PIKKU_SKIP_TYPE_IDENTITY_CHECK=1 to silence this.`
  )
}
