/**
 * Verifier: `pikku scenario mutate` never leaves a project worse than it found it.
 *
 * The command rewrites the user's own source once per mutant, so the promises
 * that matter are about the source, not the score:
 *
 * 1. A `--files` glob that matches nothing fails, instead of reporting an empty
 *    run as a pass. Fail-before: the command does not exist.
 * 2. Interrupted mid-run (SIGINT) while a mutant is spliced in, the original
 *    file is put back. Fail-before: a killed run leaves a mutant in the source.
 *
 * Case 2 runs against the e2e project and waits to see
 * the file actually change before interrupting, so it cannot pass by being early.
 */

import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { execCli } from '../exec-cli.js'

const REPO_ROOT = join(process.cwd(), '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const E2E_DIR = join(REPO_ROOT, 'e2e')
const TARGET = 'packages/functions/src/functions/workflow-steps.functions.ts'
const TARGET_PATH = join(E2E_DIR, TARGET)

let failures = 0
const record = (name: string, error?: string) => {
  if (error) failures++
  console.log(`${error ? '✗' : '✓'} ${name}${error ? `\n    ${error}` : ''}`)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 1. A glob that matches nothing is an error, not an empty pass.
{
  const name = 'a --files glob that matches nothing fails the run'
  let message = 'exited zero'
  try {
    execCli(
      `node ${PIKKU_BIN} scenario mutate local --files src/does-not-exist.ts --flows orderSupportScenario`,
      { cwd: E2E_DIR, timeout: 240_000 }
    )
  } catch (error) {
    message = (error as Error).message
  }
  record(
    name,
    /No mutants were generated/.test(message)
      ? undefined
      : `expected a non-zero exit saying no mutants were generated, got: ${message.slice(0, 400)}`
  )
}

// 2. SIGINT while a mutant is in the source.
{
  const name = 'interrupting a run puts the original source back'
  const original = readFileSync(TARGET_PATH, 'utf-8')
  const child = spawn(
    'node',
    [
      PIKKU_BIN,
      'scenario',
      'mutate',
      'local',
      '--files',
      TARGET,
      '--flows',
      'orderSupportScenario',
      '--max-mutants',
      '3',
    ],
    { cwd: E2E_DIR, stdio: 'ignore' }
  )
  try {
    let spliced = false
    const deadline = Date.now() + 240_000
    while (Date.now() < deadline) {
      if (readFileSync(TARGET_PATH, 'utf-8') !== original) {
        spliced = true
        break
      }
      await sleep(25)
    }
    if (!spliced) {
      record(
        name,
        'the run never put a mutant into the source (nothing to restore)'
      )
    } else {
      child.kill('SIGINT')
      await new Promise((resolve) => child.once('exit', resolve))
      const after = readFileSync(TARGET_PATH, 'utf-8')
      record(
        name,
        after === original
          ? undefined
          : 'the source still holds the mutant after SIGINT'
      )
    }
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL')
    // Never leave a verifier's own mutant behind, whatever the outcome.
    execCli(`git checkout -- ${TARGET}`, { cwd: E2E_DIR })
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
