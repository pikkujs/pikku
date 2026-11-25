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

  test('kind, optional, profile variants, addTo, replaces and collections are carried through', () => {
    const json = JSON.parse(
      serializeProvidersMeta(
        {
          store: {
            kind: 'singleton',
            module: '/pkg/src/store.ts',
            export: 'store',
            variants: {
              common: { needs: [], provides: ['store'] },
              'deploy:cloudflare-worker': {
                needs: ['queueService'],
                optional: ['queueService'],
                provides: ['auditLog', 'store'],
                optionalProvides: ['auditLog'],
              },
            },
            replaces: ['logger'],
          },
          sink: {
            kind: 'singleton',
            module: '/pkg/src/sink.ts',
            export: 'sink',
            variants: { common: { needs: [], provides: [] } },
            addTo: 'sinks',
          },
          perRequest: {
            kind: 'wire',
            module: '/pkg/src/wire.ts',
            export: 'perRequest',
            variants: { common: { needs: ['logger'], provides: ['scope'] } },
          },
        },
        '/pkg',
        {
          sinks: {
            name: 'sinks',
            module: '/pkg/src/sinks.ts',
            export: 'sinks',
          },
        }
      )
    )
    assert.deepEqual(Object.keys(json.providers.store.variants), [
      'deploy:cloudflare-worker',
      'common',
    ])
    assert.deepEqual(json.providers.store.replaces, ['logger'])
    assert.deepEqual(
      json.providers.store.variants['deploy:cloudflare-worker'],
      {
        needs: ['queueService'],
        optional: ['queueService'],
        provides: ['auditLog', 'store'],
        optionalProvides: ['auditLog'],
      }
    )
    assert.equal(json.providers.sink.addTo, 'sinks')
    assert.equal(json.providers.perRequest.kind, 'wire')
    assert.deepEqual(json.collections, {
      sinks: { name: 'sinks', module: 'src/sinks.ts', export: 'sinks' },
    })
  })
})
