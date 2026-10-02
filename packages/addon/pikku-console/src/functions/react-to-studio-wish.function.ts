import { LocalEnvironmentOnlyError } from '#pikku/addon/error'
import { pikkuFunc } from '#pikku/addon/function'

export const reactToStudioWish = pikkuFunc<
  { title: string; reaction: 'liked' | 'disliked' | null },
  { ok: true }
>({
  title: 'React to a Wish',
  description: 'Likes, dislikes or clears a reaction on a wish.',
  expose: true,
  scopes: ['pikku:console:wishes:write'],
  func: async ({ studioHost }, { title, reaction }) => {
    if (!studioHost) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    await studioHost.wishes.react(title, reaction)
    return { ok: true as const }
  },
})
