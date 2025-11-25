/**
 * Example functions using Zod schemas for input/output validation.
 * Types are automatically inferred from the Zod schemas - no need to specify generics!
 */
import { z } from 'zod'
import { pikkuFunc, pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

// ============================================================================
// Define Zod schemas - these will be converted to JSON Schema at build time
// ============================================================================

/**
 * Input schema for the greet function
 */
export const greetInputSchema = z.object({
  name: z.string().min(1).describe('The name to greet'),
  formal: z.boolean().optional().describe('Whether to use formal greeting'),
})

/**
 * Output schema for the greet function
 */
export const greetOutputSchema = z.object({
  message: z.string().describe('The greeting message'),
  timestamp: z
    .number()
    .describe('Unix timestamp of when greeting was generated'),
})

/**
 * Input schema for the calculate function
 */
export const calculateInputSchema = z.object({
  a: z.number().describe('First operand'),
  b: z.number().describe('Second operand'),
  operation: z
    .enum(['add', 'subtract', 'multiply', 'divide'])
    .describe('The operation to perform'),
})

/**
 * Output schema for the calculate function
 */
export const calculateOutputSchema = z.object({
  result: z.number().describe('The calculation result'),
  expression: z.string().describe('Human-readable expression'),
})

// ============================================================================
// Define functions using Zod schemas - types are inferred automatically!
// ============================================================================

/**
 * A simple greeting function using Zod schemas.
 * Notice we don't need to specify <Input, Output> generics - they're inferred!
 */
export const greetWithZod = pikkuSessionlessFunc({
  input: greetInputSchema,
  output: greetOutputSchema,
  func: async ({ logger }, data) => {
    // `data` is automatically typed as: { name: string; formal?: boolean }
    const greeting = data.formal
      ? `Good day, ${data.name}.`
      : `Hey ${data.name}!`

    logger.info(`Generated greeting for ${data.name}`)

    // Return type is checked against the output schema
    return {
      message: greeting,
      timestamp: Date.now(),
    }
  },
})

/**
 * A calculator function demonstrating enum validation with Zod.
 */
export const calculateWithZod = pikkuSessionlessFunc({
  input: calculateInputSchema,
  output: calculateOutputSchema,
  func: async ({ logger }, data) => {
    // `data.operation` is typed as: 'add' | 'subtract' | 'multiply' | 'divide'
    let result: number
    let symbol: string

    switch (data.operation) {
      case 'add':
        result = data.a + data.b
        symbol = '+'
        break
      case 'subtract':
        result = data.a - data.b
        symbol = '-'
        break
      case 'multiply':
        result = data.a * data.b
        symbol = '*'
        break
      case 'divide':
        if (data.b === 0) {
          throw new Error('Division by zero')
        }
        result = data.a / data.b
        symbol = '/'
        break
    }

    logger.info(`Calculated: ${data.a} ${symbol} ${data.b} = ${result}`)

    return {
      result,
      expression: `${data.a} ${symbol} ${data.b} = ${result}`,
    }
  },
})

// ============================================================================
// You can also use session-aware functions with Zod schemas
// ============================================================================

/**
 * Input schema for a user profile update
 */
export const updateProfileInputSchema = z.object({
  displayName: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe('New display name'),
  bio: z.string().max(500).optional().describe('User bio'),
  settings: z
    .object({
      emailNotifications: z.boolean().optional(),
      darkMode: z.boolean().optional(),
    })
    .optional()
    .describe('User settings'),
})

/**
 * Output schema for profile update result
 */
export const updateProfileOutputSchema = z.object({
  success: z.boolean(),
  updatedFields: z
    .array(z.string())
    .describe('List of fields that were updated'),
})

/**
 * A session-aware function using Zod schemas.
 * This function requires authentication (uses pikkuFunc instead of pikkuSessionlessFunc).
 */
export const updateProfileWithZod = pikkuFunc({
  input: updateProfileInputSchema,
  output: updateProfileOutputSchema,
  func: async ({ logger }, data, { session }) => {
    const userSession = await session.get()
    const updatedFields: string[] = []

    if (data.displayName) {
      updatedFields.push('displayName')
    }
    if (data.bio !== undefined) {
      updatedFields.push('bio')
    }
    if (data.settings) {
      if (data.settings.emailNotifications !== undefined) {
        updatedFields.push('settings.emailNotifications')
      }
      if (data.settings.darkMode !== undefined) {
        updatedFields.push('settings.darkMode')
      }
    }

    logger.info(
      `User ${userSession?.userId} updated profile fields: ${updatedFields.join(', ')}`
    )

    return {
      success: true,
      updatedFields,
    }
  },
})
