/**
 * Type constraint: Function input and output types must be enforced
 *
 * This validates that the TypeScript compiler properly enforces
 * type safety for function inputs and outputs.
 */

import { pikkuFunc } from '../../.pikku/pikku-types.gen.js'

// Valid: Correct input and output types
const validFunc = pikkuFunc<{ name: string }, { greeting: string }>(
  async ({}, {}, data) => {
    return { greeting: `Hello ${data.name}` }
  }
)

// Valid: Void input type
const voidInputFunc = pikkuFunc<void, { timestamp: number }>(async () => {
  return { timestamp: Date.now() }
})

// Valid: Void output type
const voidOutputFunc = pikkuFunc<{ id: string }, void>(async ({}, {}, data) => {
  console.log(data.id)
})

// Use the functions to avoid unused variable warnings
void validFunc
void voidInputFunc
void voidOutputFunc
