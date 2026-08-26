import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { ErrorCode } from '@pikku/inspector'
import { CLILogger } from './cli-logger.service.js'

/**
 * `pikku all` inspects several times in one run, because generating the
 * scaffold, the leaf indexes and the type files each changes the source graph
 * the next inspection reads. Every full inspection re-runs every validator, so
 * only the newest pass describes the project as it now stands.
 */
const silent = () => new CLILogger({ silent: true })

describe('CLILogger — validation passes supersede one another', () => {
  test('a later pass replaces what an earlier one recorded', () => {
    const logger = silent()

    logger.beginValidationPass()
    logger.critical(
      ErrorCode.INVALID_VALUE,
      "System role 'admin' grants scope 'virtualUser:*' which is not declared"
    )
    logger.endValidationPass()
    assert.equal(logger.hasCriticalErrors(), true)

    logger.beginValidationPass()
    logger.endValidationPass()
    assert.equal(
      logger.hasCriticalErrors(),
      false,
      'the scaffold now exists, so the complaint about it missing is stale'
    )
  })

  test('a genuine failure still fails when every pass reports it', () => {
    const logger = silent()

    for (const _ of [1, 2, 3]) {
      logger.beginValidationPass()
      logger.critical(ErrorCode.INVALID_VALUE, 'genuinely undeclared scope')
      logger.endValidationPass()
    }

    assert.equal(logger.hasCriticalErrors(), true)
    assert.equal(logger.hasBlockingDiagnostics(), true)
  })

  test('diagnostics recorded outside a pass are never discarded', () => {
    const logger = silent()

    logger.critical(ErrorCode.INVALID_VALUE, 'reported by a generator')
    logger.beginValidationPass()
    logger.endValidationPass()

    assert.equal(
      logger.hasCriticalErrors(),
      true,
      'only validation diagnostics are superseded'
    )
  })

  test('an unclosed pass is still counted', () => {
    const logger = silent()

    logger.beginValidationPass()
    logger.critical(ErrorCode.INVALID_VALUE, 'thrown out of mid-pass')

    assert.equal(logger.hasCriticalErrors(), true)
  })
})
