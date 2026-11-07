import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku/function'
import { CiInput, CiRunInput, CiStepInput, type CiRun } from '../ci/schemas.js'
import {
  PikkuCiFailedError,
  assertConsoleRemoved,
  removeConsoleScaffold,
} from '../ci/console-removal.js'
import { assertCloudflareDeployReady } from '../ci/deploy-guard.js'
import { ciEnv, ciStageCommand, planResultFile } from '../ci/stages.js'
import {
  assertWorktreeReady,
  createWorktree,
  removeWorktree,
  type CiWorktree,
} from '../ci/worktree.js'
import { findConfigFileOrNull } from '../../utils/pikku-cli-config.js'
import { runLabelled } from '../../utils/run-labelled.js'
import { currentCliInvocation } from '../../utils/cli-invocation.js'

const readJson = (file: string) => {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return undefined
  }
}

const planSucceeded = (run: CiRun) =>
  readJson(planResultFile(run))?.success === true

export const pikkuCiStep = pikkuSessionlessFunc({
  description: 'Run stages of pikku ci side by side.',
  input: CiStepInput,
  func: async ({ logger }, { stages, run }) => {
    const failures = await Promise.all(
      stages.map(async (stage): Promise<string | undefined> => {
        const step = ciStageCommand(stage, run)
        const self = currentCliInvocation()
        const result = await runLabelled(
          { logger, label: stage },
          step.command ?? self.command,
          step.command ? step.args : [...self.args, ...step.args],
          { cwd: run.dir, env: ciEnv(step) }
        )
        if (!result.ok) return `${stage}: ${result.failure}`
        if (stage === 'plan' && !planSucceeded(run)) {
          return 'plan: no successful plan result'
        }
      })
    )
    const failed = failures.filter((failure) => failure !== undefined)
    if (failed.length) {
      throw new PikkuCiFailedError(`pikku ci failed at ${failed.join(', ')}`)
    }
  },
})

export const pikkuCiRemoveConsole = pikkuSessionlessFunc({
  description: 'Take the console scaffold out of the throwaway worktree.',
  input: CiRunInput,
  func: async (_services, { run }) => removeConsoleScaffold(run),
})

export const pikkuCiCheckConsole = pikkuSessionlessFunc({
  description: 'Fail if console wiring survived its removal.',
  input: CiRunInput,
  func: async (_services, { run }) => assertConsoleRemoved(run),
})

export const pikkuCiCheckDeploy = pikkuSessionlessFunc({
  description: 'Refuse a deploy the provider cannot finish by itself.',
  input: CiRunInput,
  func: async (_services, { run }) => {
    if (run.provider !== 'cloudflare') return
    assertCloudflareDeployReady(readJson(planResultFile(run))?.providerDir, {
      migrationsApplied: run.migrationsApplied,
      secretsSet: run.secretsSet,
    })
  },
})

/**
 * The plan is copied even if a later apply failed, since it is what was built.
 * The audit only on a pass: it becomes the next run's baseline.
 */
const copyOutputs = (run: CiRun, rootDir: string, passed: boolean) => {
  const deployDir = join(rootDir, '.deploy')
  const planned = planSucceeded(run)
  if (planned) {
    mkdirSync(deployDir, { recursive: true })
    const built = join(run.dir, '.deploy')
    for (const entry of readdirSync(built)) {
      rmSync(join(deployDir, entry), { recursive: true, force: true })
      cpSync(join(built, entry), join(deployDir, entry), { recursive: true })
    }
  }
  const audit = join(run.outDir, 'audit.json')
  if (passed && planned && existsSync(audit)) {
    cpSync(audit, join(deployDir, 'audit.json'))
  }
}

const DB_DIRS = ['sqlite', 'postgres', 'mysql']

export const pikkuCi = pikkuSessionlessFunc({
  description: 'Run the whole path from a commit to a deployable build.',
  input: CiInput,
  func: async ({ logger, config, workflowService }, data, { rpc }) => {
    const { rootDir, outDir } = config
    if (data.deploy && !data.provider) {
      throw new PikkuCiFailedError(
        '--deploy needs -p <provider>: pikku ci never picks a deploy target for you.'
      )
    }

    const scripts = readJson(join(rootDir, 'package.json'))?.scripts
    if (!data.skipTests && !scripts?.test) {
      throw new PikkuCiFailedError(
        'This project has no "test" script in package.json. Add one, or pass --skipTests.'
      )
    }

    const configFile = config.config
      ? resolve(config.config)
      : await findConfigFileOrNull()
    if (!configFile) {
      throw new PikkuCiFailedError('pikku ci could not find pikku.config.json.')
    }

    const stateDir = mkdtempSync(join(tmpdir(), 'pikku-ci-state-'))
    let worktree: CiWorktree | undefined
    const removeState = () => rmSync(stateDir, { recursive: true, force: true })

    const defaultBaseline = join(rootDir, '.deploy', 'audit.json')
    const auditBaseline = data.auditBaseline
      ? resolve(rootDir, data.auditBaseline)
      : existsSync(defaultBaseline)
        ? defaultBaseline
        : undefined

    const cleanUp = async () => {
      removeState()
      if (!worktree) return
      if (data.keepWorktree) {
        logger.info(`Kept the worktree at ${worktree.path}`)
        return
      }
      await removeWorktree(rootDir, worktree.path)
    }

    const interrupted = () => {
      void cleanUp().finally(() => process.exit(1))
    }
    process.once('SIGINT', interrupted)
    process.once('SIGTERM', interrupted)

    let run: CiRun | undefined
    let passed = false
    try {
      if (data.provider) {
        await assertWorktreeReady(rootDir)
        worktree = await createWorktree(rootDir, data.worktreeDir)
      }
      const dir = worktree?.project ?? rootDir
      const moved = (path: string) => join(dir, relative(rootDir, path))
      const runConfigFile = moved(configFile)
      if (!existsSync(runConfigFile)) {
        throw new PikkuCiFailedError(
          `${configFile} is not committed in this repository, so the worktree has no copy of it.`
        )
      }

      run = {
        dir,
        inWorktree: !!worktree,
        provider: data.provider,
        deploy: !!data.deploy,
        runTests: !data.skipTests,
        hasDb: DB_DIRS.some((engine) =>
          existsSync(join(rootDir, 'db', engine))
        ),
        hasEmails:
          !!config.emailTemplatesDir && existsSync(config.emailTemplatesDir),
        hasConsole: !!config.scaffold?.console,
        auditBaseline,
        migrationsApplied: !!data.migrationsApplied,
        secretsSet: !!data.secretsSet,
        skipDeployChecks: !!data.skipDeployChecks,
        stateDir,
        configFile: runConfigFile,
        outDir: moved(outDir),
        scaffoldDir: moved(
          config.resolvedScaffoldDir ?? join(rootDir, 'scaffold')
        ),
        consoleFiles: [config.consoleFunctionsFile, config.consoleSchemasFile]
          .filter((file): file is string => !!file)
          .map(moved),
        srcDirectories: config.srcDirectories.map((src) =>
          moved(resolve(rootDir, src))
        ),
      }

      await workflowService.startWorkflow(
        'ciWorkflow',
        run,
        { type: 'internal' },
        rpc,
        {
          inline: true,
        }
      )
      passed = true
      logger.info('pikku ci passed')
    } finally {
      process.off('SIGINT', interrupted)
      process.off('SIGTERM', interrupted)
      try {
        if (run?.inWorktree) copyOutputs(run, rootDir, passed)
      } finally {
        await cleanUp()
      }
    }
  },
})
