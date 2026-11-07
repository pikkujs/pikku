import { join } from 'node:path'
import type { CiRun, CiStage } from './schemas.js'

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
        args: ['db', 'migrate', '--localOnly'],
        dropDatabaseUrl: true,
      }
    case 'dbCodegen':
      return { args: ['db', 'codegen'], dropDatabaseUrl: true }
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
