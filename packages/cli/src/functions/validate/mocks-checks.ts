import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  hasBuiltOutput,
  PROBLEM_REASON,
  runMocksCheck,
} from '../mocks/run-check.js'
import { frontendRoots, scanFrontend } from '../mocks/stub-scan.js'
import type { ValidateFinding as Finding } from './persona-checks.js'

const outDirOf = (dir: string): string => {
  try {
    const config = JSON.parse(
      readFileSync(join(dir, 'pikku.config.json'), 'utf8')
    ) as { outDir?: unknown }
    return typeof config.outDir === 'string' ? config.outDir : '.pikku'
  } catch {
    return '.pikku'
  }
}

/** Only a project that uses mocks or stub hooks has anything for this check to say. */
export const usesMocks = (dir: string): boolean => {
  if (existsSync(join(dir, '.mocks'))) return true
  const roots = frontendRoots(dir)
  return roots.length > 0 && scanFrontend(dir, roots).stubCalls.length > 0
}

export const runMocksChecks = async (dir: string): Promise<Finding[]> => {
  const outDir = outDirOf(dir)
  if (!hasBuiltOutput(dir, outDir)) {
    return [
      {
        id: 'mocks-not-built',
        severity: 'warn',
        message:
          'Mocks and stub hooks were not checked: the project has not been built',
        path: join(dir, outDir),
        fixHint: 'Run `pikku all`, then validate again.',
      },
    ]
  }
  const check = await runMocksCheck({ rootDir: dir, outDir })
  const findings: Finding[] = []
  for (const call of check.calls) {
    if (!call.problem) continue
    findings.push({
      id: `mocks-${call.problem}`,
      severity: 'error',
      message: `${call.file}:${call.line}  ${call.hook}(${call.rpc ? `'${call.rpc}'` : '…'}): ${PROBLEM_REASON[call.problem](call.flag)}`,
      path: join(dir, call.file),
      fixHint:
        call.problem === 'backend-supports'
          ? `Use ${call.hook.replace(/Stub$/, '')}; the function already returns what the mock does.`
          : call.problem === 'no-flag' || call.problem === 'flag-not-literal'
            ? `Pass { featureFlag: '<flag>' } with a flag declared in the project, or implement the function and use ${call.hook.replace(/Stub$/, '')}.`
            : call.problem === 'undeclared-flag'
              ? 'Declare the flag in the project, or use one that is declared.'
              : 'Run `pikku mocks diff` to see what is wrong with the mock.',
    })
  }
  for (const call of check.missing) {
    findings.push({
      id: 'mocks-no-function',
      severity: 'error',
      message: `${call.file}:${call.line}  ${call.hook}('${call.rpc}'): no function with that name`,
      path: join(dir, call.file),
      fixHint:
        'Implement the function, or use usePikkuQueryStub / usePikkuMutationStub with a featureFlag and a mock in .mocks/.',
    })
  }
  for (const rpc of check.dead) {
    findings.push({
      id: 'mocks-dead',
      severity: 'warn',
      message: `${rpc}: its mock has no function and nothing calls it`,
      path: join(dir, '.mocks', rpc.replaceAll(':', '.')),
      fixHint: `Delete .mocks/${rpc.replaceAll(':', '.')}.`,
    })
  }
  for (const rpc of check.unused) {
    findings.push({
      id: 'mocks-unused',
      severity: 'warn',
      message: `${rpc}: its mock is not called by anything in the frontend`,
      path: join(dir, '.mocks', rpc.replaceAll(':', '.')),
      fixHint: `Delete .mocks/${rpc.replaceAll(':', '.')} if it is no longer needed.`,
    })
  }
  for (const flag of check.orphanFlags) {
    findings.push({
      id: 'mocks-orphan-flag',
      severity: 'info',
      message: `The flag "${flag}" is declared but no stub hook uses it`,
      path: join(dir, 'pikku.config.json'),
      fixHint: 'Other code may still use it. Remove it if nothing does.',
    })
  }
  return findings
}
