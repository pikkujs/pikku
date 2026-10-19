import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeContributorsMeta } from './serialize-contributors-meta.js'

describe('serializeContributorsMeta', () => {
  test('makes modules relative to the package root, posix', () => {
    const json = serializeContributorsMeta(
      {
        mail: {
          dev: { module: '/pkg/src/mail/dev.ts', export: 'mailDev' },
          deploy: { module: '/pkg/src/mail/deploy.ts', export: 'mailDeploy' },
        },
        dbOnly: { dev: { module: '/pkg/src/db.ts', export: 'default' } },
      },
      '/pkg'
    )
    assert.ok(json.endsWith('\n'))
    assert.deepEqual(JSON.parse(json), {
      contributors: {
        mail: {
          dev: { module: 'src/mail/dev.ts', export: 'mailDev' },
          deploy: { module: 'src/mail/deploy.ts', export: 'mailDeploy' },
        },
        dbOnly: { dev: { module: 'src/db.ts', export: 'default' } },
      },
    })
  })

  test('a contributor with no deploy variant has no deploy key', () => {
    const parsed = JSON.parse(
      serializeContributorsMeta(
        { x: { dev: { module: '/pkg/x.ts', export: 'x' } } },
        '/pkg'
      )
    )
    assert.deepEqual(Object.keys(parsed.contributors.x), ['dev'])
  })
})
