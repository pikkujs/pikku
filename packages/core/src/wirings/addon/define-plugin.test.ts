import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { definePlugin } from './define-plugin.js'

describe('definePlugin', () => {
  test('returns the manifest it is given, new fields and all', () => {
    const manifest = {
      title: 't',
      screens: [],
      widgets: {
        mini: {
          title: 'w',
          description: 'd',
          states: ['full'] as const,
          actions: [] as const,
          component: () => Promise.resolve({ default: null }),
        },
      },
      arrangedScreens: {
        health: {
          path: '/health-next',
          title: 'h',
          scope: 'project' as const,
          source: 'healthScreen',
          slots: [{ widget: 'mini', from: 'mini' }],
        },
      },
    }
    assert.equal(definePlugin(manifest), manifest)
  })
})
