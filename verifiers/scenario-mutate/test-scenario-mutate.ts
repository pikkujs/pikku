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
 * Case 2 waits to see
 * the file actually change before interrupting, so it cannot pass by being early.
 */

import { spawn } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { execCli } from '../exec-cli.js'

const PROJECT_DIR = process.cwd()
const REPO_ROOT = join(PROJECT_DIR, '..', '..')
const PIKKU_BIN = join(REPO_ROOT, 'packages', 'cli', 'dist', 'bin', 'pikku.js')
const TARGET = 'src/functions/arithmetic.functions.ts'
const TARGET_PATH = join(PROJECT_DIR, TARGET)

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
      `${process.execPath} ${PIKKU_BIN} scenario mutate local --files src/does-not-exist.ts --flows arithmeticScenario`,
      { cwd: PROJECT_DIR, timeout: 240_000 }
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

// 3. A scenario that does not run on clean code cannot judge mutants.
{
  const name = 'a scenario that cannot run on the unmutated code is refused'
  let message = 'exited zero'
  try {
    execCli(
      `${process.execPath} ${PIKKU_BIN} scenario mutate local --files ${TARGET} --flows noSuchScenario --max-mutants 1`,
      { cwd: PROJECT_DIR, timeout: 480_000 }
    )
  } catch (error) {
    message = (error as Error).message
  }
  record(
    name,
    /unmutated code/.test(message)
      ? undefined
      : `expected a refusal naming the unmutated code, got: ${message.slice(0, 400)}`
  )
}

// 2. SIGINT while a mutant is in the source.
{
  const name = 'interrupting a run puts the original source back'
  const original = readFileSync(TARGET_PATH, 'utf-8')
  const child = spawn(
    process.execPath,
    [
      PIKKU_BIN,
      'scenario',
      'mutate',
      'local',
      '--files',
      TARGET,
      '--flows',
      'arithmeticScenario',
      '--max-mutants',
      '3',
    ],
    { cwd: PROJECT_DIR, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  let childOutput = ''
  child.stdout?.on('data', (d: Buffer) => (childOutput += d))
  child.stderr?.on('data', (d: Buffer) => (childOutput += d))
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
        `the run never put a mutant into the source (nothing to restore):\n${childOutput
          .split('\n')
          .filter((l) => !l.startsWith('[server]'))
          .slice(-12)
          .join('\n')}`
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
    writeFileSync(TARGET_PATH, original)
  }
}

// 4. The whole chain: a caught mutant, a survivor, the gate, the source intact.
{
  const name =
    'kills the mutant the scenario asserts on, reports the one it does not, fails the gate'
  const original = readFileSync(TARGET_PATH, 'utf-8')
  let output = ''
  let exited = 'exited zero'
  try {
    execCli(
      `${process.execPath} ${PIKKU_BIN} scenario mutate local --files ${TARGET} --flows arithmeticScenario --min-score 100`,
      { cwd: PROJECT_DIR, timeout: 480_000 }
    )
  } catch (error) {
    exited = 'non-zero'
    output = (error as Error).message
  }
  const problems = [
    exited === 'non-zero'
      ? ''
      : 'the --min-score 100 gate did not fail the run',
    /arithmetic\.functions\.ts:\d+ ArithmeticOperator → killed/.test(output)
      ? ''
      : 'no killed mutant reported',
    new RegExp(`${TARGET}:\\d+\\s+ArithmeticOperator → value \\* 2`).test(
      output
    )
      ? ''
      : 'the survivor (half → value * 2) is not listed by file, line and mutator',
    /Mutation score\s+50%/.test(output) ? '' : 'score is not 50%',
    readFileSync(TARGET_PATH, 'utf-8') === original
      ? ''
      : 'the source was not restored',
  ].filter(Boolean)
  record(
    name,
    problems.length
      ? `${problems.join('; ')}\n${output.slice(-600)}`
      : undefined
  )
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll checks passed')
