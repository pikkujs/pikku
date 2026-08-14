import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import {
  isAddonPackage,
  runAddonPackageChecks,
} from './addon-package-checks.js'
import { runSharedProjectChecks } from './shared-checks.js'
import { runTypeIdentityChecks } from './type-identity-checks.js'
import { runWorkspaceExportsChecks } from './workspace-exports-checks.js'
import type { ValidateFinding as Finding } from './persona-checks.js'

export type ValidateTarget = {
  /** Absolute directory the check runs against. */
  dir: string
  /** How the target is named in output — repo-relative, or "." for the root. */
  label: string
}

/**
 * A check plus the condition under which it means anything.
 *
 * `pikku validate` runs every check whose precondition holds, wherever it
 * holds. It deliberately does not detect a project *kind* and then dispatch:
 * the repos that motivated this are several kinds at once — the addons
 * monorepo is a workspace containing 217 publishable addons — and any
 * single-kind guess is wrong for them. Preconditions compose where a mode
 * would have had to pick.
 */
export type ValidateCheck = {
  id: string
  /** What this check is for, shown when reporting what ran. */
  subject: string
  applies: (target: ValidateTarget) => Promise<boolean>
  run: (target: ValidateTarget) => Promise<Finding[]>
}

/** A hand-written `types/application-types.d.ts` beside package.json. */
const ADDON_MARKER = join('types', 'application-types.d.ts')

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.pikku',
  '.pikku-runtime',
  'coverage',
  '.next',
  '.yarn',
])

/**
 * Every directory under `root` that holds a package.json.
 *
 * Walking beats reading the `workspaces` globs: the field is an array in one
 * repo and `{ packages: [...] }` in the next, spells the same layout as
 * `packages/**` or as six explicit globs, and a package that is real but
 * unlisted is exactly the kind of thing worth validating. Over-collecting is
 * harmless here because the preconditions decide what actually runs.
 */
export async function discoverTargets(
  root: string,
  maxDepth = 5
): Promise<ValidateTarget[]> {
  const targets: ValidateTarget[] = []

  const visit = async (dir: string, depth: number): Promise<void> => {
    if (existsSync(join(dir, 'package.json'))) {
      targets.push({ dir, label: relative(root, dir) || '.' })
    }
    if (depth >= maxDepth) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
      await visit(join(dir, entry.name), depth + 1)
    }
  }

  await visit(root, 0)
  return targets
}

export const CHECKS: ValidateCheck[] = [
  {
    id: 'app-project',
    subject: 'app project',
    // An addon also carries a pikku.config.json, and running the app-shaped
    // checks against one reports every app convention it has no reason to
    // follow — starting with a packages/functions/ it will never have.
    applies: async ({ dir }) =>
      existsSync(join(dir, 'pikku.config.json')) &&
      !existsSync(join(dir, ADDON_MARKER)),
    run: async ({ dir }) => (await runSharedProjectChecks(dir)).findings,
  },
  {
    id: 'addon-package',
    subject: 'addon',
    applies: async ({ dir }) => isAddonPackage(dir),
    run: async ({ dir }) => runAddonPackageChecks(dir),
  },
  {
    id: 'type-identity',
    subject: 'linked dependencies',
    // Root of an installed tree only. A linked dependency is a property of the
    // install as a whole, so running this per workspace package reports the
    // same pair N times — and with nothing installed there is nothing to
    // compare.
    applies: async ({ dir, label }) =>
      label === '.' && existsSync(join(dir, 'node_modules')),
    run: async ({ dir }) => runTypeIdentityChecks(dir),
  },
  {
    id: 'workspace-exports',
    subject: 'workspace subpath imports',
    // Root only: the check pairs an import in one package with the exports map
    // of another, so it needs the whole tree in view. Per-package it would see
    // the consumer without the producer and report nothing.
    applies: async ({ label }) => label === '.',
    run: async ({ dir }) => runWorkspaceExportsChecks(dir),
  },
]

export type ValidationPlan = Array<{
  check: ValidateCheck
  target: ValidateTarget
}>

export async function planValidation(root: string): Promise<ValidationPlan> {
  const plan: ValidationPlan = []
  for (const target of await discoverTargets(root)) {
    for (const check of CHECKS) {
      if (await check.applies(target)) plan.push({ check, target })
    }
  }
  return plan
}

export type ValidateReport = {
  ok: boolean
  root: string
  /** What ran, so a clean result can say what it actually looked at. */
  ran: Array<{ checkId: string; subject: string; target: string }>
  findings: Finding[]
}

export async function runValidate(root: string): Promise<ValidateReport> {
  const plan = await planValidation(root)
  const findings: Finding[] = []
  const ran: ValidateReport['ran'] = []

  for (const { check, target } of plan) {
    findings.push(...(await check.run(target)))
    ran.push({
      checkId: check.id,
      subject: check.subject,
      target: target.label,
    })
  }

  return {
    ok: !findings.some((f) => f.severity === 'error'),
    root,
    ran,
    findings,
  }
}
