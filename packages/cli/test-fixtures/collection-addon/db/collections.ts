import { defineCollections } from '@pikku/core/collections'
import type { tables } from './tables.js'

export const collections = defineCollections<typeof tables>()({
  notesNote: {
    label: 'Notes',
    title: 'title',
    badge: 'state',
    list: {
      columns: ['title', 'state', 'remindAt', 'updatedAt'],
      filter: ['state', 'remindAt'],
      sort: ['title'],
      search: ['title'],
    },
    edit: {
      title: true,
      body: 'richtext',
      tags: { input: 'tags', maxItems: 3, maxLength: 10 },
    },
    detail: ['writerId'],
    create: true,
    delete: true,
    actions: {
      close: {
        label: 'Close',
        input: ['remindAt'],
        confirm: 'Close this note?',
      },
      reopen: { label: 'Reopen' },
    },
  },
  notesReply: {
    label: 'Replies',
    title: 'writer',
    list: { columns: ['writer', 'state', 'noteId'], filter: ['noteId'] },
    submitted: ['writer', 'message'],
    pii: ['writer'],
    delete: true,
    actions: { show: { label: 'Show' } },
  },
})
