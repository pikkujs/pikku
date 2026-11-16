import { isAbsolute, join, relative } from 'node:path'
import type { ResolvedDb } from '../db/local-db.js'
import type { CiRun, CiStage } from './schemas.js'

/**
 * Whether the database a run would migrate belongs to the worktree: a SQLite
 * file or embedded PGlite directory inside `dir`, which goes when the worktree
 * does. A Postgres or MySQL server is not, however local its address, because
 * the worktree uses whatever URL its committed config names, which may be the
 * developer's own server; and a file outside `dir` is shared too.
 */
export const worktreeOwnsDatabase = (
  resolved: ResolvedDb | null,
  dir: string
): boolean => {
  const inside = (path: string) => {
    const rel = relative(dir, path)
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  }
  if (!resolved) return false
  if (resolved.dialect === 'sqlite') return inside(resolved.dbFile)
  if (resolved.dialect === 'postgres') {
    return (
      resolved.mode === 'pglite' &&
      !!resolved.pgliteDir &&
      inside(resolved.pgliteDir)
    )
  }
  return false
}

/** The threshold the audit stage gates on. */
export const CI_AUDIT_THRESHOLD = 'high'

export const planResultFile = (run: CiRun) => join(run.stateDir, 'plan.json')
export const applyResultFile = (run: CiRun) => join(run.stateDir, 'apply.json')

export type CiCommand = {
  /** Unset means this same CLI, so a child never runs another pikku version. */
  command?: string
  args: string[]
  /** For the stages that open a database, which must only ever be a local one. */
  dropDatabaseUrl?: boolean
}

const stageCommand = (stage: CiStage, run: CiRun): CiCommand => {
  const provider = run.provider ? ['-p', run.provider] : []
  switch (stage) {
    case 'install':
      return { command: 'bun', args: ['install', '--frozen-lockfile'] }
    case 'bootstrap':
      return { args: ['bootstrap'] }
    case 'dbMigrate':
      return {
        // `--localOnly` only means loopback. A destructive migration is allowed
        // only when the run has established that the database is disposable
        // (the worktree's own file, or an explicit --allowDestructive); a
        // worktree on its own proves nothing, since it uses whatever local
        // URL the committed config names.
        args: [
          'db',
          'migrate',
          '--localOnly',
          ...(run.allowDestructive ? ['--allowDestructive'] : []),
        ],
        dropDatabaseUrl: true,
      }
    case 'emails':
      return { args: ['emails', 'generate'] }
    case 'all':
      return { args: ['all', '--failOnError'] }
    case 'validate':
      return {
        args: [
          'validate',
          ...(run.skipDeployChecks ? ['--skipDeployChecks'] : []),
        ],
      }
    case 'audit':
      return {
        args: [
          'audit',
          '--failOn',
          CI_AUDIT_THRESHOLD,
          ...(run.auditBaseline ? ['--baseline', run.auditBaseline] : []),
        ],
      }
    case 'test':
      return { command: 'bun', args: ['run', 'test'] }
    case 'appBuild':
      return { args: ['app', 'build'] }
    case 'appBuildServed':
      return { args: ['app', 'build', '--onlyServed'] }
    case 'appBuildRest':
      return { args: ['app', 'build', '--skipServed'] }
    case 'plan':
      return {
        args: [
          'deploy',
          'plan',
          ...provider,
          '--resultFile',
          planResultFile(run),
        ],
      }
    case 'apply':
      return {
        args: [
          'deploy',
          'apply',
          ...provider,
          '--fromPlan',
          '--resultFile',
          applyResultFile(run),
        ],
      }
  }
}

/** Every child pikku reads the same config as the run, not one it finds itself. */
export const ciStageCommand = (stage: CiStage, run: CiRun): CiCommand => {
  const step = stageCommand(stage, run)
  return step.command
    ? step
    : { ...step, args: [...step.args, `--config=${run.configFile}`] }
}

export const ciEnv = ({ dropDatabaseUrl }: CiCommand): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, CI: '1' }
  if (dropDatabaseUrl) delete env.DATABASE_URL
  return env
}
