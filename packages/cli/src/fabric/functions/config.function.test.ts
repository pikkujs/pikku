import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'
import { FabricPreconditionError } from '../lib/errors.js'

/**
 * The command against a faked fabric: with no arguments it reads the project's
 * settings, and with `key=value` arguments it sends them as one
 * `setProjectSettings` patch for the resolved project.
 */
const realConfig = { ...configLib }
const realHttp = { ...httpLib }
let override = true

let context: {
  token: string | null
  projectId: string | null
  project: { projectId: string; source: 'remote'; detail: string } | null
}
let responses: Record<string, unknown>
let failing: Record<string, Error>
const invoked: { name: string; data: unknown }[] = []

await mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override
      ? {
          apiUrl: 'https://fabric.test',
          apiUrlSource: 'default',
          ...context,
          project: opts?.resolveProject === false ? null : context.project,
        }
      : realConfig.resolveApiContext(opts),
}))

await mock.module('../lib/http.js', () => ({
  ...realHttp,
  getFabricRPC: (opts: any) =>
    override
      ? {
          invoke: async (name: string, data: unknown) => {
            invoked.push({ name, data })
            if (failing[name]) throw failing[name]
            return responses[name]
          },
        }
      : realHttp.getFabricRPC(opts),
}))

after(() => {
  override = false
})

const { FabricConfig, renderConfig, parseAssignments, settingEntries } =
  await import('./config.function.js')

const run = (data: Record<string, unknown>) =>
  FabricConfig.func({} as any, data as any, {} as any)

const printed = (result: unknown): string => {
  const lines: string[] = []
  const log = console.log
  console.log = (...args: unknown[]) => lines.push(args.join(' '))
  try {
    renderConfig(null, result as any)
  } finally {
    console.log = log
  }
  return lines.join('\n')
}

const settings = (overrides: Record<string, unknown> = {}) => ({
  showcase: { name: null, description: null, tags: [], tint: null },
  guide: { docs: null, theme: {} },
  scenarios: { env: {} },
  ...overrides,
})

describe('parseAssignments', () => {
  test('no arguments is no change', () => {
    assert.strictEqual(parseAssignments([]), null)
  })

  test('splits on the first = and reads an empty value as a clear', () => {
    assert.deepStrictEqual(
      parseAssignments([
        'showcase.name=Watering Log',
        'scenarios.env.QUERY=a=b',
        'showcase.tint=',
        ' guide.docs =docs',
      ]),
      {
        'showcase.name': 'Watering Log',
        'scenarios.env.QUERY': 'a=b',
        'showcase.tint': null,
        'guide.docs': 'docs',
      }
    )
  })

  test('refuses an argument with no key', () => {
    for (const bad of ['showcase.name', '=value', '  =x']) {
      assert.throws(
        () => parseAssignments([bad]),
        (error: Error) =>
          error instanceof FabricPreconditionError &&
          /write it as key=value/.test(error.message)
      )
    }
  })
})

describe('fabric config', () => {
  beforeEach(() => {
    context = {
      token: 'user-token',
      projectId: 'proj_1',
      project: { projectId: 'proj_1', source: 'remote', detail: 'origin' },
    }
    invoked.length = 0
    failing = {}
    responses = {
      getProjectSettings: {
        settings: settings({
          showcase: {
            name: 'Watering Log',
            description: null,
            tags: ['voice', 'realtime'],
            tint: null,
          },
        }),
      },
      setProjectSettings: {
        settings: settings({ guide: { docs: 'docs', theme: {} } }),
      },
    }
  })

  test('with no arguments, reads the settings and changes nothing', async () => {
    const result = await run({})
    assert.deepStrictEqual(invoked, [
      { name: 'getProjectSettings', data: { projectId: 'proj_1' } },
    ])
    assert.deepStrictEqual(result.changed, [])
    const out = printed(result)
    assert.match(out, /showcase\.name\s+Watering Log/)
    assert.match(out, /showcase\.tags\s+voice,realtime/)
    assert.doesNotMatch(out, /\[fabric\] set/)
  })

  test('sends every assignment as one patch for the resolved project', async () => {
    const result = await run({
      assignments: ['guide.docs=docs', 'showcase.tint='],
    })
    assert.deepStrictEqual(invoked, [
      {
        name: 'setProjectSettings',
        data: {
          projectId: 'proj_1',
          set: { 'guide.docs': 'docs', 'showcase.tint': null },
        },
      },
    ])
    assert.deepStrictEqual(result.changed, ['guide.docs', 'showcase.tint'])
    assert.strictEqual(result.settings?.guide.docs, 'docs')
    assert.match(
      printed(result),
      /\[fabric\] set guide\.docs, showcase\.tint\./
    )
  })

  test('a refused setting surfaces the server message', async () => {
    failing.setProjectSettings = new Error(
      'showcase.tint must be a #rrggbb hex colour — got "teal".'
    )
    await assert.rejects(
      () => run({ assignments: ['showcase.tint=teal'] }),
      /#rrggbb/
    )
  })

  test('setting needs a login and a project, and says which is missing', async () => {
    context = { token: null, projectId: null, project: null }
    await assert.rejects(
      () => run({ assignments: ['guide.docs=docs'] }),
      /Not logged in/
    )
    context = { token: 'user-token', projectId: null, project: null }
    await assert.rejects(
      () => run({ assignments: ['guide.docs=docs'] }),
      /No fabric project linked/
    )
    assert.deepStrictEqual(invoked, [])
  })

  test('a failed read is shown rather than failing the command', async () => {
    failing.getProjectSettings = new Error('Forbidden')
    const result = await run({})
    assert.strictEqual(result.settings, null)
    assert.strictEqual(result.settingsError, 'Forbidden')
    assert.match(printed(result), /settings\s+Forbidden/)
  })

  test('logged out, the settings are not asked for', async () => {
    context = { token: null, projectId: null, project: null }
    const result = await run({})
    assert.deepStrictEqual(invoked, [])
    assert.strictEqual(result.settings, null)
  })

  test('empty settings point at the command that sets them', async () => {
    responses.getProjectSettings = { settings: settings() }
    assert.match(
      printed(await run({})),
      /none — set them with `pikku fabric config key=value`/
    )
  })
})

describe('settingEntries', () => {
  test('lists only what holds a value, in the form key=value takes', () => {
    assert.deepStrictEqual(
      settingEntries(
        settings({
          guide: { docs: null, theme: { primaryColor: 'teal' } },
          scenarios: { env: { STRIPE_MODE: 'test' } },
        }) as any
      ),
      [
        ['guide.theme.primaryColor', 'teal'],
        ['scenarios.env.STRIPE_MODE', 'test'],
      ]
    )
  })
})
