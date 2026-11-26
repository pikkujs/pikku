/**
 * Sentinel handlers: the records live in memory, so a query on an `notes_` table
 * can only come from code that went round them.
 */
import type { CmsHandlers, CmsRecord } from '@pikku/core/cms'
import { ConflictError, NotFoundError } from '@pikku/core/errors'

const note = (id: string, title: string): CmsRecord => ({
  id,
  title,
  body: 'SENTINEL-BODY',
  state: 'open',
  writerId: 'sentinel-writer',
  remindAt: new Date('2026-03-01T10:00:00.000Z'),
  updatedAt: 'v1',
  tags: ['sentinel'],
  // Not a column the collection shows: the wrappers have to leave it behind.
  internalToken: 'SENTINEL-SECRET',
})

const notes = new Map<string, CmsRecord>(
  ['sentinel-1', 'sentinel-2', 'probe'].map((id) => [
    id,
    note(id, `Note ${id}`),
  ])
)

const replies = new Map<string, CmsRecord>([
  [
    'reply-1',
    {
      id: 'reply-1',
      noteId: 'sentinel-1',
      writer: 'Vi',
      message: '<script>alert(1)</script>',
      state: 'waiting',
    },
  ],
])

const held = (records: Map<string, CmsRecord>, id: string | number) => {
  const found = records.get(String(id))
  if (!found) throw new NotFoundError('NOTE_NOT_FOUND')
  return found
}

/** What a handler was given, kept where a test can read it back. */
const received = (services: object, input: unknown, userId?: string) =>
  JSON.stringify({ services: Object.keys(services).sort(), input, userId })

export const cmsHandlers: CmsHandlers = {
  notesNote: {
    list: async (_services, query) => {
      const rows =
        query.search === 'echo'
          ? [note('echo', JSON.stringify(query))]
          : [...notes.values()].slice(query.offset)
      return {
        rows: rows.slice(0, query.limit),
        hasMore: rows.length > query.limit,
      }
    },
    get: async (_services, { id }) => ({ row: held(notes, id) }),
    create: async (services, input, session) => {
      if (input.values.title === 'taken') {
        throw new ConflictError('TITLE_TAKEN: another note has this title')
      }
      const row: CmsRecord = {
        ...note(`made-${notes.size}`, String(input.values.title)),
        ...input.values,
        writerId: received(services, input, session?.userId),
      }
      notes.set(String(row.id), row)
      return { row }
    },
    update: async (services, input, session) => {
      const row = held(notes, input.id)
      if (
        input.expectedUpdatedAt !== undefined &&
        input.expectedUpdatedAt !== row.updatedAt
      ) {
        throw new ConflictError('NOTE_CHANGED')
      }
      Object.assign(row, input.patch, {
        writerId: received(services, input, session?.userId),
      })
      return { row }
    },
    delete: async (_services, { id }) => ({
      removed: notes.delete(String(id)),
    }),
    actions: {
      close: async (services, input, session) => {
        // The control of the query detector: this one id does query.
        if (input.id === 'probe') {
          await (services as any).kysely
            .selectFrom('notesNote')
            .selectAll()
            .execute()
        }
        const row = held(notes, input.id)
        Object.assign(row, input.input, {
          state: 'closed',
          writerId: received(services, input, session?.userId),
        })
        return { row }
      },
      reopen: async (_services, { id }) => ({
        row: Object.assign(held(notes, id), { state: 'open' }),
      }),
    },
  },
  notesReply: {
    list: async () => ({ rows: [...replies.values()], hasMore: false }),
    get: async (_services, { id }) => ({ row: held(replies, id) }),
    delete: async (_services, { id }) => ({
      removed: replies.delete(String(id)),
    }),
    actions: {
      show: async (_services, { id }) => ({
        row: Object.assign(held(replies, id), { state: 'shown' }),
      }),
    },
  },
}
