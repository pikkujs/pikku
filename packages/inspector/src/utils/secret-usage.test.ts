import { test, describe } from 'node:test'
import { strict as assert } from 'node:assert'
import { validateSecretUsage } from './post-process.js'
import type { InspectorState } from '../types.js'
import { ErrorCode, type CodedDiagnostic } from '../error-codes.js'

const stateWith = (
  keys: string[],
  authDefinition: unknown = null
): InspectorState =>
  ({
    rootDir: '/project',
    auth: { definition: authDefinition },
    secrets: {
      definitions: [],
      usage: new Map([['/project/src/auth.ts', { keys, dynamic: [] }]]),
    },
  }) as unknown as InspectorState

const collect = () => {
  const seen: CodedDiagnostic[] = []
  return {
    seen,
    logger: { diagnostic: (d: CodedDiagnostic) => seen.push(d) } as never,
  }
}

describe('validateSecretUsage', () => {
  test('an undeclared secret is reported', () => {
    const { seen, logger } = collect()
    validateSecretUsage(logger, stateWith(['BETTER_AUTH_SECRET']))
    assert.equal(seen.length, 1)
    assert.equal(seen[0]!.code, ErrorCode.SECRET_NOT_DECLARED)
  })

  test('BETTER_AUTH_SECRET counts as declared when the project has auth', () => {
    const { seen, logger } = collect()
    validateSecretUsage(logger, stateWith(['BETTER_AUTH_SECRET'], {}))
    assert.equal(seen.length, 0)
  })
})
