/**
 * The addon's own functions, reading the table the addon ships.
 *
 * `remote: true` puts them on the surface a `wireRemoteAddon` consumer imports.
 * They run on the host, against the host's database — which is the whole reason
 * the consumer must not fold this addon's schema into its own migrations.
 */
import { pikkuSessionlessFunc } from '#pikku/addon/function'

export const listNotes = pikkuSessionlessFunc<
  void,
  Array<{ id: string; body: string }>
>({
  description: 'Lists the notes stored on the host that runs this addon',
  func: async ({ kysely }) =>
    await kysely
      .selectFrom('notes')
      .select(['id', 'body'])
      .orderBy('id')
      .execute(),
  remote: true,
  tags: ['addon'],
})
