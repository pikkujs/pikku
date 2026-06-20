import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { serializeAddonRefs } from './serialize-addon-refs.js'

describe('serializeAddonRefs', () => {
  const state = {
    addonHttp: {
      ext: {
        helloRoutes: {
          basePath: '/ext',
          tags: [],
          routes: {
            hello: {
              method: 'get',
              route: '/hello',
              func: { pikkuFuncId: 'ext:hello' },
              auth: null,
              contentType: null,
              sse: null,
              timeout: null,
            },
          },
        },
      },
    },
    addonChannel: {
      ext: { helloChannel: { hello: { pikkuFuncId: 'ext:hello' } } },
    },
    addonCli: {
      ext: {
        helloCommands: {
          hello: { pikkuFuncId: 'ext:hello', positionals: [], options: {} },
        },
      },
    },
  }

  test('binds funcs to ref() and keys maps by namespace:contract', () => {
    const output = serializeAddonRefs(state)

    assert.match(output, /"ext:helloRoutes":/)
    assert.match(output, /"ext:helloChannel":/)
    assert.match(output, /"ext:helloCommands":/)

    // Each function is proxied via ref(), never value-imported.
    assert.match(output, /func: ref\("ext:hello"\)/)
    assert.doesNotMatch(output, /import .* from '@/)

    // HTTP route preserves method/route/basePath, drops null meta fields.
    assert.match(output, /"method": "get"/)
    assert.match(output, /"route": "\/hello"/)
    assert.match(output, /basePath: "\/ext"/)
    assert.doesNotMatch(output, /contentType/)

    // Helpers are exported for the #pikku barrel.
    assert.match(output, /export const refHTTP/)
    assert.match(output, /export const refChannel/)
    assert.match(output, /export const refCLI/)
  })

  test('emits empty maps when there are no addon contracts', () => {
    const output = serializeAddonRefs({
      addonHttp: {},
      addonChannel: {},
      addonCli: {},
    })
    assert.match(output, /const __addonHttp = \{\} as const/)
    assert.match(output, /export const refHTTP/)
  })
})
