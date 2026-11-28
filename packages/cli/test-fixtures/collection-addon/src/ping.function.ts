import { pikkuFunc } from '#pikku/addon/function'

export const pingNotes = pikkuFunc<void, string>({
  description: 'Say the addon is wired',
  expose: true,
  func: async () => 'notes',
})
