import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { serializeProvidersMeta } from './serialize-providers-meta.js'

describe('serializeProvidersMeta', () => {
  test('modules become relative to the package root, posix, and variants keep what they need and provide', () => {
    const json = JSON.parse(
      serializeProvidersMeta(
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
      metaVersion: 2,
      providers: {
        inbox: {
          kind: 'singleton',
          module: 'src/services/inbox.ts',
          export: 'inbox',
          variants: {
            dev: {
              needs: ['logger'],
              optional: [],
              provides: ['inbox'],
              optionalProvides: [],
            },
            deploy: {
              needs: ['kysely'],
              optional: [],
              provides: ['inbox'],
              optionalProvides: [],
              module: 'src/services/inbox.deploy.ts',
              export: 'inboxDeploy',
            },
          },
          onServerStart: true,
        },
        cache: {
          kind: 'singleton',
          module: 'src/services.ts',
          export: 'cache',
          variants: {
            common: {
              needs: [],
              optional: [],
              provides: ['cache'],
              optionalProvides: [],
            },
          },
        },
      },
      collections: {},
    })
  })
})
