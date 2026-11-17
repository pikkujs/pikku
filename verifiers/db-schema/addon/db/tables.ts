import { defineTables } from '@pikku/core/db'

/**
 * The tables this addon ships. `pikku db export` publishes them as plain JSON,
 * and the consumer's `pikku db generate` creates them alongside its own. Every
 * name carries the prefix the consumer wired the addon under (`labels_`).
 */
export const tables = defineTables({
  labelsLabel: {
    columns: {
      id: { type: 'key', primaryKey: true },
      name: { type: 'text', required: true, unique: true },
      color: { type: 'text' },
      owner: { type: 'text', format: 'email', security: 'pii' },
      weight: { type: 'integer', min: 0, max: 10 },
    },
  },
})
