import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { pikkuFunc } from '#pikku/addon/function'
import { findBin } from '../lib/audit-exec.js'
import { findProjectRoot } from '../lib/find-project-root.js'

/**
 * Starts `pikku scenario run` as a detached child of the project and returns
 * the run id it records under, so `listScenarioRuns` / `getScenarioRun` can
 * follow it.
 *
 * A child process rather than in-process: a scenario run replaces the
 * process's singleton services with its own workflow engine, loads the
 * project's scenario code, and owns `process.exitCode` — none of which can
 * happen inside the running application.
 *
 * The run appears in the list once the CLI has selected its scenarios; a run
 * the CLI refuses outright (no scenario matched, an unknown environment) never
 * appears.
 */
export const runScenarios = pikkuFunc<
  { names?: string[]; environment?: string },
  { runId: string }
>({
  title: 'Run Scenarios',
  description:
    'Starts `pikku scenario run` for the named scenarios (all when omitted) against the local copy, and returns the run id to follow in the scenario run list.',
  expose: true,
  scopes: ['pikku:console:scenarios:run'],
  func: async ({ metaService, variables }, input) => {
    if (!metaService?.basePath) {
      throw new Error(
        'Meta service is not configured. Ensure the console addon is set up with a MetaService.'
      )
    }
    const projectRoot = findProjectRoot(metaService.basePath)
    const environment =
      input?.environment ??
      (await variables?.get<string>('PIKKU_ENV')) ??
      'local'
    const runId = randomUUID()
    const args = [
      findBin('pikku', projectRoot),
      'scenario',
      'run',
      environment,
      '--run-id',
      runId,
      ...(input?.names?.length ? ['--flows', input.names.join(',')] : []),
    ]
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      env: { ...process.env },
      detached: true,
      stdio: 'ignore',
    })
    child.on('error', () => {})
    child.unref()
    return { runId }
  },
})
