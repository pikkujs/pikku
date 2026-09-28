import { z } from 'zod'

/**
 * Beside the command rather than inside it, because schema generation imports
 * the file a schema is declared in and runs it. `new-app.ts` imports
 * `#pikku/function`, which resolves into `dist/.pikku` — output that does not
 * exist yet the first time codegen runs on a clean tree, so importing it there
 * fails before the schema can be read. A file with no generated import of its
 * own can be run at any point in the build.
 */
export const PikkuNewAppInput = z.object({
  slug: z.string(),
  serves: z.string().optional(),
  personas: z.string().optional(),
  template: z.string().optional(),
  primary: z.boolean().optional(),
  install: z.boolean().optional(),
})

export const PikkuNewAppOutputSchema = z.object({
  slug: z.string(),
  path: z.string(),
  port: z.number(),
  repaired: z.array(z.string()),
  refusal: z.string().nullable(),
})
export type PikkuNewAppOutput = z.infer<typeof PikkuNewAppOutputSchema>
