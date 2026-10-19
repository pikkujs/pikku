/**
 * The addon's own functions, reading the table the addon ships.
 *
 * `remote: true` puts them on the surface a `wireRemoteAddon` consumer imports.
 * They run on the host, against the host's database — which is the whole reason
 * the consumer must not fold this addon's schema into its own migrations. Their
 * contract is zod, because a remote addon's SDK ships types only (PKU922).
 */
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/addon/function'

export const NoteRows = z.array(z.object({ id: z.string(), body: z.string() }))

export const listNotes = pikkuSessionlessFunc({
  description: 'Lists the notes stored on the host that runs this addon',
  func: async ({ kysely }) =>
    await kysely
      .selectFrom('notes')
      .select(['id', 'body'])
      .orderBy('id')
      .execute(),
  output: NoteRows,
  remote: true,
  tags: ['addon'],
})

/**
 * Internal: not remote, so it may keep its generics, and neither it nor its
 * `CountNotesOutput` type ships in the SDK.
 */
export const countNotes = pikkuSessionlessFunc<void, { count: number }>({
  description: 'Counts the notes stored on the host',
  func: async ({ kysely }) => {
    const rows = await kysely.selectFrom('notes').select(['id']).execute()
    return { count: rows.length }
  },
  tags: ['addon'],
})
