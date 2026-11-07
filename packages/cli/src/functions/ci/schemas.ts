import { z } from 'zod'

/**
 * Beside the commands rather than inside them, for the reason
 * `app-new.schemas.ts` gives.
 */

export const CiInput = z.object({
  provider: z.string().optional(),
  deploy: z.boolean().optional(),
  skipTests: z.boolean().optional(),
  keepWorktree: z.boolean().optional(),
  worktreeDir: z.string().optional(),
  auditBaseline: z.string().optional(),
  migrationsApplied: z.boolean().optional(),
  secretsSet: z.boolean().optional(),
  skipDeployChecks: z.boolean().optional(),
})
export type CiInput = z.infer<typeof CiInput>

export const CiRun = z.object({
  dir: z.string(),
  /** Set when `dir` is a throwaway worktree: nothing there has been installed. */
  inWorktree: z.boolean(),
  provider: z.string().optional(),
  deploy: z.boolean(),
  runTests: z.boolean(),
  hasDb: z.boolean(),
  hasEmails: z.boolean(),
  hasConsole: z.boolean(),
  auditBaseline: z.string().optional(),
  migrationsApplied: z.boolean(),
  secretsSet: z.boolean(),
  skipDeployChecks: z.boolean(),
  /** Holds the result files. Outside `dir`, so it survives a removed worktree. */
  stateDir: z.string(),
  /** Project paths as `dir` sees them. */
  configFile: z.string(),
  outDir: z.string(),
  scaffoldDir: z.string(),
  srcDirectories: z.array(z.string()),
})
export type CiRun = z.infer<typeof CiRun>

export const CiStage = z.enum([
  'install',
  'bootstrap',
  'dbMigrate',
  'dbCodegen',
  'emails',
  'all',
  'validate',
  'audit',
  'test',
  'appBuild',
  'appBuildServed',
  'appBuildRest',
  'plan',
  'apply',
])
export type CiStage = z.infer<typeof CiStage>

export const CiStepInput = z.object({
  /** Run side by side. Every one finishes before the step reports a failure. */
  stages: z.array(CiStage),
  run: CiRun,
})
export type CiStepInput = z.infer<typeof CiStepInput>

export const CiRunInput = z.object({ run: CiRun })
export type CiRunInput = z.infer<typeof CiRunInput>
