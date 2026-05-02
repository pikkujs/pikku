import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { LogLevel } from '@pikku/core/services'
import { CLILogger } from './cli-logger.service.js'

function captureStream(stream: NodeJS.WriteStream, run: () => void): string[] {
  const lines: string[] = []
  const originalWrite = stream.write.bind(stream)

  ;(stream.write as unknown as (chunk: unknown) => boolean) = (
    chunk: unknown
  ) => {
    lines.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }

  try {
    run()
  } finally {
    ;(stream.write as unknown as typeof stream.write) =
      originalWrite as typeof stream.write
  }

  return lines
}

const captureStderr = (run: () => void) => captureStream(process.stderr, run)
const captureStdout = (run: () => void) => captureStream(process.stdout, run)

describe('CLILogger json output mode', () => {
  test('writes json logs immediately (streaming, no buffering)', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.debug)
    logger.setOutputMode('json')

    const lines = captureStderr(() => {
      logger.info({ message: 'Generating types', type: 'timing' })
    })

    assert.strictEqual(lines.length, 1)
    const payload = JSON.parse(lines[0]!.trim())
    assert.strictEqual(payload.level, 'info')
    assert.strictEqual(payload.message, 'Generating types')
    assert.strictEqual(payload.type, 'timing')
    assert.ok(typeof payload.timestamp === 'string')
  })

  test('flushJSONBuffer is a safe no-op (records already written)', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.debug)
    logger.setOutputMode('json')

    captureStderr(() => {
      logger.info('first')
    })
    const lines = captureStderr(() => {
      logger.flushJSONBuffer()
    })
    assert.strictEqual(lines.length, 0)
  })

  test('strips ANSI escape codes in json mode', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.info)
    logger.setOutputMode('json')

    const lines = captureStderr(() => {
      logger.info('\x1b[31mRed Message\x1b[0m')
    })

    const payload = JSON.parse(lines[0]!.trim())
    assert.strictEqual(payload.message, 'Red Message')
  })

  test('emits structured critical output with code', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.debug)
    logger.setOutputMode('json')

    const lines = captureStderr(() => {
      logger.critical('PKU111' as any, 'Duplicate function name')
    })

    const payload = JSON.parse(lines[0]!.trim())
    assert.strictEqual(payload.level, 'critical')
    assert.strictEqual(payload.code, 'PKU111')
    assert.match(payload.url, /pku111$/)
    assert.match(payload.message, /\[PKU111\]/)
  })

  test('carries structured data payload on info/debug', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.debug)
    logger.setOutputMode('json')

    const lines = captureStderr(() => {
      logger.info({
        message: '[bundler] building worker',
        type: 'progress',
        data: { progress: { step: 'bundler', detail: 'building worker' } },
      })
    })

    const payload = JSON.parse(lines[0]!.trim())
    assert.strictEqual(payload.type, 'progress')
    assert.deepStrictEqual(payload.data, {
      progress: { step: 'bundler', detail: 'building worker' },
    })
  })

  test('switching to text mode stops json emission', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.info)
    logger.setOutputMode('json')

    logger.setOutputMode('text')

    const textLines = captureStdout(() => {
      logger.info('\x1b[31mRed Message\x1b[0m')
    })
    // text mode writes to stdout via console.log, which is a single
    // chunk with a trailing newline
    assert.strictEqual(textLines.length, 1)
    // ANSI codes are preserved in text mode (chalk re-adds them)
    assert.ok(!textLines[0]!.startsWith('{'))
  })
})
