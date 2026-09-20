import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeMCPJson } from './serialize-mcp-json.js'
import type { InspectorLogger, InspectorState } from '../types.js'

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  critical: () => {},
} as unknown as InspectorLogger

const tool = (name: string, surface?: string) => ({
  pikkuFuncId: name,
  name,
  description: name,
  inputSchema: null,
  outputSchema: null,
  ...(surface ? { surface } : {}),
})

const stateWith = (
  toolsMeta: Record<string, any>,
  surfaces: Record<string, string>
): InspectorState =>
  ({
    functions: {
      meta: Object.fromEntries(
        Object.keys(toolsMeta).map((id) => [id, { pikkuFuncId: id }])
      ),
      typesMap: {
        getUniqueName: (n: string) => n,
      },
    },
    addonFunctions: {},
    schemas: {},
    mcpEndpoints: {
      toolsMeta,
      resourcesMeta: {},
      promptsMeta: {},
      surfaces,
    },
  }) as unknown as InspectorState

const parse = (state: InspectorState, surface?: string) =>
  JSON.parse(serializeMCPJson(logger, state, surface))

describe('serializeMCPJson — one manifest per endpoint', () => {
  test('with no surfaces every tool lands in the default manifest', () => {
    const state = stateWith({ a: tool('a'), b: tool('b') }, {})
    assert.deepEqual(
      parse(state).tools.map((t: any) => t.name),
      ['a', 'b']
    )
  })

  test('a surfaced tool is served by its own endpoint and by no other', () => {
    const state = stateWith(
      {
        a: tool('a'),
        'weather:forecast': tool('weather:forecast', 'weather'),
        'calendar:list': tool('calendar:list', 'calendar'),
      },
      { weather: '/mcp/weather', calendar: '/mcp/calendar' }
    )

    assert.deepEqual(
      parse(state).tools.map((t: any) => t.name),
      ['a'],
      'the default manifest must not repeat a surfaced tool'
    )
    assert.deepEqual(
      parse(state, 'weather').tools.map((t: any) => t.name),
      ['weather:forecast']
    )
    assert.deepEqual(
      parse(state, 'calendar').tools.map((t: any) => t.name),
      ['calendar:list']
    )
  })

  test('a surface manifest carries the path it is served on', () => {
    const state = stateWith(
      { 'weather:forecast': tool('weather:forecast', 'weather') },
      { weather: '/connectors/weather' }
    )
    assert.equal(parse(state, 'weather').mcpPath, '/connectors/weather')
    assert.equal(
      parse(state).mcpPath,
      undefined,
      'the default endpoint stays wherever the runtime mounts it'
    )
  })
})
