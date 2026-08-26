import { pikkuSessionlessFunc } from '#pikku/function'

export const listNotes = pikkuSessionlessFunc<
  void,
  { notes: Array<{ id: string; text: string }> }
>({
  func: async ({ noteStore }) => ({
    notes: [...noteStore.entries()].map(([id, text]) => ({ id, text })),
  }),
})

export const createNote = pikkuSessionlessFunc<
  { text: string },
  { id: string; text: string }
>({
  func: async ({ noteStore }, { text }) => {
    const id = `note-${noteStore.size + 1}`
    noteStore.set(id, text)
    return { id, text }
  },
})
