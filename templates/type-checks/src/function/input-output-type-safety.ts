/**
 * Type constraint: Function input and output types must be enforced
 *
 * This validates that the TypeScript compiler properly enforces
 * type safety for function inputs and outputs.
 */

import { pikkuFunc } from '../../.pikku/pikku-types.gen.js'

// Valid: Correct input and output types
const validFunc = pikkuFunc<{ name: string }, { greeting: string }>(
  async ({}, data) => {
    return { greeting: `Hello ${data.name}` }
  }
)

const invalidReturn = pikkuFunc<{ name: string }, { greeting: string }>(
  // @ts-expect-error - Return type doesn't match output type
  async ({}, data) => {
    return { message: `Hello ${data.name}` }
  }
)

const invalidInput = pikkuFunc<{ name: string }, { greeting: string }>(
  async ({}, data) => {
    // @ts-expect-error - Accessing property that doesn't exist in input type
    return { greeting: `Hello ${data.age}` }
  }
)

// Valid: Void input type
const voidInputFunc = pikkuFunc<void, { timestamp: number }>(async () => {
  return { timestamp: Date.now() }
})

// Valid: Void output type
const voidOutputFunc = pikkuFunc<{ id: string }, void>(async ({}, data) => {
  console.log(data.id)
})

const invalidVoidOutput = pikkuFunc<{ id: string }, void>(
  // @ts-expect-error - Cannot return value when output type is void
  async ({}, data) => {
    return { processed: true }
  }
)

// Use the functions to avoid unused variable warnings
void validFunc
void invalidReturn
void invalidInput
void voidInputFunc
void voidOutputFunc
void invalidVoidOutput
