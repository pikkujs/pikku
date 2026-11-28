import { defineCollections } from '@pikku/core/collections'
import type { tables } from './tables.js'

export const collections = defineCollections<typeof tables>()({
  offering: {
    label: 'Offerings',
    title: 'title',
    thumbnail: 'imageKey',
    badge: 'status',
    list: {
      columns: ['title', 'status', 'startsAt', 'priceMinor', 'featured'],
      filter: ['status', 'startsAt', 'priceMinor', 'featured', 'title'],
      sort: ['title', 'priceMinor', 'startsAt'],
      search: ['title'],
    },
    detail: ['internalCode'],
    edit: {
      slug: true,
      title: true,
      status: true,
      body: 'richtext',
      imageKey: {
        input: 'image',
        bucket: 'site',
        accept: ['image/png', 'image/jpeg', 'image/webp'],
        maxBytes: 2000,
      },
      priceMinor: { input: 'money', currency: 'currency' },
      currency: true,
      featured: true,
      position: true,
      therapistId: 'relation',
      startsAt: true,
      salesUrl: { help: 'Existing checkout link' },
    },
    groups: [{ label: 'Price', fields: ['priceMinor', 'currency'] }],
    create: true,
    delete: true,
    permissions: { create: 'src/checks.ts#opensOfferings' },
  },
  therapist: {
    label: 'Therapists',
    title: 'name',
    list: { columns: ['name'], sort: ['name'], search: ['name'] },
    edit: { name: true },
    create: true,
    delete: true,
    permissions: { read: 'src/checks.ts#readsTherapists' },
  },
  courseApplication: {
    label: 'Applications',
    title: 'email',
    list: {
      columns: ['createdAt', 'email', 'status'],
      filter: ['status'],
      sort: ['createdAt'],
    },
    submitted: ['email', 'firstName', 'motivation'],
    detail: ['createdAt'],
    edit: { status: true, note: 'longtext' },
    pii: ['email', 'firstName', 'motivation', 'note'],
    permissions: { read: 'src/checks.ts#handlesApplications' },
  },
})
