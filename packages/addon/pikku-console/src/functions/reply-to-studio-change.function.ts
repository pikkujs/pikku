import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const replyToStudioChange = pikkuFunc<
  { changeId: string; body: string },
  { ok: true }
>({
  title: 'Reply to a Change',
  description: 'Adds a message to a change’s thread.',
  expose: true,
  scopes: ['pikku:console:changes:write'],
  func: async ({ studioHost }, { changeId, body }) => {
    if (!studioHost) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    await studioHost.changes.reply(changeId, body, 'studio')
    return { ok: true as const }
  },
})
