import type { TablesDeclaration } from '@pikku/core/db'

/** The tables and collections the CRUD unit tests start from. */
export const testTables = (): TablesDeclaration => ({
  therapist: {
    columns: {
      id: { type: 'key', primaryKey: true },
      name: { type: 'text', required: true },
    },
  },
  offering: {
    columns: {
      id: { type: 'key', primaryKey: true },
      title: { type: 'text', required: true },
      status: {
        type: 'text',
        required: true,
        default: 'draft',
        enum: ['draft', 'published'],
      },
      body: { type: 'text' },
      imageKey: { type: 'text' },
      priceMinor: { type: 'integer', min: 0 },
      currency: { type: 'string(3)' },
      therapistId: { references: 'therapist.id' },
      startsAt: { type: 'timestamp' },
      contactEmail: { type: 'text', security: 'pii', format: 'email' },
      apiToken: { type: 'text', security: 'secret' },
      sealedNote: { type: 'text', form: 'sealed' },
      meta: { type: 'json' },
      tags: { type: 'text', kind: 'json' },
      internalCode: { type: 'text', input: false },
      shortCode: { type: 'string(20)' },
      updatedAt: { type: 'text', required: true },
    },
  },
  offeringNote: {
    declareOnly: true,
    columns: {
      id: { type: 'integer', primaryKey: true },
      offeringId: { references: 'offering.id', onDelete: 'cascade' },
    },
  },
})

export const testDeclaration = () => ({
  offering: {
    label: 'Offerings',
    title: 'title',
    thumbnail: 'imageKey',
    badge: 'status',
    list: {
      columns: ['title', 'status', 'startsAt', 'priceMinor'],
      filter: ['status'],
      sort: ['startsAt', 'title'],
      search: ['title'],
    },
    detail: ['internalCode'],
    edit: {
      title: true,
      status: true,
      body: 'richtext',
      imageKey: {
        input: 'image',
        bucket: 'site',
        accept: ['image/png', 'image/jpeg'],
        maxBytes: 1000,
      },
      priceMinor: { input: 'money', currency: 'currency' },
      currency: true,
      therapistId: 'relation',
      startsAt: { label: 'Begins', help: 'Local time' },
      contactEmail: true,
    },
    groups: [{ label: 'Price', fields: ['priceMinor', 'currency'] }],
    pii: ['contactEmail'],
    create: true,
    permissions: { read: 'src/checks.ts#mayRead' },
  },
  therapist: {
    label: 'Therapists',
    title: 'name',
    list: { columns: ['name'] },
  },
})
