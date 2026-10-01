import { z } from 'zod'

export const I18nListInput = z.object({})
export const I18nListOutput = z.object({
  apps: z.array(
    z.object({
      app: z.string(),
      messagesDir: z.string(),
      baseLocale: z.string(),
      defaultLocale: z.string().nullable(),
      locales: z.record(
        z.string(),
        z.object({ keys: z.number(), untranslated: z.number() })
      ),
    })
  ),
})
export const I18nAddInput = z.object({
  locale: z.string(),
  app: z.string().optional(),
})
export const I18nAddOutput = z.object({
  path: z.string(),
  keys: z.number(),
  translated: z.number(),
})
export const I18nSyncInput = z.object({ app: z.string().optional() })
export const I18nSyncOutput = z.object({
  report: z.array(
    z.object({
      app: z.string(),
      locale: z.string(),
      added: z.array(z.string()),
      stale: z.array(z.string()),
      untranslated: z.number(),
    })
  ),
})
export const I18nDefaultInput = z.object({
  locale: z.string(),
  app: z.string().optional(),
})
export const I18nDefaultOutput = z.object({
  app: z.string(),
  locale: z.string(),
})
