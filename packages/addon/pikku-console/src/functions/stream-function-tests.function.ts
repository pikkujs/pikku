import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { pikkuSessionlessFunc } from '#pikku'
import { NotFoundError } from '@pikku/core'
import type { FunctionCoverageReport } from './get-function-coverage.function.js'

function findBin(name: string, searchFrom: string): string {
  let dir = searchFrom
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'node_modules', '.bin', name)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return name
}

type CucumberStatus =
  | 'PASSED'
  | 'FAILED'
  | 'SKIPPED'
  | 'PENDING'
  | 'UNDEFINED'
  | 'AMBIGUOUS'

const STATUS_RANK: Record<CucumberStatus, number> = {
  PASSED: 0,
  SKIPPED: 1,
  PENDING: 2,
  UNDEFINED: 3,
  AMBIGUOUS: 4,
  FAILED: 5,
}

function worstStatus(a: CucumberStatus, b: CucumberStatus): CucumberStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

export type TestStreamEvent =
  | {
      type: 'run-start'
      scenarios: Array<{
        id: string
        name: string
        uri: string
        steps: string[]
      }>
    }
  | { type: 'scenario-start'; id: string; name: string; uri: string }
  | {
      type: 'step'
      scenarioId: string
      step: string
      status: CucumberStatus
      duration: number
      message?: string
    }
  | { type: 'scenario-done'; id: string; name: string; status: CucumberStatus }
  | { type: 'done'; coverage: FunctionCoverageReport | null }
  | { type: 'error'; message: string }

export const streamFunctionTests = pikkuSessionlessFunc<null, TestStreamEvent>({
  title: 'Stream Function Tests',
  description:
    'SSE stream of structured per-scenario test events and final coverage report.',
  expose: false,
  auth: false,
  func: async ({ metaService }, _, { channel }) => {
    if (!channel) return

    if (!metaService?.basePath) {
      channel.send({
        type: 'error',
        message: 'Meta service is not configured.',
      })
      channel.close()
      return
    }

    const functionsDir = join(metaService.basePath, '..')
    const ftestDir = join(functionsDir, 'tests')
    if (!existsSync(ftestDir)) {
      throw new NotFoundError(
        'No tests found. Add a tests directory to your project first — see the test-harness template for an example.'
      )
    }

    const pikku = findBin('pikku', functionsDir)
    const c8 = findBin('c8', ftestDir)
    const cucumber = findBin('cucumber-js', ftestDir)

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

    // State for correlating Cucumber message protocol envelopes
    const astStepKeywords = new Map<string, string>()
    const pickles = new Map<
      string,
      { name: string; uri: string; steps: Map<string, string> }
    >()
    const testCases = new Map<
      string,
      { pickleId: string; stepIds: Map<string, string> }
    >()
    const activeScenarios = new Map<
      string,
      { testCaseId: string; worstStatus: CucumberStatus }
    >()
    let runStartEmitted = false

    await new Promise<void>((resolve) => {
      const proc = spawn(
        process.execPath,
        [
          c8,
          '--src',
          'src',
          '--include',
          'src/**',
          '--report-dir',
          '.coverage',
          '--reporter',
          'json',
          cucumber,
          '--require-module',
          'tsx',
          '--require',
          'tests/tests/support/**/*.ts',
          'tests/tests/features/**/*.feature',
          '--format',
          'message',
        ],
        { cwd: functionsDir, env: spawnEnv, stdio: ['ignore', 'pipe', 'pipe'] }
      )

      let stdoutBuf = ''

      proc.stdout!.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString()
        let nl: number
        while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
          const line = stdoutBuf.slice(0, nl).trim()
          stdoutBuf = stdoutBuf.slice(nl + 1)
          if (!line) continue

          let envelope: Record<string, unknown>
          try {
            envelope = JSON.parse(line) as Record<string, unknown>
          } catch {
            continue
          }

          if ('gherkinDocument' in envelope) {
            const walk = (nodes: any[]) => {
              for (const node of nodes ?? []) {
                for (const step of node?.scenario?.steps ??
                  node?.background?.steps ??
                  []) {
                  if (step.id)
                    astStepKeywords.set(
                      step.id,
                      ((step.keyword as string) ?? '').trimEnd()
                    )
                }
                walk(node?.rule?.children ?? [])
              }
            }
            walk((envelope.gherkinDocument as any)?.feature?.children ?? [])
          } else if ('pickle' in envelope) {
            const p = envelope.pickle as any
            const steps = new Map<string, string>()
            for (const s of p.steps ?? []) {
              const keyword = s.astNodeIds?.[0]
                ? astStepKeywords.get(s.astNodeIds[0])
                : undefined
              steps.set(s.id, keyword ? `${keyword} ${s.text}` : s.text)
            }
            pickles.set(p.id, { name: p.name, uri: p.uri ?? '', steps })
          } else if ('testCase' in envelope) {
            const tc = envelope.testCase as any
            const stepIds = new Map<string, string>()
            for (const s of tc.testSteps ?? []) {
              if (s.pickleStepId) stepIds.set(s.id, s.pickleStepId)
            }
            testCases.set(tc.id, { pickleId: tc.pickleId, stepIds })
          } else if ('testCaseStarted' in envelope) {
            const tcs = envelope.testCaseStarted as any
            const tc = testCases.get(tcs.testCaseId)
            const pickle = tc ? pickles.get(tc.pickleId) : undefined
            if (!runStartEmitted) {
              runStartEmitted = true
              const allScenarios = Array.from(testCases.entries()).map(
                ([, c]) => {
                  const p = pickles.get(c.pickleId)
                  return {
                    id: c.pickleId,
                    name: p?.name ?? '',
                    uri: p?.uri ?? '',
                    steps: p ? Array.from(p.steps.values()) : [],
                  }
                }
              )
              channel.send({ type: 'run-start', scenarios: allScenarios })
            }
            if (pickle) {
              activeScenarios.set(tcs.id, {
                testCaseId: tcs.testCaseId,
                worstStatus: 'PASSED',
              })
              channel.send({
                type: 'scenario-start',
                id: tcs.id,
                name: pickle.name,
                uri: pickle.uri,
              })
            }
          } else if ('testStepFinished' in envelope) {
            const tsf = envelope.testStepFinished as any
            const active = activeScenarios.get(tsf.testCaseStartedId)
            if (active) {
              const tc = testCases.get(active.testCaseId)
              const pickle = tc ? pickles.get(tc.pickleId) : undefined
              const pickleStepId = tc?.stepIds.get(tsf.testStepId)
              const stepText =
                pickleStepId && pickle
                  ? pickle.steps.get(pickleStepId)
                  : undefined
              if (stepText) {
                const status =
                  (tsf.testStepResult?.status as CucumberStatus) ?? 'UNDEFINED'
                const durationNanos =
                  (tsf.testStepResult?.duration?.seconds ?? 0) * 1e9 +
                  (tsf.testStepResult?.duration?.nanos ?? 0)
                active.worstStatus = worstStatus(active.worstStatus, status)
                channel.send({
                  type: 'step',
                  scenarioId: tsf.testCaseStartedId,
                  step: stepText,
                  status,
                  duration: Math.round(durationNanos / 1e6),
                  message: tsf.testStepResult?.message,
                })
              }
            }
          } else if ('testCaseFinished' in envelope) {
            const tcf = envelope.testCaseFinished as any
            const active = activeScenarios.get(tcf.testCaseStartedId)
            if (active) {
              const tc = testCases.get(active.testCaseId)
              const pickle = tc ? pickles.get(tc.pickleId) : undefined
              if (pickle) {
                channel.send({
                  type: 'scenario-done',
                  id: tcf.testCaseStartedId,
                  name: pickle.name,
                  status: active.worstStatus,
                })
              }
              activeScenarios.delete(tcf.testCaseStartedId)
            }
          }
        }
      })

      proc.on('error', (err) => {
        channel.send({ type: 'error', message: err.message })
        channel.close()
        resolve()
      })

      proc.on('close', () => resolve())
    })

    // Run the coverage analysis on the data c8 already generated
    await new Promise<void>((resolve) => {
      const proc = spawn(
        process.execPath,
        [pikku, 'tests', 'coverage', '--no-run'],
        {
          cwd: functionsDir,
          env: spawnEnv,
          stdio: 'ignore',
        }
      )
      proc.on('close', () => resolve())
      proc.on('error', () => resolve())
    })

    const outFile = join(ftestDir, '.coverage', 'function-coverage.json')
    const coverage: FunctionCoverageReport | null = existsSync(outFile)
      ? (JSON.parse(readFileSync(outFile, 'utf-8')) as FunctionCoverageReport)
      : null

    channel.send({ type: 'done', coverage })
    channel.close()
  },
})
