import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { ConsoleLogger } from './logger-console.js'
import { LogLevel } from './logger.js'

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger
  let captured: { method: string; args: any[] }[]
  let origConsole: Record<string, any>

  beforeEach(() => {
    logger = new ConsoleLogger()
    captured = []
    origConsole = {
      trace: console.trace,
      debug: console.debug,
      info: console.info,
      warn: console.warn,
      error: console.error,
      log: console.log,
    }
    console.trace = (...args: any[]) => captured.push({ method: 'trace', args })
    console.debug = (...args: any[]) => captured.push({ method: 'debug', args })
    console.info = (...args: any[]) => captured.push({ method: 'info', args })
    console.warn = (...args: any[]) => captured.push({ method: 'warn', args })
    console.error = (...args: any[]) => captured.push({ method: 'error', args })
    console.log = (...args: any[]) => captured.push({ method: 'log', args })
  })

  // Restore console after each test
  test('should log info at default level', () => {
    logger.info('test message')
    assert.strictEqual(captured.length, 1)
    assert.strictEqual(captured[0].method, 'info')
    assert.ok(captured[0].args.includes('test message'))
    Object.assign(console, origConsole)
  })

  test('should not log debug at default info level', () => {
    logger.debug('debug message')
    assert.strictEqual(captured.length, 0)
    Object.assign(console, origConsole)
  })

  test('should log debug when level is set to debug', () => {
    logger.setLevel(LogLevel.debug)
    logger.debug('debug message')
    assert.strictEqual(captured.length, 1)
    assert.strictEqual(captured[0].method, 'debug')
    Object.assign(console, origConsole)
  })

  test('should log warn at info level', () => {
    logger.warn('warning')
    assert.strictEqual(captured.length, 1)
    assert.strictEqual(captured[0].method, 'warn')
    Object.assign(console, origConsole)
  })

  test('should log error at info level', () => {
    logger.error('error message')
    assert.strictEqual(captured.length, 1)
    assert.strictEqual(captured[0].method, 'error')
    Object.assign(console, origConsole)
  })

  test('should log Error instance with stack trace', () => {
    const err = new Error('test error')
    logger.error(err)
    assert.strictEqual(captured.length, 2) // error message + stack
    assert.ok(captured[0].args.includes('test error'))
    assert.strictEqual(captured[1].args[0], 'STACK:')
    Object.assign(console, origConsole)
  })

  test('should not log info when level is error', () => {
    logger.setLevel(LogLevel.error)
    logger.info('info')
    logger.warn('warn')
    logger.debug('debug')
    assert.strictEqual(captured.length, 0)
    Object.assign(console, origConsole)
  })

  test('should log error when level is error', () => {
    logger.setLevel(LogLevel.error)
    logger.error('critical')
    assert.strictEqual(captured.length, 1)
    Object.assign(console, origConsole)
  })

  test('should support trace level when enabled', () => {
    logger.setLevel(LogLevel.trace)
    logger.trace!('trace message')
    assert.strictEqual(captured.length, 1)
    assert.strictEqual(captured[0].method, 'trace')
    Object.assign(console, origConsole)
  })

  test('should log with additional metadata', () => {
    logger.info('message', { extra: 'data' })
    assert.ok(captured[0].args.includes('message'))
    Object.assign(console, origConsole)
  })

  test('should handle object messages in info', () => {
    logger.info({ key: 'value' })
    assert.strictEqual(captured.length, 1)
    Object.assign(console, origConsole)
  })

  test('log method should respect level', () => {
    logger.setLevel(LogLevel.error)
    logger.log('info', 'should not show')
    assert.strictEqual(captured.length, 0)
    Object.assign(console, origConsole)
  })
})
