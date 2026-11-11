import { pikkuSessionlessFunc } from '#pikku/function'
import type { PostalAddress } from './postal-address.types.js'

/**
 * Its inline input type becomes a custom type that references a named source
 * type, so the shared custom-types file has to import `PostalAddress`.
 */
export const formatPostalAddress = pikkuSessionlessFunc<
  { address: PostalAddress; uppercase?: boolean },
  { label: string }
>({
  func: async (_services, { address, uppercase }) => {
    const label = `${address.street}, ${address.postcode} ${address.city}`
    return { label: uppercase ? label.toUpperCase() : label }
  },
  expose: true,
})
