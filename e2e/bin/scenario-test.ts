import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

import {
  applyTestEnvDefaults,
  startBackend,
  waitForSeededBackend,
} from './backend-harness.js'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface PikkuScenarioConfig {
  scenarios?: {
    environments?: Record<string, { apiUrl?: string }>
  }
}

/**
 * The runner resolves its own apiUrl from `scenarios.environments`; the harness
 * has to spawn the backend on that same address, so it reads it from the same
 * place rather than keeping a second copy of the port.
 */
const apiUrlFor = (environment: string): string => {
  if (process.env.API_URL) {
    return process.env.API_URL
  }
  const config: PikkuScenarioConfig = JSON.parse(
    readFileSync(resolve(projectDir, 'pikku.config.json'), 'utf-8')
  )
  const environments = config.scenarios?.environments ?? {}
  const apiUrl = environments[environment]?.apiUrl
  if (!apiUrl) {
    throw new Error(
      `Unknown scenario environment '${environment}' — pikku.config.json declares ${Object.keys(environments).join(', ') || 'none'}.`
    )
  }
  return apiUrl
}

const argv = process.argv.slice(2)
const separator = argv.indexOf('--')
const own = separator === -1 ? argv : argv.slice(0, separator)
const explicit = separator === -1 ? [] : argv.slice(separator + 1)

const noSpawn = own.includes('--no-spawn')
const keepAlive = own.includes('--keep-alive')
const rest = own.filter((arg) => arg !== '--no-spawn' && arg !== '--keep-alive')

const environmentIndex = rest.findIndex((arg) => !arg.startsWith('-'))
const environment = environmentIndex === -1 ? 'local' : rest[environmentIndex]!
const forwarded = [
  ...rest.filter((_, index) => index !== environmentIndex),
  ...explicit,
]

const apiUrl = apiUrlFor(environment)

const runScenarios = (): Promise<number> =>
  new Promise((done) => {
    const runner = spawn(
      'npx',
      ['pikku', 'scenario', 'run', environment, ...forwarded],
      {
        cwd: projectDir,
        env: { ...process.env, API_URL: apiUrl },
        stdio: 'inherit',
      }
    )
    runner.on('close', (code, signal) => done(signal ? 1 : (code ?? 1)))
    runner.on('error', () => done(1))
  })

const main = async () => {
  applyTestEnvDefaults()

  if (noSpawn) {
    console.log(`[scenario-test] using the backend already on ${apiUrl}`)
    await waitForSeededBackend(apiUrl)
    return runScenarios()
  }

  console.log(`[scenario-test] starting the backend on ${apiUrl}`)
  const backend = await startBackend({ apiUrl })
  const stopOnSignal = () => {
    backend.stop()
    process.exit(1)
  }
  process.on('SIGINT', stopOnSignal)
  process.on('SIGTERM', stopOnSignal)

  try {
    await waitForSeededBackend(apiUrl, { hasExited: backend.hasExited })
    console.log(`[scenario-test] backend seeded, running scenarios`)
    return await runScenarios()
  } finally {
    if (keepAlive) {
      console.log(
        `[scenario-test] --keep-alive: backend still running on ${apiUrl}, Ctrl-C to stop`
      )
    } else {
      backend.stop()
    }
  }
}

main().then(
  (code) => {
    if (!keepAlive) {
      process.exit(code)
    }
  },
  (error) => {
    console.error(`[scenario-test] ${error.message}`)
    process.exit(1)
  }
)
