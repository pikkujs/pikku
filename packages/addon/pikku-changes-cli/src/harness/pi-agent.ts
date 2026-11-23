import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
} from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type { AgentOutcome, HarnessAgent } from './engine.js'
import { HarnessInfraError } from './finding.js'
import { gitIn } from './git.js'
import {
  clearOrphan,
  processStartTime,
  removeLock,
  stopGroup,
  writeLock,
} from './pi-process.js'
import { CONTINUE_PROMPT, freshRestartPrompt, resumePrompt } from './prompts.js'
import { isProviderLimit, retryAfterMsOf } from './provider-limit.js'
import { redact } from './redact.js'
import { cleanOutput, trimOutput } from './run-cli.js'

export type PiModel = { provider: string; model: string }

/** Model aliases when the caller has no map of its own. */
export const DEFAULT_PI_MODELS: Readonly<Record<string, PiModel>> = {
  default: { provider: 'openai', model: 'gpt-6.1-sol' },
}

export const defaultResolveModel = (alias: string): PiModel => {
  const model = DEFAULT_PI_MODELS[alias]
  if (!model) throw new Error(`No model is set for the alias ${alias}`)
  return model
}

/** Pi ships grep, find and ls but turns on only read, bash, edit and write. */
export const DEFAULT_PI_TOOLS = '+grep,+find,+ls'

export type PiUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
  /** Assistant messages that reported usage. */
  messages: number
}

export type PiStopReason = 'stall' | 'tool-max' | 'timeout' | 'aborted'

/** How a launch began: a new session, a resumed one, or a new one after a session was lost. */
export type PiStartMode = 'new' | 'resume' | 'fresh-restart'

export type PiAgentEvent =
  | {
      type: 'orphan'
      action: 'killed' | 'stale'
      pid: number
      startTime?: string
    }
  | {
      type: 'start'
      attempt: number
      sessionId: string
      mode: PiStartMode
      pid: number
    }
  | {
      type: 'usage'
      attempt: number
      inputTokens: number
      outputTokens: number
      cacheReadTokens: number
      cacheWriteTokens: number
      cost: number
    }
  | { type: 'session-fallback'; attempt: number; reason: string }
  | { type: 'stop'; attempt: number; reason: PiStopReason; detail: string }
  | {
      type: 'exit'
      attempt: number
      code: number | null
      signal: NodeJS.Signals | null
      outcome: AgentOutcome | 'provider-limit'
      durationMs: number
      usage: PiUsage
      /** Redacted end of what Pi reported as its error, when the attempt failed. */
      error?: string
    }

export type PiAgentOptions = {
  /** The changeset's worktree; Pi runs here. */
  worktree: string
  /** Absolute path of the node binary that runs Pi. */
  nodePath: string
  /** Absolute path of Pi's cli.js. */
  piCli: string
  changesetId: string
  /** The workflow run id: a later run starts a new session instead of resuming a stale one. */
  runId: string
  /** The first message of the session (see `harnessBuildPrompt`). */
  changePrompt: string
  /** A model alias, resolved by `resolveModel`. Defaults to `default`. */
  model?: string
  /** Defaults to `defaultResolveModel` (`default` is Sol). */
  resolveModel?: (alias: string) => PiModel
  /** The route's system prompt, appended to Pi's own. */
  systemPrompt?: string
  /** The route's skills; when given, Pi loads only these. */
  skills?: string[]
  /** Pi's `--tools`. Defaults to `DEFAULT_PI_TOOLS`. */
  tools?: string
  /** More Pi arguments, such as `-e <extension>`. */
  extraArgs?: string[]
  /** Asked after a clean exit: true when the agent asked a question and parked. */
  needsAnswer: () => Promise<boolean>
  /** Names of variables passed through from this process (provider keys and the like). */
  allowEnv?: string[]
  /** Variables set for Pi on top of the minimal environment. */
  env?: Record<string, string>
  /** Quiet with no tool running for this long is a stall. Default 10 minutes; 0 is off. */
  quietMs?: number
  /** One tool running this long is a stall. Default 45 minutes; 0 is off. */
  toolMaxMs?: number
  /** Longest one agent call may take, all launches together. Default 2 hours. */
  totalMs?: number
  /** After SIGTERM, how long before the group gets SIGKILL. Default 10 s. */
  killGraceMs?: number
  /** Stops Pi; the attempt ends `failed`. */
  signal?: AbortSignal
  onEvent?: (event: PiAgentEvent) => void
  /** The branch the changeset was cut from: a fresh restart shows the commits since. */
  base?: string
  gitBinary?: string
}

const QUIET_MS = 10 * 60_000
const TOOL_MAX_MS = 45 * 60_000
const TOTAL_MS = 120 * 60_000
const KILL_GRACE_MS = 10_000
const TAIL = 20_000
const GIT_LOG_LINES = 30

/** What Pi says when it cannot open the session it was told to resume. */
const SESSION_UNLOADABLE: readonly RegExp[] = [
  /No project session found with id/i,
  /failed to (?:load|open|read|parse) session/i,
  /cannot (?:load|open|read) session/i,
  /session\b[^\n]*\b(?:corrupt|invalid|malformed)/i,
]

const IMAGE =
  /(?:^|[\s(`'"])((?:[\w.-]+\/|\/)*[\w.-]+\.(?:png|jpe?g|gif|webp))(?=$|[\s)`'",:;])/gim

/** Pi's session ids: alphanumeric, `.`, `_`, `-`, starting and ending alphanumeric. */
export const piSessionId = (changesetId: string, runId: string): string => {
  const id = `${changesetId}-${runId}`
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')
  if (!id) throw new Error('A Pi session id needs a changeset id or a run id')
  return id
}

/** The session files Pi would open for `id`, found the way Pi finds them: by the header line. */
const sessionFiles = async (dir: string, id: string, cwd: string) => {
  const found: string[] = []
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (!name.endsWith('.jsonl')) continue
    const path = join(dir, name)
    try {
      const header = JSON.parse(
        (await readFile(path, 'utf8')).split('\n', 1)[0]!
      )
      if (
        header?.type === 'session' &&
        header.id === id &&
        typeof header.cwd === 'string' &&
        resolve(header.cwd) === resolve(cwd)
      )
        found.push(path)
    } catch {
      // not a session Pi can find either
    }
  }
  return found
}

/** Image paths the feedback names that exist inside the worktree, as absolute paths. */
const imagesIn = async (feedback: string, worktree: string) => {
  const found = new Set<string>()
  for (const [, path] of feedback.matchAll(IMAGE)) {
    const absolute = resolve(worktree, path!)
    const inside = relative(worktree, absolute)
    if (inside.startsWith('..') || isAbsolute(inside)) continue
    try {
      if ((await stat(absolute)).isFile()) found.add(absolute)
    } catch {
      // named but not there
    }
  }
  return [...found]
}

const executable = async (path: string) => {
  if (!isAbsolute(path)) return false
  try {
    await access(path, constants.R_OK)
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** Pi gets PATH, HOME and locale, the variables the caller names, and nothing else of ours. */
const piEnv = (allow: string[], extra: Record<string, string>) => {
  const env: Record<string, string> = { NO_COLOR: '1', FORCE_COLOR: '0' }
  for (const key of ['PATH', 'HOME', 'LANG', 'LC_ALL', ...allow]) {
    const value = process.env[key]
    if (value !== undefined) env[key] = value
  }
  return { ...env, ...extra }
}

/** A message that does not read as a flag or a file to Pi's argument parser. */
const asMessage = (text: string) =>
  /^[-@]/.test(text) ? `Message:\n${text}` : text

const noUsage = (): PiUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  cost: 0,
  messages: 0,
})

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/** Process groups started here; if this process exits they go with it. */
const liveGroups = new Set<number>()
let exitHooked = false
const track = (pgid: number) => {
  liveGroups.add(pgid)
  if (exitHooked) return
  exitHooked = true
  process.once('exit', () => {
    for (const group of liveGroups)
      try {
        process.kill(-group, 'SIGKILL')
      } catch {
        // already gone
      }
  })
}

type Launch = {
  code: number | null
  signal: NodeJS.Signals | null
  stopped?: { reason: PiStopReason; detail: string }
  /** The error of Pi's last assistant message or of its last failed retry, when it ended on one. */
  lastError?: string
  stderr: string
  /** Lines on stdout that were not JSON. */
  loose: string
  unloadable: boolean
  spawnError?: NodeJS.ErrnoException
}

/**
 * The harness agent that runs Pi (`-p --mode json`) in the changeset's worktree. Attempt 1 starts
 * the session with the change prompt; later attempts resume it with the findings. A session that
 * cannot be resumed is replaced by a new one told the change, the branch's commits and the findings.
 * A stall, the total timeout or the abort signal stops Pi's whole process group and the attempt is
 * `failed`. A provider usage or rate limit throws a `provider-limit` HarnessInfraError instead, so
 * the run ends as infra and the builder never hears of it.
 */
export const piAgent = (options: PiAgentOptions): HarnessAgent => {
  const {
    worktree,
    nodePath,
    piCli,
    changePrompt,
    needsAnswer,
    onEvent,
    signal,
  } = options
  const sessionId = piSessionId(options.changesetId, options.runId)
  const alias = options.model ?? 'default'
  const quietMs = options.quietMs ?? QUIET_MS
  const toolMaxMs = options.toolMaxMs ?? TOOL_MAX_MS
  const totalMs = options.totalMs ?? TOTAL_MS
  const graceMs = options.killGraceMs ?? KILL_GRACE_MS
  const git = gitIn(worktree, options.gitBinary)

  return async ({ attempt, feedback }) => {
    const started = performance.now()
    const deadline = Date.now() + totalMs
    for (const [name, path] of [
      ['node', nodePath],
      ['Pi', piCli],
    ] as const)
      if (!(await executable(path)))
        throw new HarnessInfraError(
          'missing-binary',
          `${name} is not an absolute path to a readable file: ${redact(path)}`
        )
    const { provider, model } = (options.resolveModel ?? defaultResolveModel)(
      alias
    )
    const home = join(
      (await git(['rev-parse', '--absolute-git-dir'])).trim(),
      'pikku-harness'
    )
    const sessionDir = join(home, 'pi-sessions')
    const lockPath = join(home, 'pi.lock')
    await mkdir(sessionDir, { recursive: true })

    const orphan = await clearOrphan(lockPath, graceMs)
    if (orphan.action !== 'none')
      onEvent?.({
        type: 'orphan',
        action: orphan.action,
        pid: orphan.lock.pid,
        ...(orphan.lock.startTime === undefined
          ? {}
          : { startTime: orphan.lock.startTime }),
      })

    const usage = noUsage()

    const freshMessage = async () => {
      const range = options.base ? [`${options.base}..HEAD`] : []
      let log = ''
      try {
        log = await git([
          'log',
          `-n${GIT_LOG_LINES}`,
          '--format=%h %s',
          ...range,
        ])
      } catch {
        // a branch with no commits
      }
      return freshRestartPrompt({ changePrompt, gitLog: log, feedback })
    }

    const launch = async (
      mode: PiStartMode,
      message: string,
      files: string[]
    ): Promise<Launch> => {
      const args = [
        piCli,
        '-p',
        '--mode',
        'json',
        '--approve',
        '--session-id',
        sessionId,
        '--session-dir',
        sessionDir,
        '--provider',
        provider,
        '--model',
        model,
        '--tools',
        options.tools ?? DEFAULT_PI_TOOLS,
        ...(options.skills
          ? ['--no-skills', ...options.skills.flatMap((s) => ['--skill', s])]
          : []),
        ...(options.systemPrompt
          ? ['--append-system-prompt', options.systemPrompt]
          : []),
        ...(options.extraArgs ?? []),
        ...files.map((file) => `@${file}`),
        asMessage(message),
      ]
      const child = spawn(nodePath, args, {
        cwd: worktree,
        env: piEnv(options.allowEnv ?? [], options.env ?? {}),
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      })
      const result: Launch = {
        code: null,
        signal: null,
        stderr: '',
        loose: '',
        unloadable: false,
      }
      const pid = child.pid
      let lockWritten: Promise<void> = Promise.resolve()
      if (pid !== undefined) {
        track(pid)
        lockWritten = processStartTime(pid).then((startTime) =>
          writeLock(lockPath, {
            pid,
            pgid: pid,
            ...(startTime === undefined ? {} : { startTime }),
            sessionId,
            startedAt: new Date().toISOString(),
          })
        )
        onEvent?.({ type: 'start', attempt, sessionId, mode, pid })
      }

      let lastActivity = Date.now()
      const tools = new Map<string, number>()
      let toolCount = 0
      let stopping: Promise<unknown> | undefined
      const kill = () => {
        if (stopping || pid === undefined) return false
        stopping = stopGroup(pid, graceMs)
        return true
      }
      const stop = (reason: PiStopReason, detail: string) => {
        if (!kill()) return
        result.stopped = { reason, detail }
        onEvent?.({ type: 'stop', attempt, reason, detail })
      }

      createInterface({ input: child.stdout! }).on('line', (line) => {
        lastActivity = Date.now()
        let event: Record<string, any>
        try {
          event = JSON.parse(line)
        } catch {
          result.loose = (result.loose + line + '\n').slice(-TAIL)
          return
        }
        if (!event || typeof event !== 'object') return
        if (event.type === 'tool_execution_start') {
          tools.set(String(event.toolCallId ?? `t${++toolCount}`), Date.now())
        } else if (event.type === 'tool_execution_end') {
          const id =
            event.toolCallId == null
              ? tools.keys().next().value
              : String(event.toolCallId)
          if (id !== undefined) tools.delete(id)
        } else if (
          event.type === 'message_end' &&
          event.message?.role === 'assistant'
        ) {
          const u = event.message.usage
          if (u && typeof u === 'object') {
            const counted = {
              inputTokens: number(u.input),
              outputTokens: number(u.output),
              cacheReadTokens: number(u.cacheRead),
              cacheWriteTokens: number(u.cacheWrite),
              cost: number(u.cost?.total),
            }
            usage.inputTokens += counted.inputTokens
            usage.outputTokens += counted.outputTokens
            usage.cacheReadTokens += counted.cacheReadTokens
            usage.cacheWriteTokens += counted.cacheWriteTokens
            usage.cost += counted.cost
            usage.messages += 1
            onEvent?.({ type: 'usage', attempt, ...counted })
          }
          const reason = event.message.stopReason
          result.lastError =
            reason === 'error' || reason === 'aborted'
              ? String(
                  event.message.errorMessage ?? `Pi's request ended: ${reason}`
                )
              : undefined
        } else if (event.type === 'auto_retry_end' && event.success === false) {
          result.lastError = String(event.finalError ?? 'retries ran out')
        }
      })
      child.stderr!.on('data', (chunk: Buffer) => {
        result.stderr = (result.stderr + chunk.toString('utf8')).slice(-TAIL)
        if (
          mode === 'resume' &&
          !result.unloadable &&
          SESSION_UNLOADABLE.some((pattern) => pattern.test(result.stderr))
        ) {
          result.unloadable = true
          kill()
        }
      })

      const watchEvery = Math.min(
        30_000,
        Math.max(
          50,
          Math.min(...[quietMs, toolMaxMs].filter((n) => n > 0), 60_000) / 2
        )
      )
      const watch = setInterval(() => {
        const now = Date.now()
        if (tools.size) {
          const oldest = Math.min(...tools.values())
          if (toolMaxMs > 0 && now - oldest >= toolMaxMs)
            stop(
              'tool-max',
              `one tool ran for ${Math.round((now - oldest) / 1000)} s (the limit is ${toolMaxMs / 1000} s)`
            )
        } else if (quietMs > 0 && now - lastActivity >= quietMs)
          stop(
            'stall',
            `quiet for ${Math.round((now - lastActivity) / 1000)} s with no tool running (the limit is ${quietMs / 1000} s)`
          )
      }, watchEvery)
      const total = setTimeout(
        () => stop('timeout', `did not finish within ${totalMs / 1000} s`),
        Math.max(0, deadline - Date.now())
      )
      const onAbort = () => stop('aborted', 'the run was stopped')
      if (signal?.aborted) onAbort()
      else signal?.addEventListener('abort', onAbort, { once: true })

      await new Promise<void>((done) => {
        child.once('error', (error) => {
          result.spawnError = error
          done()
        })
        child.once('close', (code, sig) => {
          result.code = code
          result.signal = sig
          done()
        })
      })
      clearInterval(watch)
      clearTimeout(total)
      signal?.removeEventListener('abort', onAbort)
      if (pid !== undefined) {
        await stopping
        // What Pi started (a dev server, a browser) does not outlive it.
        await stopGroup(pid, graceMs)
        liveGroups.delete(pid)
        await lockWritten.catch(() => undefined)
        await removeLock(lockPath, pid)
      }
      return result
    }

    const exists =
      (await sessionFiles(sessionDir, sessionId, worktree)).length > 0
    let mode: PiStartMode
    let message: string
    let files: string[] = []
    if (exists) {
      mode = 'resume'
      message =
        feedback === undefined ? CONTINUE_PROMPT : resumePrompt(feedback)
      if (feedback !== undefined) files = await imagesIn(feedback, worktree)
    } else if (attempt === 1 && feedback === undefined) {
      mode = 'new'
      message = changePrompt
    } else {
      mode = 'fresh-restart'
      message = await freshMessage()
      onEvent?.({
        type: 'session-fallback',
        attempt,
        reason: 'the session file is missing',
      })
    }

    let run = await launch(mode, message, files)
    if (run.unloadable && !run.stopped && !signal?.aborted) {
      // Moved aside rather than deleted, so a person can still read what was there.
      for (const path of await sessionFiles(sessionDir, sessionId, worktree))
        await rename(path, `${path}.unloadable-${Date.now()}`)
      onEvent?.({
        type: 'session-fallback',
        attempt,
        reason: 'Pi could not open the session',
      })
      run = await launch('fresh-restart', await freshMessage(), [])
    }

    const errorText = [
      run.lastError,
      run.spawnError?.message,
      run.loose,
      run.stderr,
    ]
      .filter(Boolean)
      .join('\n')
    const shown = redact(trimOutput(cleanOutput(errorText), 2_000))
    const failed =
      run.stopped !== undefined ||
      run.unloadable ||
      run.spawnError !== undefined ||
      run.code !== 0 ||
      run.lastError !== undefined
    const finish = (outcome: AgentOutcome | 'provider-limit') =>
      onEvent?.({
        type: 'exit',
        attempt,
        code: run.code,
        signal: run.signal,
        outcome,
        durationMs: Math.round(performance.now() - started),
        usage: { ...usage },
        ...(failed && shown ? { error: shown } : {}),
      })

    if (run.spawnError)
      throw new HarnessInfraError(
        'missing-binary',
        `Pi could not start: ${redact(run.spawnError.message)}`
      )
    if (failed && !run.stopped && isProviderLimit(errorText)) {
      finish('provider-limit')
      const retryAfterMs = retryAfterMsOf(errorText)
      throw new HarnessInfraError(
        'provider-limit',
        `The model provider refused for a usage or rate limit (${provider}/${model}): ${shown}`,
        {
          output: shown,
          ...(run.code === null ? {} : { exitCode: run.code }),
          ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
        }
      )
    }
    const outcome: AgentOutcome = failed
      ? 'failed'
      : (await needsAnswer())
        ? 'needs-answer'
        : 'done'
    finish(outcome)
    return { outcome, sessionId, usage }
  }
}
