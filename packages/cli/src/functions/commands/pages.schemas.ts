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
