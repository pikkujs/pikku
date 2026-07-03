import { join, dirname } from 'node:path'
import { pikkuSessionlessFunc } from '#pikku'
import { NotFoundError } from '@pikku/core'
import type { FunctionCoverageReport } from './get-function-coverage.function.js'
import { resolveFunctionsDir } from '../lib/function-tests-paths.js'
import { nodeFs, nodeChildProcess } from '../lib/node-builtins.js'

function findBin(name: string, searchFrom: string): string {
  let dir = searchFrom
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'node_modules', '.bin', name)
    if (nodeFs().existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return name
}

export const runFunctionTests = pikkuSessionlessFunc<
  null,
  FunctionCoverageReport | null
>({
  title: 'Run Function Tests',
  description:
    'Runs the function-tests suite under c8 and returns the updated coverage report.',
  expose: true,
  auth: false,
  func: async ({ metaService }) => {
    if (!metaService?.basePath) {
      throw new Error('Meta service is not configured. Ensure the console addon is set up with a MetaService.')
    }

    const { existsSync, readFileSync } = nodeFs()
    const { spawn } = nodeChildProcess()
    const functionsDir = resolveFunctionsDir(metaService.basePath)
    const ftestDir = join(functionsDir, 'tests')
    if (!existsSync(ftestDir)) {
      throw new NotFoundError(
        'No tests found. Add a tests directory to your project first — see the test-harness template for an example.'
      )
    }

    const pikku = findBin('pikku', functionsDir)

    const spawnEnv = { ...process.env }
    const envFile = join(ftestDir, '.env.test')
    if (existsSync(envFile)) {
      for (const line of readFileSync(envFile, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq < 0) continue
        spawnEnv[trimmed.slice(0, eq).trim()] = trimmed
          .slice(eq + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '')
      }
    }

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(process.execPath, [pikku, 'tests', 'coverage'], {
        cwd: functionsDir,
        env: spawnEnv,
        stdio: 'ignore',
      })
      proc.on('close', (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`tests failed (exit ${code})`))
      )
      proc.on('error', reject)
    })

    const outFile = join(ftestDir, '.coverage', 'function-coverage.json')
    if (!existsSync(outFile)) return null
    return JSON.parse(readFileSync(outFile, 'utf-8')) as FunctionCoverageReport
  },
})
