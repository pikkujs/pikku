import assert from 'node:assert/strict'
import { describe, test, beforeEach, before, after } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ts from 'typescript'
import { addPikkuStudio, validatePikkuStudio } from './add-pikku-studio.js'
import { addWireAddon } from './add-wire-addon.js'

let state: any
let criticals: string[] = []
let warnings: string[] = []

const logger = {
  debug: () => {},
  info: () => {},
  warn: (message: string) => {
    warnings.push(message)
  },
  error: () => {},
  critical: (code: string, message: string) => {
    criticals.push(`${code}: ${message}`)
  },
} as any

const inspect = (source: string, fileName = 'x.ts') => {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true
  )
  const visit = (node: ts.Node) => {
    addPikkuStudio(node, state, logger)
    addWireAddon(node, state, logger)
    ts.forEachChild(node, visit)
  }
  visit(file)
}

beforeEach(() => {
  criticals = []
  warnings = []
  state = {
    functions: { meta: {} },
    rpc: {
      wireAddonDeclarations: new Map(),
      usedAddons: new Set(),
      wireAddonFiles: new Set(),
    },
  }
})

describe('addPikkuStudio', () => {
  test('records every field of every screen as studio metadata', () => {
    inspect(`
      definePlugin({
        title: 'cloud.title',
        screens: [
          { path: '/billing', title: 'cloud.billing', scope: 'team',
            nav: { area: 'team', icon: 'credit-card', order: 30, badge: 'unpaidCount' },
            scopes: ['billing'], component: () => import('./screens/Billing.js') },
          { path: '/publish', title: 'cloud.publish', scope: 'project', replaces: true, needsApp: true,
            component: () => import('./screens/Publish.js') },
          { path: '/accept-invite', title: 'cloud.acceptInvite', scope: 'studio', layout: 'bare',
            app: './dist' },
        ],
      })
    `)
    assert.deepEqual(criticals, [])
    assert.equal(state.studio.title, 'cloud.title')
    assert.equal(state.studio.file, 'x.ts')
    assert.deepEqual(state.studio.screens, [
      {
        path: '/billing',
        title: 'cloud.billing',
        scope: 'team',
        nav: {
          area: 'team',
          icon: 'credit-card',
          order: 30,
          badge: 'unpaidCount',
        },
        scopes: ['billing'],
        component: './screens/Billing.js',
      },
      {
        path: '/publish',
        title: 'cloud.publish',
        scope: 'project',
        replaces: true,
        needsApp: true,
        component: './screens/Publish.js',
      },
      {
        path: '/accept-invite',
        title: 'cloud.acceptInvite',
        scope: 'studio',
        layout: 'bare',
        app: './dist',
      },
    ])
  })

  test('the deprecated pikkuStudio name is still recognised', () => {
    inspect(`pikkuStudio({ title: TITLE, screens: [] })`)
    assert.match(
      criticals[0] ?? '',
      /^PKU345: definePlugin's title must be a literal/
    )
  })

  test('a screen without nav is routed but carries no nav entry', () => {
    inspect(`
      definePlugin({
        title: 't',
        screens: [{ path: '/a', title: 'a', scope: 'team', component: () => import('./a') }],
      })
    `)
    assert.deepEqual(criticals, [])
    assert.equal(state.studio.screens[0].nav, undefined)
  })

  describe('fails the build on a non-literal field', () => {
    const cases: Record<string, string> = {
      path: `{ path: PATH, title: 'a', scope: 'team', component: () => import('./a') }`,
      title: `{ path: '/a', title: m.a(), scope: 'team', component: () => import('./a') }`,
      scope: `{ path: '/a', title: 'a', scope: SCOPE, component: () => import('./a') }`,
      component: `{ path: '/a', title: 'a', scope: 'team', component: loadIt }`,
      app: `{ path: '/a', title: 'a', scope: 'team', app: APP_DIR }`,
      nav: `{ path: '/a', title: 'a', scope: 'team', nav: NAV, component: () => import('./a') }`,
      'nav.area': `{ path: '/a', title: 'a', scope: 'team', nav: { area: AREA, icon: 'x', order: 1 }, component: () => import('./a') }`,
      'nav.icon': `{ path: '/a', title: 'a', scope: 'team', nav: { area: 'team', icon: ICON, order: 1 }, component: () => import('./a') }`,
      'nav.order': `{ path: '/a', title: 'a', scope: 'team', nav: { area: 'team', icon: 'x', order: ORDER }, component: () => import('./a') }`,
      'nav.badge': `{ path: '/a', title: 'a', scope: 'team', nav: { area: 'team', icon: 'x', order: 1, badge: BADGE }, component: () => import('./a') }`,
      replaces: `{ path: '/a', title: 'a', scope: 'team', replaces: REPLACES, component: () => import('./a') }`,
      needsApp: `{ path: '/a', title: 'a', scope: 'project', needsApp: NEEDS, component: () => import('./a') }`,
      layout: `{ path: '/a', title: 'a', scope: 'team', layout: LAYOUT, component: () => import('./a') }`,
      scopes: `{ path: '/a', title: 'a', scope: 'team', scopes: SCOPES, component: () => import('./a') }`,
      spread: `{ ...base, path: '/a', title: 'a', scope: 'team', component: () => import('./a') }`,
    }
    for (const [field, screen] of Object.entries(cases)) {
      test(field, () => {
        inspect(`definePlugin({ title: 't', screens: [${screen}] })`)
        assert.ok(criticals.length >= 1, `no critical for ${field}`)
        assert.match(criticals[0]!, /^PKU345: /)
        assert.deepEqual(state.studio.screens, [])
      })
    }

    test('the addon title', () => {
      inspect(`definePlugin({ title: TITLE, screens: [] })`)
      assert.match(
        criticals[0]!,
        /^PKU345: definePlugin's title must be a literal/
      )
      assert.equal(state.studio, undefined)
    })

    test('the screens list', () => {
      inspect(`definePlugin({ title: 't', screens: SCREENS })`)
      assert.match(
        criticals[0]!,
        /^PKU345: definePlugin's screens must be an array literal/
      )
    })
  })

  test('a scope outside studio, team and project is refused', () => {
    inspect(`
      definePlugin({ title: 't', screens: [{ path: '/a', title: 'a', scope: 'org', component: () => import('./a') }] })
    `)
    assert.match(
      criticals[0]!,
      /PKU345: A screen's scope must be one of 'studio', 'team', 'project'/
    )
  })

  test('rejects a screen that is both a component and an app', () => {
    inspect(`
      definePlugin({
        title: 'X',
        screens: [{ path: '/', title: 'A', scope: 'team', app: './a', component: () => import('./a') }],
      })
    `)
    assert.match(criticals[0]!, /one or the other/)
    assert.deepEqual(state.studio.screens, [])
  })

  test('fails the build on two screens with the same path', () => {
    inspect(`
      definePlugin({
        title: 't',
        screens: [
          { path: '/billing', title: 'a', scope: 'team', component: () => import('./a') },
          { path: '/billing', title: 'b', scope: 'project', component: () => import('./b') },
        ],
      })
    `)
    assert.deepEqual(criticals, [
      "PKU357: definePlugin declares two screens at '/billing'; each screen needs its own path",
    ])
  })
})

describe('addPikkuStudio agent', () => {
  test('reads a literal agent', () => {
    inspect(
      `definePlugin({ title: 't', screens: [{ path: '/a', title: 'a', scope: 'team', agent: 'helper', component: () => import('./a') }] })`
    )
    assert.equal(state.studio.screens[0].agent, 'helper')
    assert.deepEqual(criticals, [])
  })

  test('a non-literal agent fails with PKU345', () => {
    inspect(
      `definePlugin({ title: 't', screens: [{ path: '/a', title: 'a', scope: 'team', agent: NAME, component: () => import('./a') }] })`
    )
    assert.match(criticals[0]!, /^PKU345: A screen's agent must be a literal/)
  })
})

describe('validatePikkuStudio', () => {
  let root: string
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'pikku-studio-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'messages'), { recursive: true })
    writeFileSync(join(root, 'package.json'), '{"name":"@acme/addon-cloud"}')
    writeFileSync(
      join(root, 'messages', 'en.json'),
      JSON.stringify({
        $schema: 'https://inlang.com/schema/inlang-message-format',
        cloud_title: 'Cloud',
        cloud_billing: 'Billing',
      })
    )
    mkdirSync(join(root, 'agents'), { recursive: true })
    writeFileSync(
      join(root, 'agents', 'billing-helper.md'),
      '---\ntitle: cloud_billing\ndescription: "cloud_title"\n---\nYou are the billing agent. Follow the billing skill.\n'
    )
    writeFileSync(join(root, 'agents', 'empty.md'), '  \n')
    writeFileSync(join(root, 'agents', 'plain.md'), 'You are an agent.\n')
    writeFileSync(
      join(root, 'agents', 'no-desc.md'),
      '---\ntitle: cloud_billing\n---\nHi\n'
    )
    writeFileSync(
      join(root, 'agents', 'bad-key.md'),
      '---\ntitle: cloud_billing\ndescription: cloud_nope\n---\nHi\n'
    )
    writeFileSync(
      join(root, 'messages', 'de.json'),
      JSON.stringify({ cloud_title: 'Cloud' })
    )
  })
  after(() => rmSync(root, { recursive: true, force: true }))

  const studio = (title: string, screen: string) =>
    inspect(
      `definePlugin({ title: '${title}', screens: [${screen}] })`,
      join(root, 'src', 'screens.ts')
    )

  test('passes when every title is in the en catalog', () => {
    studio(
      'cloud_title',
      `{ path: '/billing', title: 'cloud_billing', scope: 'team', component: () => import('./a') }`
    )
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [])
  })

  test('fails the build on a screen title missing from en', () => {
    studio(
      'cloud_title',
      `{ path: '/plans', title: 'cloud_plans', scope: 'team', nav: { area: 'team', icon: 'x', order: 1 }, component: () => import('./a') }`
    )
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [
      "PKU358: definePlugin uses the message key 'cloud_plans', which is missing from the addon's messages/en.json",
    ])
  })

  test('fails the build on an addon title missing from en', () => {
    studio(
      'cloud_name',
      `{ path: '/billing', title: 'cloud_billing', scope: 'team', component: () => import('./a') }`
    )
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [
      "PKU358: definePlugin uses the message key 'cloud_name', which is missing from the addon's messages/en.json",
    ])
  })

  test('warns on a key missing from another locale', () => {
    studio(
      'cloud_title',
      `{ path: '/billing', title: 'cloud_billing', scope: 'team', component: () => import('./a') }`
    )
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [])
    assert.deepEqual(warnings, [
      "definePlugin uses the message key 'cloud_billing', which is missing from the addon's messages/de.json",
    ])
  })

  test('fails the build on a badge that names no function', () => {
    studio(
      'cloud_title',
      `{ path: '/billing', title: 'cloud_billing', scope: 'team', nav: { area: 'team', icon: 'x', order: 1, badge: 'unpaidCount' }, component: () => import('./a') }`
    )
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [
      "PKU359: Screen '/billing' has the nav badge 'unpaidCount', which names no function in this addon",
    ])
  })

  const agentScreen = (agent: string) =>
    studio(
      'cloud_title',
      `{ path: '/billing', title: 'cloud_billing', scope: 'team', agent: '${agent}', component: () => import('./a') }`
    )

  test('a screen agent with a file and frontmatter passes and records its keys', () => {
    agentScreen('billing-helper')
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [])
    assert.equal(state.studio.screens[0].agent, 'billing-helper')
    assert.equal(state.studio.screens[0].agentTitle, 'cloud_billing')
    assert.equal(state.studio.screens[0].agentDescription, 'cloud_title')
  })

  test('fails on an agent name that is not lowercase-hyphen', () => {
    agentScreen('Billing_Helper')
    validatePikkuStudio(logger, state)
    assert.match(criticals[0]!, /^PKU365: .*not a valid name/)
  })

  test('fails on an agent with no file', () => {
    agentScreen('ghost')
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [
      "PKU365: Screen '/billing' has the agent 'ghost', but the addon has no non-empty agents/ghost.md",
    ])
  })

  test('fails on an empty agent file', () => {
    agentScreen('empty')
    validatePikkuStudio(logger, state)
    assert.match(criticals[0]!, /^PKU365: .*no non-empty agents\/empty\.md/)
  })

  test('fails on an agent file without frontmatter', () => {
    agentScreen('plain')
    validatePikkuStudio(logger, state)
    assert.match(criticals[0]!, /^PKU365: .*has no frontmatter/)
  })

  test('fails on frontmatter missing the description', () => {
    agentScreen('no-desc')
    validatePikkuStudio(logger, state)
    assert.match(criticals[0]!, /^PKU365: .*frontmatter has no description/)
  })

  test('fails on a frontmatter key missing from en.json', () => {
    agentScreen('bad-key')
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [
      "PKU358: definePlugin uses the message key 'cloud_nope', which is missing from the addon's messages/en.json",
    ])
  })

  test('a badge that names a function of the addon passes', () => {
    studio(
      'cloud_title',
      `{ path: '/billing', title: 'cloud_billing', scope: 'team', nav: { area: 'team', icon: 'x', order: 1, badge: 'unpaidCount' }, component: () => import('./a') }`
    )
    state.functions.meta.unpaidCount = { pikkuFuncId: 'unpaidCount' }
    validatePikkuStudio(logger, state)
    assert.deepEqual(criticals, [])
  })
})

describe('wireAddon ui', () => {
  test('ui: true is recorded on the addon instance', () => {
    inspect(
      `wireAddon({ name: 'invoices', package: '@acme/addon-invoices', ui: true, scopes: ['admin'] })`
    )
    const declaration = state.rpc.wireAddonDeclarations.get('invoices')
    assert.equal(declaration.package, '@acme/addon-invoices')
    assert.equal(declaration.ui, true)
    assert.deepEqual(declaration.scopes, ['admin'])
  })

  test('wireAddon is not flagged', () => {
    inspect(`wireAddon({ name: 'x', package: '@acme/x' })`)
    assert.equal(state.rpc.wireAddonDeclarations.get('x').ui, undefined)
  })
})
