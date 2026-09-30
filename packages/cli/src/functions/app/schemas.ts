import { z } from 'zod'

/**
 * Beside the commands rather than inside them, for the reason
 * `app-new.schemas.ts` gives: a command file imports `#pikku/function`, which
 * does not exist yet the first time codegen runs, and schema generation has to
 * import the file a schema is declared in.
 */

export const AppListInput = z.object({})

export const AppListOutput = z.object({
  apps: z.array(
    z.object({
      name: z.string(),
      cwd: z.string(),
      kind: z.string().nullable(),
      serves: z.string().nullable(),
      servedAt: z.string().nullable(),
      native: z
        .object({
          identifier: z.string(),
          platforms: z.array(z.string()),
          mode: z.enum(['bundle', 'url', 'sidecar']),
          plugins: z.array(z.string()),
        })
        .nullable(),
    })
  ),
})
export type AppListOutput = z.infer<typeof AppListOutput>

export const AppNativeInitInput = z.object({
  name: z.string(),
  desktop: z.boolean().optional(),
  android: z.boolean().optional(),
  ios: z.boolean().optional(),
  identifier: z.string().optional(),
  productName: z.string().optional(),
  url: z.string().optional(),
  bundleServer: z.boolean().optional(),
  plugins: z.string().optional(),
})
export type AppNativeInitInput = z.infer<typeof AppNativeInitInput>

export const AppNativeAddInput = z.object({
  name: z.string(),
  plugins: z.array(z.string()).optional(),
})
export type AppNativeAddInput = z.infer<typeof AppNativeAddInput>

export const AppNativeUpgradeInput = z.object({
  name: z.string(),
})
export type AppNativeUpgradeInput = z.infer<typeof AppNativeUpgradeInput>

export const AppNativeCheckInput = z.object({
  name: z.string().optional(),
})
export type AppNativeCheckInput = z.infer<typeof AppNativeCheckInput>

const NativeProblem = z.object({
  level: z.enum(['error', 'warning']),
  message: z.string(),
  fix: z.string(),
})

export const AppNativeWriteOutput = z.object({
  name: z.string(),
  dir: z.string(),
  created: z.boolean(),
  written: z.array(z.string()),
  nextSteps: z.array(z.string()),
  refusal: z.string().nullable(),
})
export type AppNativeWriteOutput = z.infer<typeof AppNativeWriteOutput>

export const AppNativeCheckOutput = z.object({
  apps: z.array(
    z.object({
      name: z.string(),
      problems: z.array(NativeProblem),
    })
  ),
  refusal: z.string().nullable(),
})
export type AppNativeCheckOutput = z.infer<typeof AppNativeCheckOutput>
