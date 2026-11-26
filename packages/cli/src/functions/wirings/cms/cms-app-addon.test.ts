import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cliIsBuilt,
  CmsTestApp,
  type Caller,
  type Engine,
} from '../../../../test-fixtures/cms/app-harness.js'

const GRANTS = {
  nobody: [],
  super: ['cms'],
  reader: ['cms:notesNote:read'],
  blindCloser: ['cms:notesNote:close', 'cms:notesNote:create'],
  editor: ['cms:notesNote:read', 'cms:notesNote:edit'],
  closer: ['cms:notesNote:read', 'cms:notesNote:close'],
  reopener: ['cms:notesNote:read', 'cms:notesNote:reopen'],
  trainee: ['cms:notesNote'],
  replies: ['cms:notesReply'],
}
const as = (user: keyof typeof GRANTS): Caller => ({ user })

const NOTE_FUNCTIONS = {
  listCmsNotesNote: {},
  getCmsNotesNote: { id: 'sentinel-1' },
  createCmsNotesNote: { values: { title: 'Matrix' } },
  updateCmsNotesNote: { id: 'sentinel-1', patch: { title: 'Matrix' } },
  runCmsNotesNoteClose: { id: 'sentinel-1', input: {} },
  runCmsNotesNoteReopen: { id: 'sentinel-1' },
}

for (const engine of ['sqlite', 'postgres'] as Engine[]) {
  describe(
    `generated CMS over an addon on ${engine}`,
    {
      skip: !cliIsBuilt(),
    },
    () => {
      let app: CmsTestApp

      before(async () => {
        app = await CmsTestApp.create(engine, { addon: true })
        await app.build()
        await app.grant(GRANTS)
        await app.start()
      })
      after(async () => {
        await app?.remove()
      })

      const ok = async (name: string, data: object, caller = as('super')) => {
        const answer = await app.rpc(name, data, caller)
        assert.equal(answer.status, 200, `${name}: ${answer.text}`)
        assert.doesNotMatch(answer.text, /SENTINEL-SECRET|internalToken/, name)
        return answer.body
      }
      const status = async (name: string, data: object, caller = as('super')) =>
        (await app.rpc(name, data, caller)).status
      /** What the handler said it was given. */
      const received = (row: { writerId: string }) => JSON.parse(row.writerId)

      test('records come from the handlers, cut down to the declared columns', async () => {
        const { rows, nextCursor } = await ok('listCmsNotesNote', { limit: 2 })
        assert.deepEqual(rows[0], {
          id: 'sentinel-1',
          title: 'Note sentinel-1',
          state: 'open',
          remindAt: '2026-03-01T10:00:00.000Z',
          updatedAt: 'v1',
        })
        assert.equal(rows.length, 2)
        assert.equal(nextCursor, '2')
        const { row } = await ok('getCmsNotesNote', { id: 'sentinel-1' })
        assert.deepEqual(Object.keys(row).sort(), [
          'body',
          'id',
          'remindAt',
          'state',
          'tags',
          'title',
          'updatedAt',
          'writerId',
        ])
        assert.deepEqual(row.tags, ['sentinel'])
        assert.equal(await status('getCmsNotesNote', { id: 'missing' }), 404)
      })

      test('a handler gets a checked, normalised list query and nothing else', async () => {
        const { rows } = await ok('listCmsNotesNote', {
          search: 'echo',
          limit: 5,
          filter: [
            { state: { in: ['open'] } },
            { remindAt: { gte: '2026-01-01 00:00:00+01' } },
          ],
          sort: [{ column: 'title', direction: 'desc' }],
        })
        assert.deepEqual(JSON.parse(rows[0].title), {
          limit: 5,
          offset: 0,
          conditions: [
            { column: 'state', operator: 'in', value: ['open'] },
            {
              column: 'remindAt',
              operator: 'gte',
              value: '2025-12-31T23:00:00.000Z',
            },
          ],
          sort: [{ column: 'title', direction: 'desc' }],
          search: 'echo',
        })
        for (const data of [
          { limit: 101 },
          { filter: { writerId: { equals: 'x' } } },
          { filter: { state: { like: 'o%' } } },
          { sort: [{ column: 'state', direction: 'asc' }] },
          { where: '1=1' },
        ]) {
          assert.equal(
            await status('listCmsNotesNote', data),
            422,
            JSON.stringify(data)
          )
        }
      })

      test('a write hands over the declared fields and the database, no more', async () => {
        const { row } = await ok('createCmsNotesNote', {
          values: {
            title: 'Made',
            body: '# Kept  \r\n\tas written\n',
            tags: ['a'],
          },
        })
        assert.equal(row.body, '# Kept  \r\n\tas written\n')
        assert.deepEqual(received(row), {
          services: ['kysely', 'logger'],
          input: {
            values: {
              title: 'Made',
              body: '# Kept  \r\n\tas written\n',
              tags: ['a'],
            },
          },
          userId: 'super',
        })
        const changed = await ok('updateCmsNotesNote', {
          id: row.id,
          patch: { title: 'Changed' },
          expectedUpdatedAt: 'v1',
        })
        assert.deepEqual(received(changed.row).input, {
          id: row.id,
          patch: { title: 'Changed' },
          expectedUpdatedAt: 'v1',
        })
        assert.deepEqual(await ok('deleteCmsNotesNote', { id: row.id }), {
          removed: true,
        })
        assert.equal(await status('deleteCmsNotesNote', { id: row.id }), 404)
      })

      test('what the collection does not edit cannot be sent', async () => {
        const patches: [string, object][] = [
          ['the state an action owns', { state: 'closed' }],
          ['the column an action takes', { remindAt: '2026-01-01T00:00:00Z' }],
          ['the writer', { writerId: 'me' }],
          ['a secret column', { internalToken: 'x' }],
          ['too many tags', { tags: ['a', 'b', 'c', 'd'] }],
          ['a long tag', { tags: ['abcdefghijk'] }],
          ['a NUL in a tag', { tags: ['a\u0000'] }],
          ['a long title', { title: 'x'.repeat(81) }],
          ['nothing', {}],
        ]
        for (const [what, patch] of patches) {
          assert.equal(
            await status('updateCmsNotesNote', { id: 'sentinel-1', patch }),
            422,
            what
          )
          assert.equal(
            await status('createCmsNotesNote', {
              values: { title: 't', ...patch },
            }),
            what === 'nothing' ? 200 : 422,
            `create: ${what}`
          )
        }
        assert.equal(
          await status('runCmsNotesNoteClose', {
            id: 'sentinel-1',
            input: { title: 'x' },
          }),
          422
        )
      })

      test("a handler's refusal reaches the caller", async () => {
        const taken = await app.rpc(
          'createCmsNotesNote',
          { values: { title: 'taken' } },
          as('super')
        )
        assert.equal(taken.status, 409)
        assert.match(taken.text, /TITLE_TAKEN/)
        const stale = await app.rpc(
          'updateCmsNotesNote',
          { id: 'sentinel-1', patch: { title: 'x' }, expectedUpdatedAt: 'v0' },
          as('super')
        )
        assert.equal(stale.status, 409)
        assert.match(stale.text, /NOTE_CHANGED/)
      })

      test('each operation and action needs read and its own scope', async () => {
        const allowed: Record<string, string[]> = {
          nobody: [],
          reader: ['listCmsNotesNote', 'getCmsNotesNote'],
          blindCloser: [],
          editor: ['listCmsNotesNote', 'getCmsNotesNote', 'updateCmsNotesNote'],
          closer: [
            'listCmsNotesNote',
            'getCmsNotesNote',
            'runCmsNotesNoteClose',
          ],
          reopener: [
            'listCmsNotesNote',
            'getCmsNotesNote',
            'runCmsNotesNoteReopen',
          ],
          replies: [],
          // The app's own check narrows one action.
          trainee: Object.keys(NOTE_FUNCTIONS).filter(
            (name) => name !== 'runCmsNotesNoteClose'
          ),
          super: Object.keys(NOTE_FUNCTIONS),
        }
        for (const [user, functions] of Object.entries(allowed)) {
          for (const [name, data] of Object.entries(NOTE_FUNCTIONS)) {
            assert.equal(
              await status(name, data, { user }),
              functions.includes(name) ? 200 : 403,
              `${user} ${name}`
            )
          }
        }
        assert.equal(await status('listCmsNotesNote', {}, {}), 401)
      })

      test('a revoked grant stops the next action, whatever the session cached', async () => {
        const caller = { user: 'nobody', cached: ['cms'] }
        for (const name of [
          'runCmsNotesNoteClose',
          'runCmsNotesNoteReopen',
          'createCmsNotesNote',
        ] as const) {
          assert.equal(
            await status(name, NOTE_FUNCTIONS[name], caller),
            403,
            name
          )
        }
        // Control: reads still go by the cached session.
        assert.equal(await status('listCmsNotesNote', {}, caller), 200)
      })

      test('an action takes its declared input', async () => {
        // Every field of it is optional, and so is the whole of it.
        const bare = await ok('runCmsNotesNoteClose', { id: 'sentinel-2' })
        assert.deepEqual(received(bare.row).input, {
          id: 'sentinel-2',
          input: {},
        })
        const { row } = await ok('runCmsNotesNoteClose', {
          id: 'sentinel-2',
          input: { remindAt: '2026-06-01 12:00:00+02' },
        })
        assert.equal(row.state, 'closed')
        assert.deepEqual(received(row).input, {
          id: 'sentinel-2',
          input: { remindAt: '2026-06-01T10:00:00.000Z' },
        })
      })

      test('what the app switched off does not exist', async () => {
        assert.equal(
          await status('deleteCmsNotesReply', { id: 'reply-1' }),
          404
        )
        const shown = await ok('runCmsNotesReplyShow', { id: 'reply-1' })
        assert.equal(shown.row.state, 'shown')
        assert.equal(shown.row.message, '<script>alert(1)</script>')
      })

      test('the description names the addon, its actions and its tags, per caller', async () => {
        const describeFor = async (user: keyof typeof GRANTS) =>
          (await ok('describeCms', {}, as(user))).collections
        const all = await describeFor('super')
        const note = all.find((c: any) => c.name === 'notesNote')
        assert.equal(note.from, 'notes')
        assert.deepEqual(
          note.actions.map((a: any) => [
            a.name,
            a.function,
            a.confirm,
            a.input.map((f: any) => [f.name, f.input, f.editable]),
          ]),
          [
            [
              'close',
              'runCmsNotesNoteClose',
              'Close this note?',
              [['remindAt', 'datetime', true]],
            ],
            ['reopen', 'runCmsNotesNoteReopen', undefined, []],
          ]
        )
        const tags = note.fields.find((f: any) => f.name === 'tags')
        assert.deepEqual(
          [tags.input, tags.editable, tags.maxItems, tags.maxLength],
          ['tags', true, 3, 10]
        )
        const reply = all.find((c: any) => c.name === 'notesReply')
        assert.deepEqual(reply.operations, ['read'])
        assert.deepEqual(reply.deletesAlso, [])

        const actionsOf = async (user: keyof typeof GRANTS) =>
          (await describeFor(user))
            .find((c: any) => c.name === 'notesNote')
            .actions.map((a: any) => a.name)
        assert.deepEqual(await actionsOf('reader'), [])
        assert.deepEqual(await actionsOf('closer'), ['close'])
        assert.deepEqual(await actionsOf('trainee'), ['reopen'])
      })

      test('an action is audited by name, with no value', async () => {
        const before = (await app.audited()).length
        await ok('runCmsNotesNoteClose', {
          id: 'sentinel-1',
          input: { remindAt: '2026-07-01T00:00:00Z' },
        })
        const events = (await app.audited())
          .slice(before)
          .filter((e) => e.type?.startsWith('cms.'))
        assert.deepEqual(
          events.map((e) => [e.type, e.metadata]),
          [
            [
              'cms.record.action',
              { collection: 'notesNote', id: 'sentinel-1', action: 'close' },
            ],
          ]
        )
      })

      // Last of the requests: it ends with the one query the suite makes happen.
      test("no query of the host's names a table of the addon", async () => {
        const generated =
          (await app.read('src/scaffold/cms/cms.gen.ts')) +
          (await app.read('src/scaffold/cms/cms-runtime.gen.ts'))
        assert.doesNotMatch(
          generated,
          /(selectFrom|insertInto|updateTable|deleteFrom|Join)\(\s*'notes/
        )
        assert.deepEqual(await app.addonQueries(), [])
        // Control: a query on one of its tables does show.
        await ok('runCmsNotesNoteClose', { id: 'probe', input: {} })
        assert.equal((await app.addonQueries()).length, 1)
      })

      test('the build refuses an entry that widens, bypasses or outruns the addon', async () => {
        await app.stop()
        const original = await app.read('db/cms.ts')
        const refused = async (cms: string, message: RegExp) => {
          await app.write('db/cms.ts', cms)
          const result = await app.pikku('all')
          assert.notEqual(result.code, 0, String(message))
          assert.match(result.output, message)
        }
        const entry = "notesReply: { from: 'notes', delete: false }"
        assert.ok(original.includes(entry))
        await refused(
          original.replace(
            entry,
            "notesReply: { from: 'notes', create: true }"
          ),
          /'create' on an addon's collection can only be false/
        )
        await refused(
          original.replace(
            entry,
            "notesReply: { from: 'notes', edit: { state: true } }"
          ),
          /'edit' on an addon's collection can only be false/
        )
        await refused(
          original.replace(
            entry,
            "notesReply: { label: 'R', title: 'writer', list: { columns: ['writer'] }, pii: ['writer'] }"
          ),
          /the table belongs to the 'notes' addon/
        )
        await refused(
          original.replace(entry, "notesReply: { from: 'blog' }"),
          /no addon wired under that name/
        )
        await app.write('db/cms.ts', original)

        // A handler the addon does not ship, found before anything runs.
        const module = 'addons/notes/dist/src/cms.js'
        const handlers = await app.read(module)
        await app.write(module, handlers.replace('reopen:', 'renamed:'))
        const missing = await app.pikku('all')
        assert.notEqual(missing.code, 0)
        assert.match(missing.output, /no handler for actions\.reopen/)
        await app.write(module, handlers)

        // Switched off altogether, its functions are gone and the app builds.
        await app.write(
          'db/cms.ts',
          original.replace(/ {2}notesNote: \{[\s\S]*(?=\}\)\n$)/, '')
        )
        await app.strictBuild()
        assert.doesNotMatch(
          await app.read('src/scaffold/cms/cms.gen.ts'),
          /notes|Notes/
        )
      })
    }
  )
}
