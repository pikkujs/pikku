import { test } from 'node:test'
import { OtlpSinkRegistry } from './otlp-sink.js'
import type { OtlpSink, OtlpSinkBase } from './otlp-sink.js'

type CityMap = { hops: Record<string, string> }

const base: OtlpSinkBase = {
  exportSpans() {},
  exportLogs() {},
  exportMetrics() {},
  flush: async () => {},
  close: async () => {},
}

test('the map type is inferred from the sink and checked at registration', () => {
  const plain: OtlpSink = base
  const mapped: OtlpSink<CityMap> = { ...base, setMap: () => {} }
  const registry = new OtlpSinkRegistry()

  registry.add(plain)
  registry.add(mapped, { hops: { rpc: 'road' } })

  // Never called: each line below is refused by the compiler, which is the assertion.
  const refused = () => {
    // @ts-expect-error a sink that wants a map cannot be registered without one
    registry.add(mapped)

    // @ts-expect-error the map must be the shape the sink declared
    registry.add(mapped, { hops: 3 })

    // @ts-expect-error a sink with no map is not given one
    registry.add(plain, { hops: {} })

    // @ts-expect-error a sink for one map type is not registered with another
    registry.add(mapped, { other: true })
  }
  void refused
})
