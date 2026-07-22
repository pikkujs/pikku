import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { pikkuFunc } from '#pikku'
import type { SecurityAuditReport } from '@pikku/core'
import {
  readAuditReport,
  runPikkuAudit,
  spawnProcess,
} from '../lib/audit-exec.js'

const DEP_SECTIONS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const

// Bump `pkg` to `version` in package.json, preserving the existing range
// operator (^, ~, or exact). Returns false if it is not a direct dependency.
function bumpPackageJson(
  pkgPath: string,
  pkg: string,
  version: string
): boolean {
  const manifest = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  for (const section of DEP_SECTIONS) {
    const current = manifest[section]?.[pkg]
    if (typeof current === 'string') {
      // Only plain semver ranges (^, ~, or exact) can be safely rewritten to a
      // bare version. workspace:/file:/link:/git/url specifiers carry semantics
      // a version string would silently destroy — refuse rather than clobber.
      if (
        /^(workspace:|file:|link:|git\+|github:|https?:|npm:)/.test(current)
      ) {
        throw new Error(
          `${pkg} uses a non-semver specifier (${current}) — cannot bump it here.`
        )
      }
      const prefix = /^[\^~]/.test(current) ? current[0] : ''
      manifest[section][pkg] = `${prefix}${version}`
      writeFileSync(pkgPath, `${JSON.stringify(manifest, null, 2)}\n`)
      return true
    }
  }
  return false
}

// Accept only a concrete semver (optionally with a prerelease/build tag) so a
// caller can't inject an arbitrary install specifier (tag, url, `../evil`).
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z-.]+)?$/

export const updateDependency = pikkuFunc<
  { package: string; version: string },
  SecurityAuditReport | null
>({
  title: 'Update Dependency',
  description:
    'Bumps a dependency to the given version in package.json, runs `bun install`, re-runs `pikku audit`, and returns the refreshed report. The mechanical (free) remediation — it does NOT run the app or verify anything still works.',
  expose: true,
  func: async ({ metaService }, { package: pkg, version }) => {
    if (!SEMVER_RE.test(version)) {
      throw new Error(
        `Invalid version "${version}" — expected a concrete semver like 1.2.3.`
      )
    }
    if (!metaService?.basePath) {
      throw new Error(
        'Meta service is not configured. Ensure the console addon is set up with a MetaService.'
      )
    }
    const projectDir = dirname(metaService.basePath)
    const pkgPath = join(projectDir, 'package.json')
    if (!existsSync(pkgPath)) {
      throw new Error(`package.json not found at ${pkgPath}`)
    }
    if (!bumpPackageJson(pkgPath, pkg, version)) {
      throw new Error(
        `${pkg} is not a direct dependency in package.json — cannot update it here.`
      )
    }
    // Resolve the lockfile against the new package.json. A non-zero exit is a
    // real failure (surfaced to the caller); the app is never run or tested.
    await spawnProcess('bun', ['install'], projectDir, { failOnNonZero: true })
    // Refresh the audit so the finding clears in the UI.
    await runPikkuAudit(projectDir)
    return readAuditReport(metaService)
  },
})
