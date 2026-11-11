import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { LogLevel, type Logger } from '../services/logger.js'
import { decodeLogs } from '../testing/otlp-decoder.js'
import { OtlpHttpExporter } from './otlp-http-exporter.js'
import { OtlpLogger } from './otlp-logger.js'

const setup = (options: ConstructorParameters<typeof OtlpLogger>[2] = {}) => {
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
  const written: string[] = []
  const inner: Logger = {
    info: (m: unknown) => void written.push(`info:${String(m)}`),
    warn: (m: unknown) => void written.push(`warn:${String(m)}`),
    error: (m: unknown) => void written.push(`error:${String(m)}`),
    debug: (m: string) => void written.push(`debug:${m}`),
    setLevel: () => {},
    scope: (traceId: string) => ({
      ...inner,
      info: (m: unknown) =>
        void written.push(`scoped(${traceId}):${String(m)}`),
    }),
  }
  const logger = new OtlpLogger(inner, exporter, options)
  const sent = async () => {
    await exporter.flush()
    return bodies.flatMap((body) => decodeLogs(body).items)
  }
  return { logger, written, sent }
}

describe('OtlpLogger', () => {
  test('writes through the inner logger and forwards info and above', async () => {
    const { logger, written, sent } = setup()
    logger.debug('quiet')
    logger.info('hello')
    logger.warn('careful')
    logger.error('broke')
    assert.deepEqual(written, [
      'debug:quiet',
      'info:hello',
      'warn:careful',
      'error:broke',
    ])
    const records = await sent()
    assert.deepEqual(
      records.map((r) => [r.severityText, r.severityNumber, r.body]),
      [
        ['info', 9, { string: 'hello' }],
        ['warn', 13, { string: 'careful' }],
        ['error', 17, { string: 'broke' }],
      ]
    )
  })

  test('minLevel moves the floor', async () => {
    const { logger, sent } = setup({ minLevel: LogLevel.error })
    logger.info('no')
    logger.error('yes')
    assert.deepEqual(
      (await sent()).map((r) => r.severityText),
      ['error']
    )
  })

  test('an object becomes attributes, an Error loses its stack', async () => {
    const { logger, sent } = setup()
    logger.info({
      message: 'created',
      invoiceId: 'inv_1',
      amount: 5,
      nested: { a: 1 },
    })
    const error = new RangeError('too big')
    logger.error(error)
    const [object, err] = await sent()
    assert.deepEqual(object!.body, { string: 'created' })
    assert.deepEqual(object!.attributes.invoiceId, { string: 'inv_1' })
    assert.deepEqual(object!.attributes.amount, { int: 5n })
    assert.deepEqual(object!.attributes.nested, { string: '{"a":1}' })
    assert.deepEqual(err!.body, { string: 'too big' })
    assert.deepEqual(err!.attributes['exception.type'], {
      string: 'RangeError',
    })
    assert.equal(
      JSON.stringify(err, (_k, v) => (typeof v === 'bigint' ? 0 : v)).includes(
        '.ts'
      ),
      false
    )
  })

  test('the body is bounded', async () => {
    const { logger, sent } = setup()
    logger.info('x'.repeat(100_000))
    const [record] = await sent()
    assert.ok((record!.body as { string: string }).string.length <= 4096)
  })

  test('records carry the current trace and span when a context is available', async () => {
    const { logger, sent } = setup({
      currentContext: () => ({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        sampled: true,
      }),
    })
    logger.info('traced')
    const [record] = await sent()
    assert.equal(record!.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
    assert.equal(record!.spanId, '00f067aa0ba902b7')
  })

  test('scope(traceId) scopes the inner logger and stamps the trace id', async () => {
    const { logger, written, sent } = setup()
    const scoped = logger.scope!('4bf92f3577b34da6a3ce929d0e0e4736')
    scoped.info('in request')
    assert.deepEqual(written, [
      'scoped(4bf92f3577b34da6a3ce929d0e0e4736):in request',
    ])
    const [record] = await sent()
    assert.equal(record!.traceId, '4bf92f3577b34da6a3ce929d0e0e4736')
  })

  test('a failing exporter never reaches the caller', () => {
    const exporter = {
      exportLogs() {
        throw new Error('sink down')
      },
    } as never
    const logger = new OtlpLogger(
      { info() {}, warn() {}, error() {}, debug() {}, setLevel() {} } as Logger,
      exporter
    )
    assert.doesNotThrow(() => logger.info('x'))
  })
})
