import type { ContributorPlatform } from '@pikku/core/contributors'
import type { ResolvedContributor } from './resolve-contributors.js'

const SERVICES_TYPE = 'Record<string, any>'

export interface SerializeContributorsOptions {
  /** In run order, as `resolveTargetContributors` returned them. */
  contributors: readonly ResolvedContributor[]
  /** Build-time facts, inlined once and handed to every `run` as plain data. */
  platform: ContributorPlatform
  /** The import specifier for a contributor's module, from the generated file. */
  specifier: (contributor: ResolvedContributor) => string
}

const identifier = (index: number) => `contributor${index}`

/**
 * The generated platform-services source for one target (or one unit): it
 * imports only the contributors it was given, so an unselected variant never
 * reaches a bundle, and runs them in the order they were resolved.
 *
 * Exports `createPlatformServices(env, runtime)`, which returns the services
 * the contributors set. Every `run` receives that same bag, so a contributor
 * that reads a service another one provides later sees it once it is set.
 * `serverStartHooks` and `serverStopHooks` list the contributors that declare
 * `onServerStart` / `onServerStop` (stop in reverse run order) for the server
 * lifecycle to call; nothing in the file calls them.
 */
export const serializeContributors = ({
  contributors,
  platform,
  specifier,
}: SerializeContributorsOptions): string => {
  const imports = contributors.map((contributor, index) => {
    const from = JSON.stringify(specifier(contributor))
    return contributor.export === 'default'
      ? `import ${identifier(index)} from ${from}`
      : `import { ${contributor.export} as ${identifier(index)} } from ${from}`
  })

  const hook = (kind: 'start' | 'stop') =>
    contributors.flatMap((contributor, index) =>
      contributor.hooks[kind]
        ? [
            `  { name: ${JSON.stringify(contributor.name)}, run: (services) => ${identifier(index)}.onServer${kind === 'start' ? 'Start' : 'Stop'}!(services) },`,
          ]
        : []
    )

  const runs = contributors.flatMap((contributor, index) => [
    `  // ${contributor.name}`,
    `  await ${identifier(index)}.run(services, env, runtime, platform)`,
  ])

  return [
    ...imports,
    ...(imports.length > 0 ? [''] : []),
    `const platform: any = ${JSON.stringify(platform)}`,
    ``,
    `export const createPlatformServices = async (env: Record<string, string | undefined>, runtime: ${SERVICES_TYPE} = {}): Promise<${SERVICES_TYPE}> => {`,
    `  const services: ${SERVICES_TYPE} = {}`,
    ...runs,
    `  return services`,
    `}`,
    ``,
    `type ServerHook = { name: string, run: (services: ${SERVICES_TYPE}) => void | Promise<void> }`,
    ``,
    `export const serverStartHooks: ServerHook[] = [`,
    ...hook('start'),
    `]`,
    ``,
    `export const serverStopHooks: ServerHook[] = [`,
    ...hook('stop').reverse(),
    `]`,
    ``,
  ].join('\n')
}
