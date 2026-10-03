import type { I18nString } from '@pikku/react'

/**
 * Picks between a singular and a counted message.
 *
 * There is no runtime key resolver, so a plural cannot be a key assembled from
 * the count — it is a pair of message *functions* chosen by it, which keeps a
 * renamed or deleted message a build failure rather than a console warning.
 */
export const plural = (
  count: number,
  one: () => I18nString,
  other: (params: { count: number }) => I18nString
): I18nString => (count === 1 ? one() : other({ count }))
