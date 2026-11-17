import { defineTables } from '@pikku/core/db'

/** The table this addon keeps on the host that runs it, never on the consumer's database. */
export const tables = defineTables({
  notesNote: {
    columns: {
      id: { type: 'key', primaryKey: true },
      body: { type: 'text', required: true, unique: true },
    },
  },
})
