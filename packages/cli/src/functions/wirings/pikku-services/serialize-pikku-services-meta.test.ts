import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { serializePikkuServicesMeta } from './serialize-pikku-services-meta.js'

describe('serializePikkuServicesMeta', () => {
  test('modules become relative to the package root, posix, and variants keep what they need and provide', () => {
    const json = JSON.parse(
      serializePikkuServicesMeta(
        {
          inbox: {
            module: '/pkg/src/services/inbox.ts',
            export: 'inbox',
            variants: {
              dev: { needs: ['logger'], provides: ['inbox'] },
              deploy: {
                needs: ['kysely'],
                provides: ['inbox'],
                module: '/pkg/src/services/inbox.deploy.ts',
                export: 'inboxDeploy',
              },
            },
            onServerStart: true,
          },
          cache: {
            module: '/pkg/src/services.ts',
            export: 'cache',
            variants: { common: { needs: [], provides: ['cache'] } },
          },
        },
        '/pkg'
      )
    )
    assert.deepEqual(json, {
      services: {
        inbox: {
          module: 'src/services/inbox.ts',
          export: 'inbox',
          variants: {
            dev: { needs: ['logger'], provides: ['inbox'] },
            deploy: {
              needs: ['kysely'],
              provides: ['inbox'],
              module: 'src/services/inbox.deploy.ts',
              export: 'inboxDeploy',
            },
          },
          onServerStart: true,
        },
        cache: {
          module: 'src/services.ts',
          export: 'cache',
          variants: { common: { needs: [], provides: ['cache'] } },
        },
      },
    })
  })
})
