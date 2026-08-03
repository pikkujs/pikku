import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { serializeTypedChannelsMap } from './serialize-typed-channel-map.js'

const logger = {
  warn: () => {},
  info: () => {},
  debug: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
} as any

const emptyTypesMap = {
  customTypes: new Map(),
  getTypeMeta: () => {
    throw new Error('type not found')
  },
} as any

/**
 * One channel whose message wirings are keyed by `methods`, under the route
 * key `routeKey`. Every referenced function is untyped, so the emitted handler
 * is `ChannelHandler<null, null>` and the test is only ever looking at keys.
 */
const channelsMeta = (routeKey: string, methods: string[]) => {
  const functionsMeta: Record<string, any> = {}
  const wirings: Record<string, any> = {}
  for (const method of methods) {
    const funcId = `fn_${method.replace(/[^A-Za-z0-9]/g, '_')}`
    functionsMeta[funcId] = { inputs: null, outputs: null }
    wirings[method] = { pikkuFuncId: funcId }
  }
  return {
    functionsMeta,
    channelsMeta: {
      cli: {
        name: 'fabric-cli',
        route: '/cli/fabric',
        input: null,
        connect: null,
        disconnect: null,
        message: null,
        messageWirings: { [routeKey]: wirings },
      },
    } as any,
  }
}

const serialize = (routeKey: string, methods: string[]) => {
  const { functionsMeta, channelsMeta: meta } = channelsMeta(routeKey, methods)
  return serializeTypedChannelsMap(
    logger,
    '/proj/.pikku/channel/pikku-channels-map.gen.d.ts',
    {},
    emptyTypesMap,
    functionsMeta,
    {},
    meta,
    '/proj/.pikku/rpc/pikku-rpc-map.internal.gen.d.ts'
  )
}

/** Syntax errors only — the fragment references types it does not import. */
const parseErrors = (source: string): string[] => {
  const file = ts.createSourceFile(
    'pikku-channels-map.gen.d.ts',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  return ((file as any).parseDiagnostics ?? []).map((d: ts.Diagnostic) =>
    ts.flattenDiagnosticMessageText(d.messageText, ' ')
  )
}

describe('serializeTypedChannelsMap', () => {
  test('a command id that is not a bare identifier is quoted, so the map still parses', () => {
    // The CLI-over-channel case: message keys are command ids, and a nested
    // command is emitted dotted. Unquoted, `deploy.list` ends the property at
    // `deploy` and every following line is a syntax error — one real project
    // produced 107 of them from a single CLI channel.
    const out = serialize('command', ['deploy.list', 'app-smoke', 'status'])

    assert.match(out, /readonly 'deploy\.list': ChannelHandler</)
    assert.match(out, /readonly 'app-smoke': ChannelHandler</)
    assert.deepEqual(parseErrors(out), [])
  })

  test('a route key that is not a bare identifier is quoted too', () => {
    const out = serialize('cli-command', ['status'])

    assert.match(out, /readonly 'cli-command': \{/)
    assert.deepEqual(parseErrors(out), [])
  })

  test('bare identifiers are left unquoted, so existing generated output is unchanged', () => {
    const out = serialize('action', ['subscribe', 'unsubscribe'])

    assert.match(out, /readonly action: \{/)
    assert.match(out, /readonly subscribe: ChannelHandler</)
    assert.match(out, /readonly unsubscribe: ChannelHandler</)
    assert.doesNotMatch(out, /'subscribe'/)
    assert.deepEqual(parseErrors(out), [])
  })
})
