import type {
  SurfaceDoc,
  SurfaceResult,
  SurfaceUsage,
} from './surface.types.js'

export type { SurfaceDoc, SurfaceResult, SurfaceUsage }

/** The package that computes the doc when it is built, and ships it. */
export const SURFACE_DOC_PACKAGE = '@pikku/cli'

/**
 * `@pikku/cli/surface.json`, expressed relative to the package's `.pikku` root
 * because that is where `readPackageFile` starts from.
 */
export const SURFACE_DOC_PATH = '../surface.json'

/** Relative to the project's outDir, where prebuild writes it. */
export const SURFACE_USAGE_PATH = 'surface-usage.gen.json'

export const EMPTY_SURFACE_USAGE: SurfaceUsage = { bySpecifier: {} }

/**
 * The two reads the surface is made of. Narrower than `MetaService` on purpose,
 * so the reader is exercised without a project on disk.
 */
export type SurfaceReader = {
  readFile(relativePath: string): Promise<string | null>
  readPackageFile?(
    packageName: string,
    relativePath: string
  ): Promise<string | null>
}

const read = async (
  attempt: () => Promise<string | null> | undefined
): Promise<string | null> => {
  try {
    return (await attempt()) ?? null
  } catch {
    return null
  }
}

const parseJson = <T>(content: string | null): T | null => {
  if (!content) return null
  try {
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

/**
 * Reads the framework's surface doc and this project's measured usage.
 *
 * Both halves are optional and independently so: a project on an older CLI has
 * no doc, one that has never run prebuild has no usage, and a website-like host
 * has the doc alone. Every absence is an empty result rather than a throw,
 * because the page teaches from the doc and only confirms from the usage.
 */
export const readSurface = async (
  reader: SurfaceReader
): Promise<SurfaceResult> => {
  const [docContent, usageContent] = await Promise.all([
    read(() => reader.readPackageFile?.(SURFACE_DOC_PACKAGE, SURFACE_DOC_PATH)),
    read(() => reader.readFile(SURFACE_USAGE_PATH)),
  ])

  return {
    doc: parseJson<SurfaceDoc>(docContent),
    usage: parseJson<SurfaceUsage>(usageContent) ?? EMPTY_SURFACE_USAGE,
  }
}
