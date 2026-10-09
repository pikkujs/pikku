import { z } from 'zod'

const Stats = z.object({ keys: z.number(), untranslated: z.number() })

export const I18nListInput = z.object({})
export const I18nListOutput = z.object({
  apps: z.array(
    z.object({
      app: z.string(),
      messagesDir: z.string(),
      baseLocale: z.string(),
      defaultLocale: z.string().nullable(),
      locales: z.record(z.string(), Stats),
      catalogs: z.array(
        z.object({ catalog: z.string(), locales: z.record(z.string(), Stats) })
      ),
      duplicates: z.array(
        z.object({ key: z.string(), catalogs: z.array(z.string()) })
      ),
    })
  ),
})
export const I18nAddInput = z.object({
  locale: z.string(),
  app: z.string().optional(),
  catalog: z.string().optional(),
})
export const I18nAddOutput = z.object({
  path: z.string(),
  keys: z.number(),
  translated: z.number(),
  files: z.array(
    z.object({
      catalog: z.string(),
      path: z.string(),
      keys: z.number(),
      translated: z.number(),
    })
  ),
})
export const I18nSyncInput = z.object({
  app: z.string().optional(),
  catalog: z.string().optional(),
})
export const I18nSyncOutput = z.object({
  report: z.array(
    z.object({
      app: z.string(),
      catalog: z.string(),
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
const Duplicates = z.array(
  z.object({ key: z.string(), catalogs: z.array(z.string()) })
)
export const I18nKeyInput = z.object({
  name: z.string(),
  texts: z.array(z.string()),
  app: z.string().optional(),
  catalog: z.string().optional(),
  update: z.boolean().optional(),
})
export const I18nKeyOutput = z.object({
  app: z.string(),
  key: z.string(),
  catalog: z.string(),
  action: z.enum(['added', 'updated']),
  files: z.array(
    z.object({ path: z.string(), locale: z.string(), marked: z.boolean() })
  ),
  kept: z.array(z.string()),
})
export const I18nCheckInput = z.object({
  app: z.string().optional(),
  catalog: z.string().optional(),
  strict: z.boolean().optional(),
})
export const I18nCheckOutput = z.object({
  ok: z.boolean(),
  apps: z.array(
    z.object({
      app: z.string(),
      baseLocale: z.string(),
      duplicates: Duplicates,
      catalogs: z.array(
        z.object({
          catalog: z.string(),
          untranslated: z.record(z.string(), z.number()),
          placeholders: z.array(
            z.object({
              key: z.string(),
              locale: z.string(),
              base: z.array(z.string()),
              found: z.array(z.string()),
            })
          ),
          stale: z.array(
            z.object({ locale: z.string(), keys: z.array(z.string()) })
          ),
          plural: z.array(
            z.object({
              key: z.string(),
              locale: z.string(),
              problem: z.enum([
                'missing-other',
                'unknown-category',
                'missing-category',
              ]),
              selector: z.string(),
              categories: z.array(z.string()),
            })
          ),
        })
      ),
      errors: z.number(),
      warnings: z.number(),
      ok: z.boolean(),
    })
  ),
})
export const I18nUnusedInput = z.object({
  app: z.string().optional(),
  catalog: z.string().optional(),
  fix: z.boolean().optional(),
  force: z.boolean().optional(),
})
export const I18nUnusedOutput = z.object({
  files: z.number(),
  computed: z.array(
    z.object({ file: z.string(), line: z.number(), text: z.string() })
  ),
  unparsed: z.array(z.string()),
  apps: z.array(
    z.object({
      app: z.string(),
      baseLocale: z.string(),
      duplicates: Duplicates,
      catalogs: z.array(
        z.object({
          catalog: z.string(),
          keys: z.number(),
          unused: z.array(z.string()),
        })
      ),
    })
  ),
  removed: z.array(
    z.object({
      catalog: z.string(),
      keys: z.array(z.string()),
      files: z.array(z.string()),
    })
  ),
})
export const I18nMoveInput = z.object({
  keys: z.array(z.string()),
  to: z.string(),
  app: z.string().optional(),
})
export const I18nMoveOutput = z.object({
  app: z.string(),
  to: z.string(),
  moved: z.array(
    z.object({
      key: z.string(),
      from: z.string(),
      locales: z.array(z.string()),
      marked: z.array(z.string()),
    })
  ),
  created: z.array(z.string()),
  files: z.array(z.string()),
})
export const I18nUsageInput = z.object({
  app: z.string().optional(),
  catalog: z.string().optional(),
  byPackage: z.boolean().optional(),
})
export const I18nUsageOutput = z.object({
  files: z.number(),
  computed: z.array(
    z.object({ file: z.string(), line: z.number(), text: z.string() })
  ),
  unparsed: z.array(z.string()),
  byPackage: z.boolean(),
  apps: z.array(
    z.object({
      app: z.string(),
      duplicates: Duplicates,
      catalogs: z.array(
        z.object({
          catalog: z.string(),
          keys: z.array(
            z.object({
              key: z.string(),
              files: z.array(z.string()),
              packages: z.array(z.string()),
            })
          ),
        })
      ),
    })
  ),
})
