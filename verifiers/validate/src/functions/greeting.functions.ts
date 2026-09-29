import { pikkuSessionlessFunc } from '#pikku/function'

/**
 * The shape every other file in this verifier is measured against: a wired
 * function whose names all arrive through the generated alias.
 */
export const greet = pikkuSessionlessFunc<{ name: string }, string>({
  func: async (_services, data) => `hello ${data.name}`,
})
