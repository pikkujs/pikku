import assert from 'node:assert/strict'
import { ProviderRegistry, runProviders } from '@pikku/core/provider'
import { fanOutAnalytics } from '@pikku/core/analytics'
import { openai } from '@verifier/prov-ai/src/openai.js'
import { anthropic } from '@verifier/prov-ai/src/anthropic.js'
import { sinkA, sinkB } from '@verifier/prov-sinks/src/providers.js'
import { projectSink } from './providers.js'

const item = { common: { needs: [], provides: [] } }

// AI SDKs come from one addon's collection, as label-sorted entries.
{
  const registry = new ProviderRegistry()
    .add('openai', openai as never, item)
    .add('anthropic', anthropic as never, item)
  const services: Record<string, any> = {}
  await runProviders(registry, { target: 'dev', services })
  assert.deepEqual(
    services.aiProviders.map((entry: any) => entry.label),
    ['anthropic', 'openai']
  )
  assert.deepEqual(
    services.aiProviders.map((entry: any) => entry.item.name),
    ['anthropic', 'openai']
  )
}

// Analytics sinks from two addons and the project share core's collection,
// and each receives only the events its map names.
{
  const received: Record<string, string[]> = { a: [], b: [], project: [] }
  const record = (key: string) => ({
    write: async (batch: { name: string }[]) => {
      received[key]!.push(...batch.map((record) => record.name))
    },
  })
  const withSink = (provider: any, key: string, events: string[]) =>
    ({
      ...provider,
      common: () => ({
        sink: record(key),
        map: Object.fromEntries(events.map((name) => [name, true])),
      }),
    }) as never
  const registry = new ProviderRegistry()
    .add('sinkA', withSink(sinkA, 'a', ['signup']), item)
    .add('sinkB', withSink(sinkB, 'b', ['signup', 'purchase']), item)
    .add('projectSink', withSink(projectSink, 'project', ['purchase']), item)
  const services: Record<string, any> = {}
  await runProviders(registry, { target: 'dev', services })
  assert.deepEqual(
    services.analyticsSinks.map((entry: any) => entry.label),
    ['projectSink', 'sinkA', 'sinkB']
  )
  const analytics = fanOutAnalytics(services.analyticsSinks, {
    write: async () => assert.fail('the fallback is for no sink at all'),
  })
  await analytics.write([
    { name: 'signup' },
    { name: 'purchase' },
    { name: 'other' },
  ] as never)
  assert.deepEqual(received, {
    a: ['signup'],
    b: ['signup', 'purchase'],
    project: ['purchase'],
  })
}
console.log('ok: AI SDKs and analytics sinks arrive through collections')
