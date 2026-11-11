import type { OtlpHttpExporter } from './otlp-http-exporter.js'

const SAMPLE_EVERY_MS = 2000
const LOOP_RESOLUTION_MS = 20

interface LoopDelay {
  enable(): void
  disable(): void
  reset(): void
  readonly mean: number
}

/** The slice of `process` the sampler reads; absent on an edge runtime. */
interface ProcessLike {
  cpuUsage(): { user: number; system: number }
  memoryUsage(): { rss: number; heapUsed: number }
  getBuiltinModule?: (id: string) => unknown
}

/**
 * `monitorEventLoopDelay` is Node-only. It is reached through
 * `process.getBuiltinModule` rather than an import so this module bundles for
 * runtimes that have no `node:perf_hooks`; where it is missing, loop lag is
 * simply not sampled.
 */
const eventLoopMonitor = (proc: ProcessLike): LoopDelay | undefined => {
  try {
    const perfHooks = proc.getBuiltinModule?.('node:perf_hooks') as
      | {
          monitorEventLoopDelay?: (options: { resolution: number }) => LoopDelay
        }
      | undefined
    return perfHooks?.monitorEventLoopDelay?.({
      resolution: LOOP_RESOLUTION_MS,
    })
  } catch {
    return undefined
  }
}

/**
 * Samples process cpu, memory and event-loop lag as OTLP gauges every
 * `everyMs`. Ported from the `pikku dev` run sampler.
 *
 * Gauges: `process.cpu.utilization` (ratio of one core), `process.memory.rss`
 * and `process.heap.used` (bytes), `eventloop.lag` (ms over the sampler's own
 * resolution). A runtime without `process` samples nothing.
 */
export const startProcessMetrics = (
  exporter: OtlpHttpExporter,
  options: { everyMs?: number } = {}
): { stop(): void } => {
  const proc = (globalThis as { process?: ProcessLike }).process
  if (!proc?.cpuUsage || !proc.memoryUsage) return { stop() {} }

  const loop = eventLoopMonitor(proc)
  loop?.enable()
  let lastWall = performance.now()
  let lastCpu = proc.cpuUsage()

  const sample = () => {
    try {
      const wall = performance.now()
      const cpu = proc.cpuUsage()
      const used = cpu.user + cpu.system
      const delta = used - (lastCpu.user + lastCpu.system)
      const elapsedUs = (wall - lastWall) * 1000
      const memory = proc.memoryUsage()
      const points = [
        {
          name: 'process.cpu.utilization',
          unit: '1',
          kind: 'gauge' as const,
          value: elapsedUs > 0 ? Math.max(0, delta / elapsedUs) : 0,
        },
        {
          name: 'process.memory.rss',
          unit: 'By',
          kind: 'gauge' as const,
          value: memory.rss,
        },
        {
          name: 'process.heap.used',
          unit: 'By',
          kind: 'gauge' as const,
          value: memory.heapUsed,
        },
      ]
      if (loop) {
        points.push({
          name: 'eventloop.lag',
          unit: 'ms',
          kind: 'gauge' as const,
          value: Number.isFinite(loop.mean)
            ? Math.max(0, loop.mean / 1e6 - LOOP_RESOLUTION_MS)
            : 0,
        })
        loop.reset()
      }
      exporter.exportMetrics(points)
      lastWall = wall
      lastCpu = cpu
    } catch {
      // Sampling never breaks the process.
    }
  }

  sample()
  const timer = setInterval(sample, options.everyMs ?? SAMPLE_EVERY_MS)
  ;(timer as { unref?: () => void }).unref?.()
  return {
    stop() {
      clearInterval(timer)
      loop?.disable()
    },
  }
}
