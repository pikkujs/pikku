import { z } from 'zod'

/**
 * The `pikku examples` schemas, declared here rather than beside the wired functions.
 *
 * The CLI bootstraps with the PUBLISHED inspector, which has to be able to IMPORT the
 * schema a command declares. A command file imports `#pikku`, which points at build
 * output that does not exist yet while the bootstrap is running — so a schema the
 * inspector must read cannot live in one. Same reason the knowledge schemas sit in their
 * own file.
 */

const ExampleSummary = z.object({
  name: z.string(),
  title: z.string(),
  when: z.string(),
  lang: z.string(),
  entity: z.string(),
  deferUntil: z.string(),
})

export const ExamplesListInput = z.object({
  group: z
    .string()
    .optional()
    .describe('Only the examples whose name starts with this, e.g. `scenario`'),
})

export const ExamplesListOutput = z.object({
  examples: z.array(ExampleSummary),
})

export const ExamplesShowInput = z.object({
  name: z.string(),
  entity: z
    .string()
    .optional()
    .describe(
      "Rewrite the example's domain symbol into this one before printing"
    ),
})

export const ExamplesShowOutput = z.object({
  found: z.boolean(),
  name: z.string(),
  title: z.string(),
  when: z.string(),
  source: z.string(),
  steps: z.string(),
  code: z.string(),
  notes: z.array(
    z.object({ anchor: z.string().nullable(), lines: z.array(z.string()) })
  ),
  available: z.array(z.string()),
})

export const ExamplesAddInput = z.object({
  name: z.string(),
  entity: z
    .string()
    .optional()
    .describe("The domain symbol to rename the example's own onto"),
  app: z
    .string()
    .optional()
    .describe(
      'Which frontend a screen belongs to, for a project with more than one'
    ),
})

export const ExamplesAddOutput = z.object({
  ok: z.boolean(),
  name: z.string(),
  entity: z.string(),
  /** Why nothing was written. A refusal is the whole answer; every other field is empty. */
  refusal: z.string(),
  written: z.array(z.string()),
  kept: z.array(z.string()),
  failed: z.array(z.string()),
  deferred: z.array(
    z.object({ path: z.string(), tables: z.array(z.string()) })
  ),
  manual: z.array(z.string()),
  api: z.array(
    z.object({
      path: z.string(),
      exports: z.array(z.string()),
      declarations: z.array(z.string()),
    })
  ),
  when: z.string(),
  steps: z.string(),
  notes: z.array(
    z.object({ anchor: z.string().nullable(), lines: z.array(z.string()) })
  ),
})

export type ExamplesListResult = z.infer<typeof ExamplesListOutput>
export type ExamplesShowResult = z.infer<typeof ExamplesShowOutput>
export type ExamplesAddResult = z.infer<typeof ExamplesAddOutput>
