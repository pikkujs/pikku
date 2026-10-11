import { appendFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { join } from 'node:path'
import type { CorePikkuMiddleware } from '@pikku/core/middleware'

export type RunCommand = 'dev' | 'serve' | 'all'

export interface RunTelemetry {
  runId: string | null
  middleware: CorePikkuMiddleware | null
  stop: () => void
}

const KEEP_RUNS = 20
const SAMPLE_EVERY_MS = 2000
const LOOP_RESOLUTION_MS = 20
const FLUSH_EVERY_MS = 500

let active: RunTelemetry | null = null

const idle: RunTelemetry = { runId: null, middleware: null, stop: () => {} }

const field = (wire: any, name: string): any => wire?.[name]

const describeWire = (wire: any): { wireType: string; wireid: string; fields: Record<string, unknown> } => {
  const http = field(wire, 'http')
  if (http?.request) {
    const method = http.request.method?.()
    const path = http.request.path?.()
    return { wireType: 'http', wireid: method && path ? `${method}:${path}` : 'unknown', fields: { method, path } }
  }
  const channel = field(wire, 'channel')
  if (channel) {
    return {
      wireType: 'channel',
      wireid: channel.channelName ?? channel.channelId ?? 'unknown',
      fields: { channelId: channel.channelId, channelName: channel.channelName },
    }
  }
  const queue = field(wire, 'queue')
  if (queue) {
    return { wireType: 'queue', wireid: queue.queueName ?? 'unknown', fields: { queueName: queue.queueName, messageId: queue.messageId } }
  }
  const task = field(wire, 'scheduledTask')
  if (task) return { wireType: 'scheduler', wireid: task.name ?? 'unknown', fields: { name: task.name } }
  if (field(wire, 'mcp')) {
    return { wireType: 'mcp', wireid: wire.wireId ?? 'unknown', fields: { toolName: wire.wireId } }
  }
  const cli = field(wire, 'cli')
  if (cli) return { wireType: 'cli', wireid: cli.command ?? 'unknown', fields: { command: cli.command } }
  const workflow = field(wire, 'workflow')
  if (workflow) {
    return { wireType: 'workflow', wireid: workflow.name ?? 'unknown', fields: { workflowName: workflow.name, runId: workflow.runId } }
  }
  const agent = field(wire, 'agent')
  if (agent) return { wireType: 'agent', wireid: agent.name ?? 'unknown', fields: { agentName: agent.name, runId: agent.runId } }
  const rpc = field(wire, 'rpc')
  if (rpc) return { wireType: 'rpc', wireid: rpc.name ?? 'unknown', fields: { rpcName: rpc.name } }
  return { wireType: 'unknown', wireid: 'unknown', fields: {} }
}

const text = (value: unknown) => (typeof value === 'string' && value.length > 0 ? value : null)

const prune = (dir: string) => {
  try {
    const files = readdirSync(dir)
      .filter((file) => file.endsWith('.jsonl'))
      .map((file) => ({ file, at: statSync(join(dir, file)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
    for (const { file } of files.slice(KEEP_RUNS)) rmSync(join(dir, file), { force: true })
  } catch {}
}

export const startRunTelemetry = ({ rootDir, command }: { rootDir: string; command: RunCommand }): RunTelemetry => {
  if (process.env.PIKKU_TELEMETRY === '0' || active) return idle
  const dir = join(rootDir, '.pikku', 'runs')
  const runId = Date.now().toString(36)
  const file = join(dir, `${runId}.${command}.jsonl`)
  try {
    mkdirSync(dir, { recursive: true })
    prune(dir)
  } catch {
    return idle
  }

  let buffer: string[] = []
  const flush = () => {
    if (!buffer.length) return
    const chunk = buffer.join('')
    buffer = []
    try {
      appendFileSync(file, chunk)
    } catch {}
  }
  const write = (record: Record<string, unknown>) => {
    buffer.push(`${JSON.stringify({ __pikku_telemetry: true, streamclass: 'local', _timestamp: Date.now() * 1000, ...record })}\n`)
  }

  const loop = monitorEventLoopDelay({ resolution: LOOP_RESOLUTION_MS })
  loop.enable()
  let lastWall = performance.now()
  let lastCpu = process.cpuUsage()
  const sample = () => {
    const wall = performance.now()
    const cpu = process.cpuUsage()
    const used = cpu.user + cpu.system
    const delta = used - (lastCpu.user + lastCpu.system)
    const elapsed = (wall - lastWall) * 1000
    const memory = process.memoryUsage()
    write({
      type: 'process',
      command,
      pid: process.pid,
      cpuusageusec: used,
      cpupct: elapsed > 0 ? Math.round((delta / elapsed) * 1000) / 10 : 0,
      memmb: Math.round((memory.rss / 1048576) * 10) / 10,
      heapmb: Math.round((memory.heapUsed / 1048576) * 10) / 10,
      looplagms: Number.isFinite(loop.mean) ? Math.max(0, Math.round((loop.mean / 1e6 - LOOP_RESOLUTION_MS) * 10) / 10) : 0,
    })
    loop.reset()
    lastWall = wall
    lastCpu = cpu
  }

  sample()
  const sampler = setInterval(sample, SAMPLE_EVERY_MS)
  const flusher = setInterval(flush, FLUSH_EVERY_MS)
  sampler.unref()
  flusher.unref()

  const middleware: CorePikkuMiddleware = async (_services, wire, next) => {
    const startedAt = Date.now()
    let outcome: 'ok' | 'error' = 'ok'
    let error: Error | undefined
    try {
      await next()
    } catch (err) {
      outcome = 'error'
      error = err instanceof Error ? err : new Error(String(err))
      throw err
    } finally {
      const { wireType, wireid, fields } = describeWire(wire)
      const session = field(wire, 'session')
      const http = field(wire, 'http')
      write({
        type: 'telemetry',
        __pikku_layer: 'outer',
        wiretype: wireType,
        wireid,
        traceid: field(wire, 'traceId'),
        outcome,
        totalduration: Date.now() - startedAt,
        httpstatus: http?.response?.statusCode,
        tenantuserid: text(session?.userId),
        tenantorgid: text(session?.orgId),
        ...fields,
        ...(error && { errorName: error.name, errorMessage: error.message }),
      })
    }
  }

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    if (active?.runId === runId) active = null
    clearInterval(sampler)
    clearInterval(flusher)
    sample()
    loop.disable()
    flush()
  }
  process.once('exit', stop)

  active = { runId, middleware, stop }
  return active
}
