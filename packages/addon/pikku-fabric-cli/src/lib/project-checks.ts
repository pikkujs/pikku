import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { readTextSafe } from '@pikku/cli/addon-support'
import { resolveApiContext } from './config.js'
import { getFabricRPC } from './http.js'

type Finding = {
  id: string
  severity: 'error' | 'warn' | 'info'
  message: string
  path: string
  fixHint: string
}

/** One stage's record of what it has applied, as the control plane holds it. */
export interface StageLedger {
  stageId: string
  branch: string
  migrations: Array<{ name: string; hash: string | null; appliedAt: string }>
}

/** Same digest the stage migrator records: sha256 of the file's bytes as UTF-8. */
export function hashMigration(sql: string): string {
  return createHash('sha256').update(sql, 'utf-8').digest('hex')
}

const slug = (s: string): string => s.replace(/[^a-z0-9]/gi, '-')

/**
 * Compares what each stage applied against the files in the repo now. Split
 * out from the RPC call so the comparison is testable without a session.
 *
 * A row whose `hash` is null was applied before the stage migrator recorded
 * hashes; the file it named is unrecoverable, so it is reported as unverified
 * rather than as clean.
 */
export function migrationDriftFindings(
  migrationsDir: string,
  local: Map<string, string>,
  stages: StageLedger[]
): Finding[] {
  const findings: Finding[] = []
  let unverifiable = 0

  for (const stage of stages) {
    for (const applied of stage.migrations) {
      const localHash = local.get(applied.name)
      if (localHash === undefined) {
        findings.push({
          id: `migration-applied-file-missing-${slug(stage.branch)}-${slug(applied.name)}`,
          severity: 'error',
          message: `${applied.name} was applied to the "${stage.branch}" stage but no longer exists locally`,
          path: join(migrationsDir, applied.name),
          fixHint:
            'Restore the file under its original name. Deleting or renaming an applied migration does not undo it — the stage keeps the schema that file produced, and a fresh database will never reach that shape.',
        })
        continue
      }
      if (applied.hash === null) {
        unverifiable++
        continue
      }
      if (applied.hash !== localHash) {
        findings.push({
          id: `migration-drift-${slug(stage.branch)}-${slug(applied.name)}`,
          severity: 'error',
          message: `${applied.name} differs from the copy applied to the "${stage.branch}" stage (applied ${applied.hash.slice(0, 12)}, local ${localHash.slice(0, 12)})`,
          path: join(migrationsDir, applied.name),
          fixHint: [
            'Revert the file to what was applied and put the change in a NEW',
            'numbered migration. A migration is recorded by filename and never',
            're-runs, so this edit will never reach that stage — the next',
            'migration that depends on it fails there instead.',
          ].join('\n'),
        })
      }
    }
  }

  if (unverifiable > 0) {
    findings.push({
      id: 'migration-drift-partially-unverifiable',
      severity: 'info',
      message: `${unverifiable} applied migration${unverifiable === 1 ? '' : 's'} predate hash recording and cannot be compared`,
      path: migrationsDir,
      fixHint:
        'Nothing to do — rows written before the stage migrator recorded hashes carry none. Each deploy records hashes for what it applies.',
    })
  }

  return findings
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PRODUCTION_BRANCH = 'main'

/**
 * Silent when the project is unlinked or logged out — both already have their
 * own findings — and degrades to an info when the API cannot be reached, so an
 * offline developer still gets the rest of validate.
 *
 * A deploy passes its `deployTarget`: then only that stage and production are
 * compared, and a ledger that cannot be read is an error, not an info.
 */
export async function checkMigrationDrift(
  root: string,
  migrationsDir: string,
  deployTarget?: string
): Promise<Finding[]> {
  if (!existsSync(migrationsDir)) return []
  const unchecked = (reason: string): Finding[] => [
    {
      id: 'migration-drift-unchecked',
      severity: deployTarget ? 'error' : 'info',
      message: deployTarget
        ? `could not read the deployed migration ledger (${reason}) — refusing to deploy "${deployTarget}" unchecked`
        : `could not read the deployed migration ledger (${reason}) — local migrations were not compared against any stage`,
      path: migrationsDir,
      fixHint: deployTarget
        ? 'Run `pikku fabric login` if the session expired, and retry once fabric-api is reachable.'
        : 'Run `pikku fabric login` if the session expired. Offline this check is skipped; `pikku fabric deploy apply` will not skip it.',
    },
  ]
  const ctx = await resolveApiContext({ startDir: root }).catch(() => null)
  if (!ctx?.token || !ctx.projectId) {
    return deployTarget ? unchecked('not logged in or not linked') : []
  }
  if (!deployTarget && !UUID.test(ctx.projectId)) return []

  let stages: StageLedger[]
  try {
    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const res = await rpc.invoke('listStageMigrationLedger', {
      projectId: ctx.projectId,
    })
    stages = deployTarget
      ? res.stages.filter(
          (s) => s.branch === deployTarget || s.branch === PRODUCTION_BRANCH
        )
      : res.stages
  } catch (err) {
    return unchecked(err instanceof Error ? err.message : String(err))
  }

  const local = new Map<string, string>()
  for (const file of (await readdir(migrationsDir)).filter((f) =>
    f.endsWith('.sql')
  )) {
    const sql = await readTextSafe(join(migrationsDir, file))
    if (sql !== null) local.set(file, hashMigration(sql))
  }

  return migrationDriftFindings(migrationsDir, local, stages)
}

export async function linkFindings(root: string): Promise<Finding[]> {
  const link = await resolveApiContext({ startDir: root }).then(
    (ctx) => ({ ctx, error: null }),
    (error: unknown) => ({
      ctx: null,
      error: error instanceof Error ? error.message : String(error),
    })
  )
  if (link.error) {
    return [
      {
        id: 'fabric-project-unresolved',
        severity: 'info',
        message: `could not tell which fabric project this repo is — ${link.error.split('\n')[0]}`,
        path: root,
        fixHint: link.error,
      },
    ]
  }
  if (link.ctx?.token && !link.ctx.project) {
    return [
      {
        id: 'fabric-project-not-linked',
        severity: 'info',
        message:
          'no fabric project has this repo as its git remote — project has not been linked to fabric yet',
        path: root,
        fixHint: [
          'Run `pikku fabric link` to create the project from this repo.',
          'If the project already exists under a different remote, set FABRIC_PROJECT_ID=<projectId> (see `pikku fabric projects`).',
        ].join('\n'),
      },
    ]
  }
  return []
}

export async function projectChecks(request: {
  root: string
  migrationsDir?: string
  deployTarget?: string
}): Promise<Finding[]> {
  const findings = await linkFindings(request.root)
  if (request.migrationsDir) {
    findings.push(
      ...(await checkMigrationDrift(
        request.root,
        request.migrationsDir,
        request.deployTarget
      ))
    )
  }
  return findings
}
