import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  dbColumnRows,
  dbTableRows,
  emailLocales,
  emailRows,
  formatCompactContext,
  formatMetaMatches,
  formatMetaRows,
  interfaceRows,
  matchMetaRows,
  metaWords,
  parseDbSchema,
  withConstraints,
  parseMetaTerms,
  routesDirOf,
  rpcsReachedFrom,
  screenRows,
  translationRows,
} from './meta-lines.js'

const SCHEMA = `
export interface PracticeUser {
  id: Generated<string>
  email: ColumnType<Pii<string>, string, string>
  role: ColumnType<Private<'admin' | 'member, or more'> | null, string | null, string | null>
  meta: ColumnType<Private<Record<string, Array<number>>>, string, string>
}

export interface DB {
  practiceUser: PracticeUser
  empty: Missing
}
`

const project = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'pikku-meta-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

describe('parseDbSchema', () => {
  const [table, empty] = parseDbSchema(SCHEMA)

  test('names tables from the DB interface, not the type', () => {
    assert.equal(table!.table, 'practiceUser')
  })

  test('takes a column type out of its wrappers', () => {
    const byName = new Map(table!.columns.map((c) => [c.name, c]))
    assert.deepEqual(byName.get('id'), {
      name: 'id',
      type: 'string',
      nullable: false,
      generated: true,
      classification: null,
    })
    assert.equal(byName.get('email')!.classification, 'pii')
    assert.equal(byName.get('email')!.type, 'string')
    assert.equal(byName.get('role')!.nullable, true)
    assert.equal(byName.get('role')!.type, "'admin' | 'member, or more'")
    assert.equal(byName.get('meta')!.type, 'Record<string, Array<number>>')
  })

  test('keeps a table whose interface it cannot find', () => {
    assert.deepEqual(empty, { table: 'empty', columns: [] })
  })

  test('lists column names, then types on request', () => {
    assert.equal(dbTableRows([table!])[0]!.detail, 'id, email, role, meta')
    assert.equal(dbColumnRows(table!)[1]!.detail, 'string pii')
    assert.equal(dbColumnRows(table!)[0]!.detail, 'string generated')
  })
})

describe('routesDirOf', () => {
  const route = `export const Route = createFileRoute('/admin')({ component: () => usePikkuQuery('listAdmin', {}) })`

  test('follows the routesDirectory the vite config names', () => {
    const root = project({
      'vite.config.ts': `tanstackStart({ router: { routesDirectory: 'src/views' } })`,
      'src/views/admin.tsx': route,
      'src/routes/ignored.tsx': route,
    })
    assert.equal(routesDirOf(root), join(root, 'src/views'))
    assert.equal(screenRows(root, root)[0]?.name, '/admin')
  })

  test('falls back to src/pages when src/routes is absent', () => {
    const root = project({ 'src/pages/admin.tsx': route })
    assert.equal(routesDirOf(root), join(root, 'src/pages'))
    assert.equal(screenRows(root, root)[0]?.detail, 'listAdmin')
  })

  test('is null for a frontend with no routes', () => {
    assert.equal(routesDirOf(project({ 'src/main.tsx': '' })), null)
  })
})

describe('screenRows', () => {
  const root = project({
    'apps/app/src/routes/app.tests.tsx': `
      import { createFileRoute } from '@tanstack/react-router'
      import { TestsPage } from '@/pages/TestsPage'
      export const Route = createFileRoute('/app/tests/')({ component: TestsPage })
    `,
    'apps/app/src/routes/__root.tsx': `export const Route = createRootRoute({})`,
    'apps/app/src/routes/inline.tsx': `
      export const Route = createFileRoute('/inline')({ component: Local })
      const Local = () => usePikkuQuery('getInline', {})
    `,
    'apps/app/src/pages/TestsPage.tsx': `
      import { Row } from '../components/Row'
      import { z } from 'zod'
      export const TestsPage = () => usePikkuQuery<Tests>('listTests', {})
    `,
    'apps/app/src/components/Row.tsx': `
      import { TestsPage } from '../pages/TestsPage'
      export const Row = () => usePikkuMutation(
        'admin:closeTest'
      )
    `,
  })
  const app = join(root, 'apps/app')

  test('maps a route to its page and the RPCs its components reach', () => {
    assert.deepEqual(screenRows(app, root)[0], {
      kind: 'screen',
      name: '/app/tests/',
      detail: 'admin:closeTest, listTests',
      source: 'apps/app/src/pages/TestsPage.tsx',
    })
  })

  test('falls back to the route file when the component is local', () => {
    const inline = screenRows(app, root).find((r) => r.name === '/inline')!
    assert.equal(inline.source, 'apps/app/src/routes/inline.tsx')
    assert.equal(inline.detail, 'getInline')
  })

  test('skips the root route and a project with no routes', () => {
    assert.equal(screenRows(app, root).length, 2)
    assert.deepEqual(screenRows(join(root, 'nope'), root), [])
  })

  test('survives an import cycle', () => {
    assert.deepEqual(
      rpcsReachedFrom(join(app, 'src/components/Row.tsx'), app),
      ['admin:closeTest', 'listTests']
    )
  })
})

describe('emails', () => {
  const root = project({
    'emails/templates/invite.html': '<p>{{ name }} {{t.body}}</p>',
    'emails/templates/invite.subject.txt': 'Hello {{name}}',
    'emails/templates/bye.html': '<p>bye</p>',
    'emails/locales/en.json': '{}',
    'emails/locales/de.json': '{}',
  })

  test('groups a template with its parts and collects its data', () => {
    assert.deepEqual(emailRows(join(root, 'emails'), root), [
      {
        kind: 'email',
        name: 'bye',
        detail: undefined,
        source: 'emails/templates/bye.html',
      },
      {
        kind: 'email',
        name: 'invite',
        detail: 'name, t.body',
        source: 'emails/templates/invite.html',
      },
    ])
  })

  test('reads the locales and tolerates a project with no emails', () => {
    assert.deepEqual(emailLocales(join(root, 'emails')), ['de', 'en'])
    assert.deepEqual(emailRows(join(root, 'none'), root), [])
    assert.deepEqual(emailLocales(join(root, 'none')), [])
  })
})

describe('interfaceRows', () => {
  const root = project({
    'types.d.ts': `
      export interface UserSession extends CoreUserSession {
        // not a field
        userId: string
        role?: 'admin' | 'member'
        nested: {
          inner: string
        }
      }
    `,
  })

  test('reads top-level members only', () => {
    const rows = interfaceRows(
      'session',
      join(root, 'types.d.ts'),
      'UserSession'
    )
    assert.deepEqual(
      rows.map((row) => row.name),
      ['userId', 'role', 'nested']
    )
    assert.equal(rows[1]!.detail, "optional 'admin' | 'member'")
  })

  test('returns nothing for a missing file or interface', () => {
    assert.deepEqual(interfaceRows('s', join(root, 'x.ts'), 'A'), [])
    assert.deepEqual(interfaceRows('s', join(root, 'types.d.ts'), 'A'), [])
  })
})

describe('translationRows', () => {
  const root = project({
    'apps/app/messages/en.json': JSON.stringify({
      $schema: 'x',
      team__invite: 'Invite someone',
      nested: { title: 'Title' },
    }),
    'apps/app/messages/de.json': '{"team__invite":"Einladung senden"}',
    'apps/app/messages/broken.json': '{',
  })

  test('gives one row per key with its text in every locale', () => {
    assert.deepEqual(translationRows(join(root, 'apps/app/messages'), root), [
      {
        kind: 'translation',
        name: 'team__invite',
        detail: 'de: Einladung senden | en: Invite someone',
        source: 'apps/app/messages',
      },
      {
        kind: 'translation',
        name: 'nested.title',
        detail: 'en: Title',
        source: 'apps/app/messages',
      },
    ])
  })

  test('tolerates a project with no messages', () => {
    assert.deepEqual(translationRows(join(root, 'none'), root), [])
  })
})

describe('matching', () => {
  const row = (name: string, detail?: string, source?: string) => ({
    kind: 'function',
    name,
    detail,
    source,
  })

  test('splits camelCase, snake_case, kebab-case, paths and acronyms', () => {
    assert.deepEqual(metaWords('sendInvite_email-now/HTMLParser2'), [
      'send',
      'invite',
      'email',
      'now',
      'html',
      'parser',
      '2',
    ])
    assert.deepEqual(metaWords('Einladung دعوة'), ['einladung', 'دعوة'])
  })

  test('reads several terms and a|b as alternatives', () => {
    assert.deepEqual(parseMetaTerms(['invit|einlad', ' team ', '|', '__']), [
      'invit',
      'einlad',
      'team',
    ])
  })

  test('matches word prefixes, not the middle of a word', () => {
    const rows = [row('sendInvitation'), row('reinvite')]
    assert.deepEqual(
      matchMetaRows(rows, ['invit']).rows.map((r) => r.name),
      ['sendInvitation']
    )
  })

  test('matches any term, in any case, across name, detail and path', () => {
    const rows = [
      row('a', 'Sends an INVITE'),
      row('b', undefined, 'src/team/b.ts'),
      row('c'),
    ]
    assert.deepEqual(
      matchMetaRows(rows, ['invite', 'team']).rows.map((r) => r.name),
      ['a', 'b']
    )
  })

  test('ranks by terms hit, then exact name, name words, then text', () => {
    const rows = [
      row('inDetail', 'invite'),
      row('sendInvite'),
      row('Invite'),
      row('teamInvite'),
    ]
    assert.deepEqual(
      matchMetaRows(rows, ['invite', 'team']).rows.map((r) => r.name),
      ['teamInvite', 'Invite', 'sendInvite', 'inDetail']
    )
  })

  test('caps the matches and counts the rest', () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(`invite${i}`))
    const { rows: shown, rest } = matchMetaRows(rows, ['invite'])
    assert.equal(shown.length, 20)
    assert.equal(rest, 5)
    assert.ok(
      formatMetaMatches({ rows: shown, rest }, ['x']).endsWith(
        '… 5 more. Use fewer or longer terms.'
      )
    )
  })

  test('groups matches by kind, best kind first', () => {
    assert.equal(
      formatMetaMatches(
        {
          rows: [
            { kind: 'table', name: 'invite', source: 'db.ts' },
            { kind: 'function', name: 'sendInvite', detail: 'd'.repeat(120) },
            { kind: 'table', name: 'inviteLog' },
          ],
          rest: 0,
        },
        ['invite']
      ),
      `table:\n  invite (db.ts)\n  inviteLog\nfunction:\n  sendInvite — ${'d'.repeat(99)}…`
    )
  })

  test('says so when nothing matched', () => {
    assert.equal(
      formatMetaMatches({ rows: [], rest: 0 }, ['a', 'b']),
      'No matches for: a, b'
    )
  })
})

describe('formatting', () => {
  test('prints one line per row with what it has', () => {
    assert.equal(
      formatMetaRows([
        { kind: 'a', name: 'one', detail: 'two', source: 'three.ts' },
        { kind: 'a', name: 'bare' },
      ]),
      'one — two (three.ts)\nbare'
    )
    assert.equal(formatMetaRows([]), '(none)')
    assert.equal(
      formatMetaRows([{ kind: 'session', name: 'userId' }], { withKind: true }),
      'session userId'
    )
  })

  test('keeps the compact map to one line per function', () => {
    const map = formatCompactContext({
      functions: [
        {
          id: 'listTests',
          description: 'x'.repeat(100),
          expose: true,
          readonly: true,
        },
        { id: 'plain', description: null, expose: false, readonly: false },
      ],
      workflows: [],
      permissions: ['ownsPatient'],
      middleware: [],
      wires: { http: 3, queue: 0 },
      tables: ['patient'],
      screens: [],
      emails: [],
    })
    const lines = map.split('\n')
    assert.equal(lines.length, 7)
    assert.ok(lines.includes('wires: http 3'))
    assert.ok(lines.includes('plain'))
    assert.ok(!map.includes('workflows'))
    assert.ok(lines[5]!.length < 60)
  })
})

describe('withConstraints', () => {
  test('adds declared bounds from the sidecar, keyed by physical names', () => {
    const [table] = withConstraints(
      [
        {
          table: 'practiceUser',
          columns: [
            {
              name: 'ageYears',
              type: 'number',
              nullable: false,
              generated: false,
              classification: null,
            },
            {
              name: 'id',
              type: 'string',
              nullable: false,
              generated: false,
              classification: null,
            },
          ],
        },
      ],
      { practice_user: { age_years: { min: 0, max: 120 } } }
    )
    assert.equal(table!.columns[0]!.constraints, 'min 0, max 120')
    assert.equal(table!.columns[1]!.constraints, undefined)
    assert.equal(dbColumnRows(table!)[0]!.detail, 'number [min 0, max 120]')
  })
})
