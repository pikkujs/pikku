import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  IncompatibleDeployTargetError,
  resolveDeployTarget,
} from './resolve-deploy-target.js'

describe('resolveDeployTarget', () => {
  test('default → serverless', () => {
    assert.strictEqual(resolveDeployTarget({}, new Set()), 'serverless')
  })

  test('explicit deploy: server → server', () => {
    assert.strictEqual(
      resolveDeployTarget({ deploy: 'server' }, new Set()),
      'server'
    )
  })

  test('explicit deploy: serverless with no incompatible svc → serverless', () => {
    assert.strictEqual(
      resolveDeployTarget(
        { deploy: 'serverless', services: { services: ['kysely'] } as any },
        new Set(['fs'])
      ),
      'serverless'
    )
  })

  test('serverlessIncompatible service forces server even without deploy flag', () => {
    assert.strictEqual(
      resolveDeployTarget(
        { services: { services: ['metaService'] } as any },
        new Set(['metaService'])
      ),
      'server'
    )
  })

  test('serverlessIncompatible takes precedence over explicit deploy: server', () => {
    assert.strictEqual(
      resolveDeployTarget(
        {
          deploy: 'server',
          services: { services: ['metaService'] } as any,
        },
        new Set(['metaService'])
      ),
      'server'
    )
  })

  test('explicit deploy: serverless + incompatible svc → throws', () => {
    assert.throws(
      () =>
        resolveDeployTarget(
          {
            deploy: 'serverless',
            services: { services: ['metaService', 'unrelated'] } as any,
          },
          new Set(['metaService']),
          'myFunction'
        ),
      (err: unknown) => {
        assert.ok(err instanceof IncompatibleDeployTargetError)
        assert.strictEqual(err.functionName, 'myFunction')
        assert.deepStrictEqual(err.incompatibleServices, ['metaService'])
        assert.match(err.message, /serverless-incompatible/)
        assert.match(err.message, /myFunction/)
        return true
      }
    )
  })

  test('multiple incompatible services are all reported', () => {
    assert.throws(
      () =>
        resolveDeployTarget(
          {
            deploy: 'serverless',
            services: {
              services: ['metaService', 'localContent'],
            } as any,
          },
          new Set(['metaService', 'localContent']),
          'multiSvc'
        ),
      (err: unknown) => {
        assert.ok(err instanceof IncompatibleDeployTargetError)
        assert.deepStrictEqual(err.incompatibleServices, [
          'metaService',
          'localContent',
        ])
        return true
      }
    )
  })

  test('handles funcMeta with no services field', () => {
    assert.strictEqual(
      resolveDeployTarget({ deploy: 'server' }, new Set(['metaService'])),
      'server'
    )
  })
})
