import { z } from 'zod'

const Page = z.object({
  app: z.string(),
  path: z.string(),
  file: z.string(),
  params: z.array(z.string()),
})

export const PagesListInput = z.object({ app: z.string().optional() })
export const PagesListOutput = z.object({ pages: z.array(Page) })

export const PagesScreenshotInput = z.object({
  baseUrl: z.string(),
  app: z.string().optional(),
  out: z.string().optional(),
  params: z.string().optional(),
  as: z.string().optional(),
  environment: z.string().optional(),
  backend: z.string().optional(),
  viewport: z.boolean().optional(),
})
export const PagesScreenshotOutput = z.object({
  app: z.string(),
  baseUrl: z.string(),
  dir: z.string(),
  shots: z.array(
    z.object({
      path: z.string(),
      file: z.string().nullable(),
      httpStatus: z.number().nullable(),
      error: z.string().optional(),
      problems: z.array(z.string()),
    })
  ),
  skipped: z.array(z.object({ path: z.string(), params: z.array(z.string()) })),
})

export const PagesCompareInput = z.object({
  reference: z.string(),
  baseUrl: z.string().optional(),
  app: z.string().optional(),
  out: z.string().optional(),
  widths: z.string().optional(),
  page: z.string().optional(),
  map: z.string().optional(),
  threshold: z.number().optional(),
  params: z.string().optional(),
  as: z.string().optional(),
  environment: z.string().optional(),
  backend: z.string().optional(),
})
const SectionDiff = z.object({ match: z.number(), notes: z.array(z.string()) })
export const PagesCompareRow = z.object({
  id: z.string(),
  width: z.number(),
  path: z.string(),
  status: z.enum(['compared', 'missing', 'error']),
  changedPercent: z.number().nullable(),
  referenceHeight: z.number().nullable(),
  ourHeight: z.number().nullable(),
  referenceImageWidth: z.number().optional(),
  ourImageWidth: z.number().optional(),
  heightDiff: z.number().nullable(),
  httpStatus: z.number().nullable(),
  diff: z.string().nullable(),
  ours: z.string().nullable(),
  sections: SectionDiff.nullable(),
  styles: z
    .array(z.object({ what: z.string(), text: z.string(), weight: z.number() }))
    .nullable()
    .optional(),
  error: z.string().optional(),
})
export const PagesCompareOutput = z.object({
  app: z.string(),
  baseUrl: z.string(),
  server: z
    .object({
      started: z.boolean(),
      command: z.string().nullable(),
      apiNote: z.string().nullable(),
    })
    .nullable(),
  reference: z.string(),
  dir: z.string(),
  report: z.string(),
  widths: z.array(z.number()),
  threshold: z.number().nullable(),
  gitSha: z.string().nullable(),
  dirty: z.boolean().nullable(),
  generatedAt: z.string(),
  sectionsNote: z.string().nullable(),
  stylesNote: z.string().nullable().optional(),
  rows: z.array(PagesCompareRow),
  failed: z.array(z.string()),
})
