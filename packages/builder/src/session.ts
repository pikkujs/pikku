import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { piCritic } from './look.js'
import { budgetLine, nextStep } from './loop.js'
import { piArgs, piEnv, resolvePi, type BuilderAi } from './pi.js'
import { builderHome, writeSkills } from './skills.js'

export type BuilderItem =
  | { kind: 'user'; text: string; at: number }
  | { kind: 'assistant'; text: string; at: number }
  | { kind: 'tool'; id: string; name: string; summary: string; status: 'running' | 'done' | 'error'; at: number }
  | { kind: 'error'; text: string; at: number }
  | { kind: 'loop'; text: string; at: number }

export interface BuilderState {
  busy: boolean
  items: BuilderItem[]
  session: string
}

export type Launcher = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => ChildProcess

export interface BuilderLaunch {
  cwd: string
  ai?: BuilderAi
  env?: Record<string, string>
  apiUrl?: string
  apps?: { slug: string; url: string }[]
  loop?: boolean
  launch?: Launcher
}

const spawnPi: Launcher = (command, args, options) => spawn(command, args, { ...options, stdio: ['pipe', 'pipe', 'pipe'] })

const summarize = (args: unknown): string => {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  const pick = a.path ?? a.file_path ?? a.command ?? a.pattern ?? a.url
  if (typeof pick === 'string') return pick.length > 120 ? `${pick.slice(0, 117)}…` : pick
  if (Array.isArray(a.files)) return a.files.map((f) => (f && typeof f === 'object' ? (f as any).path : '')).filter(Boolean).join(', ')
  return ''
}

interface Turn {
  child: ChildProcess
  promptId: number
  tools: number
}

interface Drive {
  gen: number
  turns: number
  built: number
  quiet: number
  report: string
  repeats: number
}

export const MAX_DRIVEN_TURNS = 25
export const MAX_MILESTONES_PER_DRIVE = 3

export class BuilderSession {
  private states = new Map<string, BuilderState>()
  private turns = new Map<string, Turn>()
  private drives = new Map<string, Drive>()

  constructor(
    private resolve: (key: string) => Promise<BuilderLaunch>,
    private home = builderHome()
  ) {}

  private file(key: string) {
    return join(this.home, 'transcripts', `${key}.json`)
  }

  async state(key: string): Promise<BuilderState> {
    const cached = this.states.get(key)
    if (cached) return cached
    const path = this.file(key)
    const saved = existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : {}
    const state: BuilderState = { busy: false, items: saved.items ?? [], session: saved.session ?? `pikku-${key}` }
    this.states.set(key, state)
    return state
  }

  private async save(key: string) {
    const state = await this.state(key)
    await mkdir(join(this.home, 'transcripts'), { recursive: true })
    await writeFile(this.file(key), JSON.stringify({ session: state.session, items: state.items }))
  }

  private drive(key: string): Drive {
    let drive = this.drives.get(key)
    if (!drive) this.drives.set(key, (drive = { gen: 0, turns: 0, built: 0, quiet: 0, report: '', repeats: 0 }))
    return drive
  }

  async prompt(key: string, message: string, context?: string): Promise<BuilderState> {
    const text = message.trim()
    if (!text) throw new Error('Say what you want built first')
    const state = await this.state(key)
    state.items.push({ kind: 'user', text, at: Date.now() })
    const gen = this.drive(key).gen + (this.turns.has(key) ? 0 : 1)
    this.drives.set(key, { gen, turns: 0, built: 0, quiet: 0, report: '', repeats: 0 })
    await this.send(key, context ? `${text}\n\n<context>${context}</context>` : text)
    return state
  }

  private async send(key: string, sent: string) {
    const state = await this.state(key)
    const running = this.turns.get(key)
    if (running) {
      running.promptId += 1
      running.child.stdin?.write(`${JSON.stringify({ type: 'follow_up', id: `r${running.promptId}`, message: sent })}\n`)
      await this.save(key)
      return
    }
    const gen = this.drive(key).gen
    const { cwd, ai, env = {}, launch = spawnPi } = await this.resolve(key)
    const skills = await writeSkills(this.home)
    const child = launch(process.execPath, [resolvePi(), ...piArgs({ ai, skills, mode: 'rpc', session: state.session })], {
      cwd,
      env: { ...process.env, ...env, ...piEnv(ai) },
    })
    const turn: Turn = { child, promptId: 1, tools: 0 }
    this.turns.set(key, turn)
    state.busy = true
    let stderr = ''
    child.stderr?.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)))
    createInterface({ input: child.stdout! }).on('line', (line) => this.onEvent(key, line))
    child.once('error', (error) => this.push(key, `The builder could not start: ${error.message}`))
    child.once('exit', (code) => {
      if (this.turns.get(key) === turn) this.turns.delete(key)
      state.busy = false
      if (code && state.items.at(-1)?.kind !== 'error') {
        this.push(key, stderr.trim().split('\n').slice(-8).join('\n') || `The builder stopped (${code})`)
      }
      for (const item of state.items) if (item.kind === 'tool' && item.status === 'running') item.status = 'error'
      const drive = this.drive(key)
      drive.quiet = turn.tools === 0 ? drive.quiet + 1 : 0
      void this.save(key)
      if (!code && drive.gen === gen) void this.advance(key, gen)
    })
    child.stdin?.write(`${JSON.stringify({ type: 'prompt', id: 'r1', message: sent })}\n`)
    await this.save(key)
  }

  private note(key: string, text: string) {
    this.states.get(key)?.items.push({ kind: 'loop', text, at: Date.now() })
  }

  private async advance(key: string, gen: number): Promise<void> {
    const state = await this.state(key)
    const drive = this.drive(key)
    const launch = await this.resolve(key).catch(() => null)
    if (!launch || launch.loop === false) return
    if (drive.quiet >= 2) {
      this.note(key, 'The builder stopped: two turns in a row did nothing')
      return void (await this.save(key))
    }
    state.busy = true
    try {
      const status = (text: string) => {
        this.note(key, text)
        void this.save(key)
      }
      const step = await nextStep(launch.cwd, {
        apiUrl: launch.apiUrl,
        env: launch.env,
        apps: launch.apps,
        critic: piCritic({ ai: launch.ai, env: { ...launch.env, ...piEnv(launch.ai) }, launch: launch.launch ?? spawnPi }),
        onStatus: status,
      })
      if (this.drive(key).gen !== gen) return
      if (step.kind === 'built') {
        this.note(key, step.status)
        drive.built += 1
        drive.turns = 0
        drive.repeats = 0
        if (drive.built >= MAX_MILESTONES_PER_DRIVE) {
          this.note(key, `Paused after ${drive.built} milestones — say "continue" to build the next`)
          return
        }
        state.busy = false
        return this.advance(key, gen)
      }
      if (step.kind === 'stop') {
        if (step.status) this.note(key, step.status)
        return
      }
      drive.repeats = step.message === drive.report ? drive.repeats + 1 : 0
      drive.report = step.message
      drive.turns += 1
      if (drive.turns > MAX_DRIVEN_TURNS || drive.repeats >= 3) {
        this.note(key, `${step.status} — stopped after ${drive.turns - 1} turns without passing`)
        return
      }
      this.note(key, `${step.status} (turn ${drive.turns} of ${MAX_DRIVEN_TURNS})`)
      state.busy = false
      await this.send(key, `${budgetLine(drive.turns, MAX_DRIVEN_TURNS)}\n\n${step.message}`)
    } catch (error) {
      this.push(key, `The build loop failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (!this.turns.has(key)) state.busy = false
      await this.save(key)
    }
  }

  private push(key: string, text: string) {
    this.states.get(key)?.items.push({ kind: 'error', text, at: Date.now() })
  }

  private onEvent(key: string, line: string) {
    let event: Record<string, any>
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    const state = this.states.get(key)
    if (!state) return
    const last = state.items.at(-1)
    if (event.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      const delta = String(event.assistantMessageEvent.delta ?? '')
      if (last?.kind === 'assistant') last.text += delta
      else state.items.push({ kind: 'assistant', text: delta, at: Date.now() })
    } else if (event.type === 'tool_execution_start') {
      const turn = this.turns.get(key)
      if (turn) turn.tools += 1
      state.items.push({
        kind: 'tool',
        id: String(event.toolCallId ?? state.items.length),
        name: String(event.toolName ?? 'tool'),
        summary: summarize(event.args),
        status: 'running',
        at: Date.now(),
      })
    } else if (event.type === 'tool_execution_end') {
      const id = event.toolCallId == null ? null : String(event.toolCallId)
      const tool = state.items.findLast((i) => i.kind === 'tool' && (id === null || i.id === id))
      if (tool?.kind === 'tool') tool.status = event.isError ? 'error' : 'done'
    } else if (event.type === 'message_end' && event.message?.stopReason === 'error') {
      this.push(key, String(event.message?.errorMessage ?? 'The model returned an error'))
    } else if (event.type === 'response' && event.success === false) {
      this.push(key, String(event.error ?? 'The builder refused the message'))
    } else if (event.type === 'agent_end') {
      this.turns.get(key)?.child.stdin?.end()
      void this.save(key)
    }
  }

  cancel(key: string) {
    this.drive(key).gen += 1
    const turn = this.turns.get(key)
    if (!turn) return
    turn.child.stdin?.write(`${JSON.stringify({ type: 'abort', id: 'abort' })}\n`)
    setTimeout(() => turn.child.kill(), 3000).unref()
  }

  async clear(key: string) {
    this.cancel(key)
    this.states.set(key, { busy: false, items: [], session: `pikku-${key}-${Date.now()}` })
    await this.save(key)
  }
}
