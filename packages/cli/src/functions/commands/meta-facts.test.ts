import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { I18nApp } from '@pikku/code-edit/i18n'
import {
  agentRunnerFacts,
  formatProjectFacts,
  frontendFacts,
  readSources,
  textFacts,
  type ProjectFacts,
} from './meta-facts.js'

const project = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'meta-facts-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

const nothing: ProjectFacts = {
  agents: [],
  models: {},
  configFile: 'pikku.config.json',
  runner: null,
  texts: [],
  frontends: [],
}

describe('agentRunnerFacts', () => {
  const services = `
    const url = process.env.GATEWAY_URL ?? null
    const key = process.env.GATEWAY_KEY ?? 'value-not-to-print'
    // Written as acme/fast or other/slow-1.5 by a declaration.
    const runner = new vercel.SomeAgentRunner({
      acme: gateway,
      other: gateway({ nested: true }),
    })`

  test('names the runner, its providers, env names and models', () => {
    const root = project({ 'src/services.ts': services })
    assert.deepEqual(agentRunnerFacts(join(root, 'src/services.ts'), root), {
      runner: 'SomeAgentRunner',
      source: 'src/services.ts',
      providers: ['acme', 'other'],
      env: ['GATEWAY_URL', 'GATEWAY_KEY'],
      models: ['acme/fast', 'other/slow-1.5'],
    })
  })

  test('never carries an environment value', () => {
    const root = project({ 'src/services.ts': services })
    const facts = agentRunnerFacts(join(root, 'src/services.ts'), root)
    assert.ok(!JSON.stringify(facts).includes('value-not-to-print'))
  })

  test('ignores an env read far from the runner', () => {
    const padding = '\n'.repeat(100)
    const root = project({
      's.ts': `const far = process.env.FAR${padding}new XAgentRunner(options)`,
    })
    assert.deepEqual(agentRunnerFacts(join(root, 's.ts'), root)?.env, [])
  })

  test('a services file without a runner, or none at all, has no facts', () => {
    const root = project({ 's.ts': 'export const a = 1' })
    assert.equal(agentRunnerFacts(join(root, 's.ts'), root), null)
    assert.equal(agentRunnerFacts(join(root, 'missing.ts'), root), null)
  })
})

describe('textFacts', () => {
  const app = (
    locales: I18nApp['locales'],
    extra?: Partial<I18nApp>
  ): I18nApp => ({
    app: 'apps/web',
    messagesDir: 'apps/web/messages',
    baseLocale: 'en',
    defaultLocale: null,
    locales,
    catalogs: [],
    duplicates: [],
    ...extra,
  })

  test('reads locales, keys, areas and the import the code uses', () => {
    const root = project({
      'apps/web/src/a.tsx': `import { m, asKey } from '@/copy'\nimport * as x from 'y'`,
      'apps/web/src/b.tsx': `import { m } from '@/copy'`,
      'apps/web/src/c.tsx': `import { m as raw } from '../paraglide/messages.js'`,
    })
    const facts = textFacts(
      app(
        {
          en: { $schema: 'x', nav__a: 'A', nav__b: 'B', home__c: 'C' },
          fr: { nav__a: 'Ah', nav__b: 'Bé', home__c: 'Cé' },
        },
        { defaultLocale: 'fr' }
      ),
      join(root, 'apps/web'),
      root
    )
    assert.deepEqual(facts.locales, ['en', 'fr'])
    assert.equal(facts.keys, 3)
    assert.equal(facts.source, 'apps/web/messages/{locale}.json')
    assert.equal(facts.separator, '__')
    assert.deepEqual(facts.areas, ['nav', 'home'])
    assert.deepEqual(facts.usage, { names: ['m', 'asKey'], from: '@/copy' })
    assert.equal(facts.repeats, undefined)
  })

  test('says when a locale repeats most of the base text', () => {
    const root = project({ 'apps/web/src/a.ts': 'export {}' })
    const facts = textFacts(
      app({ en: { a: 'x', b: 'y', c: 'z' }, de: { a: 'x', b: 'y', c: 'q' } }),
      join(root, 'apps/web'),
      root
    )
    assert.deepEqual(facts.repeats, { locale: 'de', keys: 2 })
    assert.deepEqual(facts.areas, [])
    assert.equal(facts.usage, undefined)
  })
})

describe('frontendFacts', () => {
  const screens = [
    { kind: 'screen', name: '/app', source: 'apps/web/src/Shell.tsx' },
    { kind: 'screen', name: '/a', source: 'apps/web/src/views/A.tsx' },
    { kind: 'screen', name: '/b', source: 'apps/web/src/views/B.tsx' },
    { kind: 'screen', name: '/z', source: 'apps/web2/src/views/Z.tsx' },
  ]
  const files = {
    'apps/web/src/routes/app.tsx': 'export {}',
    'apps/web/src/Shell.tsx': `import { SideNav } from './SideNav'\nimport { Footer } from './Footer'\nconst S = () => <Outlet />`,
    'apps/web/src/SideNav.tsx': 'export const SideNav = 1',
    'apps/web/src/Footer.tsx': 'export const Footer = 1',
    'apps/web/src/views/A.tsx': `import { usePikkuQuery } from '@acme/sdk/api.gen'\nimport { Button } from '@acme/kit/ui/button'`,
    'apps/web/src/views/B.tsx': `import { usePikkuMutation } from '@acme/sdk/api.gen'\nimport { usePikkuAgent } from '@pikku/react'\nimport { Card } from '@acme/kit/ui/card'`,
    'apps/web/src/client.ts': `import { PikkuRPC } from '@acme/sdk/pikku-rpc.gen'`,
    'apps/web2/src/views/Z.tsx': 'export {}',
    'node_modules/@acme/kit/src/ui/button.tsx': 'export {}',
    'node_modules/@acme/kit/src/ui/card.tsx': 'export {}',
    'node_modules/@acme/kit/src/ui/dialog.tsx': 'export {}',
    'node_modules/@acme/kit/src/ui/dialog.stories.tsx': 'export {}',
    'node_modules/@acme/kit/src/ui/index.ts': 'export {}',
  }

  test('finds where things live from what the code does', () => {
    const root = project(files)
    assert.deepEqual(
      frontendFacts(
        join(root, 'apps/web'),
        root,
        screens,
        'packages/sdk/pikku-rpc.gen.ts'
      ),
      {
        app: 'apps/web',
        routes: 'apps/web/src/routes',
        pages: 'apps/web/src/views',
        shells: ['apps/web/src/Shell.tsx'],
        nav: 'apps/web/src/SideNav.tsx',
        hooks: {
          names: ['usePikkuQuery', 'usePikkuMutation'],
          from: '@acme/sdk/api.gen',
        },
        rpc: 'apps/web/src/client.ts',
        uiKit: { from: '@acme/kit/ui', names: ['button', 'card', 'dialog'] },
      }
    )
  })

  test('a local kit resolves inside the frontend', () => {
    const root = project({
      'apps/web/src/a.tsx': `import { B } from '@/components/ui/button'`,
      'apps/web/src/components/ui/button.tsx': 'export {}',
      'apps/web/src/components/ui/tabs.tsx': 'export {}',
    })
    assert.deepEqual(frontendFacts(join(root, 'apps/web'), root, [])?.uiKit, {
      from: '@/components/ui',
      names: ['button', 'tabs'],
    })
  })

  test('an unresolved kit lists what the code imports', () => {
    const root = project({
      'apps/web/src/a.tsx': `import { B } from '@gone/kit/ui/button'`,
    })
    assert.deepEqual(frontendFacts(join(root, 'apps/web'), root, [])?.uiKit, {
      from: '@gone/kit/ui',
      names: ['button'],
    })
  })

  test('generated and compiled sources are not scanned', () => {
    const root = project({
      'apps/web/src/a.ts': 'export {}',
      'apps/web/src/routeTree.gen.ts': 'export {}',
      'apps/web/src/paraglide/messages.ts': 'export {}',
      'apps/web/src/a.test.ts': 'export {}',
    })
    const files = readSources(join(root, 'apps/web')).map((s) => s.file)
    assert.deepEqual(files, [join(root, 'apps/web/src/a.ts')])
  })

  test('a folder with no sources is no frontend', () => {
    const root = project({ 'apps/web/package.json': '{}' })
    assert.equal(frontendFacts(join(root, 'apps/web'), root, []), null)
  })
})

describe('formatProjectFacts', () => {
  test('a project without a frontend or text prints only agents and models', () => {
    assert.deepEqual(formatProjectFacts(nothing), [
      'agents: none yet',
      'model aliases: none yet; add in pikku.config.json "models" as "alias": "provider/model"',
    ])
  })

  test('prints declared agents and aliases', () => {
    const lines = formatProjectFacts({
      ...nothing,
      agents: ['helper'],
      models: { cheap: 'acme/fast' },
    })
    assert.equal(lines[0], 'agents: helper')
    assert.match(lines[1]!, /^model aliases: cheap=acme\/fast; add in /)
  })

  test('a frontend with nothing found prints nothing for it', () => {
    assert.deepEqual(
      formatProjectFacts({
        ...nothing,
        frontends: [{ app: 'apps/web', shells: [] }],
      }),
      formatProjectFacts(nothing)
    )
  })

  test('text lines name each locale, and --app when there are several', () => {
    const text = {
      app: 'apps/web',
      locales: ['en', 'fr'],
      baseLocale: 'en',
      defaultLocale: 'fr',
      source: 'apps/web/messages/{locale}.json',
      keys: 3,
      repeats: { locale: 'fr', keys: 2 },
      separator: '__',
      areas: ['nav'],
      usage: { names: ['m'], from: '@/copy' },
    }
    const one = formatProjectFacts({ ...nothing, texts: [text] }).slice(2)
    assert.deepEqual(one, [
      'text: en, fr; base en; opens in fr; source apps/web/messages/{locale}.json, 3 keys; fr has the same text as en in 2',
      `text use: import { m } from '@/copy'; add with pikku i18n key <name> en="…" fr="…"`,
      'keys <area>__<name>; largest areas nav',
    ])
    const two = formatProjectFacts({ ...nothing, texts: [text, text] })
    assert.match(two[3]!, / --app apps\/web$/)
  })

  test('client and ui lines say where things are', () => {
    const lines = formatProjectFacts({
      ...nothing,
      generated: 'packages/sdk',
      frontends: [
        {
          app: 'apps/web',
          routes: 'apps/web/src/routes',
          pages: 'apps/web/src/views',
          shells: ['apps/web/src/Shell.tsx'],
          nav: 'apps/web/src/SideNav.tsx',
          hooks: { names: ['usePikkuQuery'], from: '@acme/sdk/api.gen' },
          rpc: 'apps/web/src/client.ts',
          uiKit: { from: '@acme/kit/ui', names: ['button'] },
        },
      ],
    }).slice(2)
    assert.deepEqual(lines, [
      `client: import { usePikkuQuery } from '@acme/sdk/api.gen'; rpc client apps/web/src/client.ts; generated packages/sdk`,
      'ui: routes apps/web/src/routes; pages apps/web/src/views; shell apps/web/src/Shell.tsx; nav apps/web/src/SideNav.tsx',
      'ui kit (@acme/kit/ui/<name>): button',
    ])
  })
})
