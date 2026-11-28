import { defineTables } from '@pikku/core/db'

export const tables = defineTables({
  notesNote: {
    columns: {
      id: { type: 'key', primaryKey: true },
      title: { type: 'text', required: true, maxLength: 80 },
      body: { type: 'text' },
      state: {
        type: 'text',
        required: true,
        default: 'open',
        enum: ['open', 'closed'],
      },
      writerId: { type: 'key', required: true },
      remindAt: { type: 'timestamp' },
      internalToken: { type: 'text', security: 'secret' },
      updatedAt: { type: 'text', required: true },
    },
  },
  notesReply: {
    columns: {
      id: { type: 'key', primaryKey: true },
      noteId: {
        references: 'notesNote.id',
        required: true,
        onDelete: 'cascade',
      },
      writer: { type: 'text', required: true, security: 'pii' },
      message: { type: 'text', required: true },
      state: {
        type: 'text',
        required: true,
        default: 'waiting',
        enum: ['waiting', 'shown'],
      },
    },
  },
})
