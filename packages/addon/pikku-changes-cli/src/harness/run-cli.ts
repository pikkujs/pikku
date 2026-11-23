import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { HarnessInfraError, isFinding, type Finding } from './finding.js'
import { redact, redactFinding } from './redact.js'

/** What a parser sees: the tool's full stdout and stderr, uncleaned, and its exit code. */
export type RawOutput = { stdout: string; stderr: string; code: number }

export type Parse = (raw: RawOutput) => Finding[]

export type RunCliOptions = {
  /** Directory the tool runs in (the gate's worktree). */
  cwd: string
  /** Absolute path of the pinned tool. Never looked up on PATH. */
  binary: string
  parse: Parse
  /** Exit codes that mean the tool ran. Any other code is accepted only when the parse found something. */
  okCodes?: number[]
  timeoutMs?: number
  /** Extra variables on top of the minimal environment the tool gets. */
  env?: Record<string, string>
  /** Characters of cleaned output kept on an infra error. */
  outputLimit?: number
  /** Duration and exit code of the call, for analytics. */
  onRun?: (run: { durationMs: number; exitCode: number | null }) => void
}

const DEFAULT_TIMEOUT_MS = 300_000
const DEFAULT_OUTPUT_LIMIT = 4_000
/** Per stream; a tool that prints more than this is cut off and fails to parse. */
const MAX_CAPTURE = 32 * 1024 * 1024
const KILL_GRACE_MS = 2_000

const ANSI =
  // CSI sequences, OSC sequences (ended by BEL or ST), and lone two-character escapes
  // oxlint-disable-next-line no-control-regex
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g
/** A line drawn only from box, block and braille characters: a logo or a progress bar. */
const DRAWING = /^(?=.*[─-▟⠀-⣿])[\s─-▟⠀-⣿|/\\_=#.\-*+<>()[\]{}'`~^]+$/
/** A bar (`[=====>    ]`) followed or preceded by a percentage or a count. */
const PROGRESS =
  /\[[=#>.\- ]{5,}\]\s*(?:\d{1,3}(?:\.\d+)?%|\d+\/\d+)|(?:\d{1,3}(?:\.\d+)?%|\d+\/\d+)\s*\[[=#>.\- ]{5,}\]/
const SPINNER = /^\s*[⠀-⣿◐-◓]\s/

/** Output as a person would read it: no colour codes, logos, spinners or progress bars. */
export const cleanOutput = (text: string): string =>
  text
    .replace(ANSI, '')
    .split('\n')
    // a carriage return redraws the line; only what was drawn last is kept
    .map((line) => line.replace(/\r$/, '').split('\r').pop()!)
    .filter(
      (line) =>
        !line.trim() ||
        !(DRAWING.test(line) || PROGRESS.test(line) || SPINNER.test(line))
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/** Keeps the start and the end, where tools put the cause and the summary. */
export const trimOutput = (
  text: string,
  limit = DEFAULT_OUTPUT_LIMIT
): string => {
  if (text.length <= limit) return text
  const head = Math.floor(limit / 4)
  const tail = limit - head
  return `${text.slice(0, head)}\n… [${text.length - limit} characters trimmed] …\n${text.slice(-tail)}`
}

const shown = (raw: RawOutput, limit?: number) =>
  redact(trimOutput(cleanOutput(`${raw.stdout}\n${raw.stderr}`), limit))

const usable = async (binary: string) => {
  if (!isAbsolute(binary)) return false
  try {
    await access(binary, constants.X_OK)
    return (await stat(binary)).isFile()
  } catch {
    return false
  }
}

/** A tool gets PATH (scripts with `#!/usr/bin/env node`), HOME and locale; never the caller's secrets. */
const baseEnv = (): Record<string, string> => {
  const env: Record<string, string> = {
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    CI: '1',
    PIKKU_NO_LOGO: '1',
  }
  for (const key of ['PATH', 'HOME', 'LANG', 'LC_ALL']) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return env
}

type Exit = RawOutput & {
  timedOut: boolean
  spawnError?: NodeJS.ErrnoException
}

const execute = (
  binary: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number
): Promise<Exit> =>
  new Promise((done) => {
    const child = spawn(binary, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    const streams = { stdout: '', stderr: '' }
    const collect = (name: 'stdout' | 'stderr') => (chunk: Buffer) => {
      if (streams[name].length < MAX_CAPTURE)
        streams[name] += chunk.toString('utf8')
    }
    child.stdout.on('data', collect('stdout'))
    child.stderr.on('data', collect('stderr'))
    let timedOut = false
    let killer: NodeJS.Timeout | undefined
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
    }, timeoutMs)
    let spawnError: NodeJS.ErrnoException | undefined
    child.once('error', (error) => (spawnError = error))
    child.once('close', (code) => {
      clearTimeout(timer)
      clearTimeout(killer)
      done({
        ...streams,
        code: code ?? -1,
        timedOut,
        spawnError,
      })
    })
  })

/**
 * Runs a gate's tool and returns its findings. The parser sees the full raw output; findings come
 * back redacted. Anything that is not an answer (no binary, a timeout, output the parser rejects,
 * an exit code outside `okCodes` with nothing found) throws a HarnessInfraError whose message and
 * output are cleaned, trimmed and redacted.
 */
export const runCli = async (
  args: string[],
  options: RunCliOptions
): Promise<Finding[]> => {
  const {
    cwd,
    binary,
    parse,
    okCodes = [0],
    timeoutMs = DEFAULT_TIMEOUT_MS,
    outputLimit,
  } = options
  const name = redact(binary)
  if (!(await usable(binary)))
    throw new HarnessInfraError(
      'missing-binary',
      `${name} is not an absolute path to an executable file`
    )
  const started = performance.now()
  const exit = await execute(
    binary,
    args,
    cwd,
    { ...baseEnv(), ...options.env },
    timeoutMs
  )
  options.onRun?.({
    durationMs: Math.round(performance.now() - started),
    exitCode: exit.timedOut || exit.spawnError ? null : exit.code,
  })
  const output = shown(exit, outputLimit)
  if (exit.spawnError)
    throw new HarnessInfraError(
      exit.spawnError.code === 'ENOENT' || exit.spawnError.code === 'EACCES'
        ? 'missing-binary'
        : 'unparseable',
      `${name} could not start: ${redact(exit.spawnError.message)}`,
      { output }
    )
  if (exit.timedOut)
    throw new HarnessInfraError(
      'timeout',
      `${name} did not finish within ${timeoutMs} ms`,
      { output }
    )

  let findings: Finding[]
  try {
    findings = parse(exit)
    if (!Array.isArray(findings) || !findings.every(isFinding))
      throw new Error('the parser did not return Finding[]')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new HarnessInfraError(
      'unparseable',
      `${name} output could not be parsed (exit ${exit.code}): ${redact(trimOutput(cleanOutput(reason), 500))}\n${output}`,
      { output, exitCode: exit.code }
    )
  }
  if (!okCodes.includes(exit.code) && findings.length === 0)
    throw new HarnessInfraError(
      'exit-code',
      `${name} exited ${exit.code} and reported nothing\n${output}`,
      { output, exitCode: exit.code }
    )
  return findings.map(redactFinding)
}
