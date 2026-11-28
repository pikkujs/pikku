import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  EntryGenerationContext,
  EntryPlatformServices,
  ProviderAdapter,
} from '@pikku/deploy'

export const PLATFORM_SERVICES_FILE = 'platform-services.gen.ts'

/**
 * The services a unit's own generated `pikku-services.gen.ts` marks as
 * required: what the functions, middleware and permissions it bundles
 * destructure. Empty when the file is missing.
 */
export const readUnitRequiredServices = async (
  pikkuDir: string
): Promise<Set<string>> => {
  const required = new Set<string>()
  try {
    const content = await readFile(
      join(pikkuDir, 'pikku-services.gen.ts'),
      'utf-8'
    )
    const block = content.match(
      /export const requiredSingletonServices = \{([^}]+)\}/
    )
    for (const line of block?.[1]!.split('\n') ?? []) {
      const kv = line.match(/'([^']+)':\s*true/)
      if (kv) required.add(kv[1]!)
    }
  } catch {
    // No services map: the unit reaches nothing.
  }
  return required
}

/**
 * The file a unit's entry imports to run the host's platform services module. It
 * exports `createPlatformServices(env, runtime)`, which returns what the entry
 * already holds with what the host module returns over it.
 *
 * With a `coercionMap`, a `kysely` the host creates is wrapped with
 * `createCoercionPlugin`, so a deployed query returns the Date, boolean and
 * parsed JSON values `pikku dev` returns. The entry's own `kysely` is left as
 * it is.
 */
export const serializePlatformServices = (options: {
  /** The import specifier of the host's module, from the generated file. */
  hostModule: string
  /** The services the unit reaches, handed to the host module. */
  requiredServices: readonly string[]
  coercionMap?: Record<string, Record<string, string>>
}): string => {
  const { hostModule, requiredServices, coercionMap } = options
  const coerce =
    coercionMap !== undefined && Object.keys(coercionMap).length > 0

  return [
    ...(coerce ? [`import { createCoercionPlugin } from '@pikku/kysely'`] : []),
    `import { createPlatformServices as createHostPlatformServices } from ${JSON.stringify(hostModule)}`,
    ``,
    ...(coerce
      ? [
          `const coercionMap = ${JSON.stringify(coercionMap)}`,
          ``,
          `const coercedKysely = (kysely: any): any => {`,
          `  const coerced = kysely.withPlugin(createCoercionPlugin({ map: coercionMap as any }))`,
          `  return Object.assign(coerced, { stop: () => (kysely.stop ? kysely.stop() : coerced.destroy()) })`,
          `}`,
          ``,
        ]
      : []),
    `export const createPlatformServices = async (`,
    `  env: Record<string, string | undefined>,`,
    `  runtime: Record<string, unknown> = {}`,
    `): Promise<Record<string, unknown>> => {`,
    `  const hosted: Record<string, any> = {`,
    `    ...(await createHostPlatformServices(env, { ...runtime }, { requiredServices: ${JSON.stringify(requiredServices)} })),`,
    `  }`,
    ...(coerce
      ? [
          `  if (hosted.kysely && hosted.kysely !== runtime.kysely) hosted.kysely = coercedKysely(hosted.kysely)`,
        ]
      : []),
    `  return { ...runtime, ...hosted }`,
    `}`,
    ``,
  ].join('\n')
}

/**
 * Writes the platform services file for a unit whose provider names a host
 * module, or removes a stale one and returns undefined when it names none.
 */
export async function writeUnitPlatformServices(options: {
  provider: ProviderAdapter
  ctx: EntryGenerationContext
  /** The services the unit's functions, middleware and permissions destructure. */
  requiredServices: ReadonlySet<string>
  /** The services the project's own service factory reads. */
  projectServicesRead?: readonly string[]
}): Promise<EntryPlatformServices | undefined> {
  const { provider, ctx } = options
  const file = join(ctx.unitDir, PLATFORM_SERVICES_FILE)
  const hostModule = provider.platformServicesModule?.(ctx)
  if (!hostModule) {
    await rm(file, { force: true })
    return undefined
  }

  await writeFile(
    file,
    serializePlatformServices({
      hostModule,
      coercionMap: ctx.coercionMap,
      requiredServices: [
        ...new Set([
          ...options.requiredServices,
          ...(options.projectServicesRead ?? []),
        ]),
      ].sort(),
    }),
    'utf-8'
  )
  return { importPath: `./${PLATFORM_SERVICES_FILE.replace(/\.ts$/, '.js')}` }
}
