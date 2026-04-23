import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { LogLevel } from '@pikku/core/services'
import { CLILogger } from './cli-logger.service.js'

function captureStdout(run: () => void): string[] {
  const lines: string[] = []
  const originalWrite = process.stdout.write.bind(process.stdout)

  ;(process.stdout.write as unknown as (chunk: unknown) => boolean) = (
    chunk: unknown
  ) => {
    lines.push(typeof chunk === 'string' ? chunk : String(chunk))
    return true
  }

  try {
    run()
  } finally {
    ;(process.stdout.write as unknown as typeof process.stdout.write) =
      originalWrite as typeof process.stdout.write
  }

  return lines
}

describe('CLILogger json output mode', () => {
  test('emits NDJSON for info logs', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.debug)
    logger.setOutputMode('json')

    const lines = captureStdout(() => {
      logger.info({ message: 'Generating types', type: 'timing' })
    })

    assert.strictEqual(lines.length, 1)
    const payload = JSON.parse(lines[0]!.trim())
    assert.strictEqual(payload.level, 'info')
    assert.strictEqual(payload.message, 'Generating types')
    assert.strictEqual(payload.type, 'timing')
    assert.ok(typeof payload.timestamp === 'string')
  })

  test('strips ANSI escape codes in json mode', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.info)
    logger.setOutputMode('json')

    const lines = captureStdout(() => {
      logger.info('\x1b[31mRed Message\x1b[0m')
    })

    const payload = JSON.parse(lines[0]!.trim())
    assert.strictEqual(payload.message, 'Red Message')
  })

  test('emits structured critical output with code', () => {
    const logger = new CLILogger({ logLogo: false, silent: false })
    logger.setLevel(LogLevel.debug)
    logger.setOutputMode('json')

    const lines = captureStdout(() => {
      logger.critical('PKU111' as any, 'Duplicate function name')
    })

    const payload = JSON.parse(lines[0]!.trim())
    assert.strictEqual(payload.level, 'critical')
    assert.strictEqual(payload.code, 'PKU111')
    assert.match(payload.url, /pku111$/)
    assert.match(payload.message, /\[PKU111\]/)
  })
})
