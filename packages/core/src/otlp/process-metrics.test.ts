import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeMetrics } from '../testing/otlp-decoder.js'
import { OtlpHttpExporter } from './otlp-http-exporter.js'
import { startProcessMetrics } from './process-metrics.js'

describe('startProcessMetrics', () => {
  test('samples cpu, memory and loop lag as gauges, and stops', async () => {
    const bodies: Uint8Array[] = []
    const exporter = new OtlpHttpExporter({
      endpoint: 'http://127.0.0.1:4000/v1/otlp',
      resource: { serviceName: 's' },
      flushIntervalMs: 60_000,
      fetch: (async (_url: string, init: RequestInit) => {
        bodies.push(init.body as Uint8Array)
        return new Response(null, { status: 200 })
      }) as never,
    })
    const sampler = startProcessMetrics(exporter, { everyMs: 20 })
    await new Promise((resolve) => setTimeout(resolve, 120))
    sampler.stop()
    await exporter.flush()
    const metrics = bodies.flatMap((body) => decodeMetrics(body).items)
    const byName = new Map(metrics.map((m) => [m.name, m]))
    assert.deepEqual([...byName.keys()].sort(), [
      'eventloop.lag',
      'process.cpu.utilization',
      'process.heap.used',
      'process.memory.rss',
    ])
    for (const metric of metrics) assert.equal(metric.type, 'gauge')
    assert.equal(byName.get('process.memory.rss')!.unit, 'By')
    const rss = byName.get('process.memory.rss')!.points
    assert.ok(rss.length >= 2, 'sampled more than once')
    assert.ok((rss[0]!.value as number) > 1_000_000)
    for (const point of byName.get('process.cpu.utilization')!.points) {
      assert.ok((point.value as number) >= 0)
    }

    const countAfterStop = () =>
      bodies
        .flatMap((body) => decodeMetrics(body).items)
        .filter((m) => m.name === 'process.memory.rss')
        .flatMap((m) => m.points).length
    const before = countAfterStop()
    await new Promise((resolve) => setTimeout(resolve, 80))
    await exporter.flush()
    assert.equal(countAfterStop(), before, 'no samples after stop()')
  })
})
