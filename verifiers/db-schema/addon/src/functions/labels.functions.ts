/**
 * The addon's own functions, reading the table the addon ships.
 *
 * Nothing here creates the table. The addon runs inside the consumer, against
 * the consumer's database, so a boot-time create would put a second authority
 * on a schema the consumer's migrations own. `pikku db export` publishes the
 * table instead, and `pikku db generate` folds it into the consumer's history.
 */
import { pikkuSessionlessFunc } from '#pikku/addon/function'

export const listLabels = pikkuSessionlessFunc<
  void,
  Array<{ id: string; name: string; color: string | null }>
>({
  description: 'Lists the labels stored in the table this addon ships',
  func: async ({ kysely }) =>
    await kysely
      .selectFrom('labels')
      .select(['id', 'name', 'color'])
      .orderBy('name')
      .execute(),
  tags: ['addon'],
})

export const addLabel = pikkuSessionlessFunc<
  { id: string; name: string; color?: string },
  { id: string }
>({
  description: 'Writes a label, proving the migrated table is the one in use',
  func: async ({ kysely }, data) => {
    await kysely
      .insertInto('labels')
      .values({ id: data.id, name: data.name, color: data.color ?? null })
      .execute()
    return { id: data.id }
  },
  tags: ['addon'],
})
