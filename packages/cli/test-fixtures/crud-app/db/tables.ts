import { defineTables } from '@pikku/core/db'

export const tables = defineTables({
  therapist: {
    columns: {
      id: { type: 'key', primaryKey: true },
      name: { type: 'text', required: true },
    },
  },
  offering: {
    columns: {
      id: { type: 'key', primaryKey: true },
      slug: { type: 'string(80)', required: true, unique: true },
      title: { type: 'text', required: true, minLength: 1, maxLength: 200 },
      status: {
        type: 'text',
        required: true,
        default: 'draft',
        enum: ['draft', 'published', 'archived'],
      },
      body: { type: 'text', maxLength: 20000 },
      imageKey: { type: 'text' },
      priceMinor: { type: 'integer', required: true, default: 0, min: 0 },
      currency: {
        type: 'string(3)',
        required: true,
        default: 'EUR',
      },
      featured: { type: 'boolean', required: true, default: false },
      position: { type: 'integer' },
      therapistId: { type: 'key', references: 'therapist.id' },
      startsAt: { type: 'timestamp' },
      salesUrl: { type: 'text', format: 'url' },
      internalCode: {
        type: 'text',
        required: true,
        default: 'none',
        input: false,
      },
      ownerSecret: { type: 'text', security: 'secret', form: 'plain' },
      updatedAt: { type: 'text', required: true },
    },
  },
  courseApplication: {
    columns: {
      id: { type: 'key', primaryKey: true },
      email: {
        type: 'text',
        required: true,
        security: 'pii',
        format: 'email',
      },
      firstName: { type: 'text', security: 'pii' },
      motivation: { type: 'text', security: 'pii' },
      status: {
        type: 'text',
        required: true,
        default: 'new',
        enum: ['new', 'accepted', 'rejected'],
      },
      note: { type: 'text', security: 'pii' },
      createdAt: { type: 'timestamp', required: true, default: { now: true } },
    },
  },
})
