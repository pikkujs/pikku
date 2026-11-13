import type { CLIMeta, CLIProgramMeta } from '@pikku/core/cli'
import type { PikkuCLIConfig } from '../../../../types/config.js'

type ConfiguredCLIEntrypoints = NonNullable<
  NonNullable<PikkuCLIConfig['cli']>['entrypoints']
>[string]

export type NormalizedCLIEntrypoint =
  | { type: 'local'; path: string }
  | {
      type: 'channel'
      name: string
      route: string
      wirePath: string
      path?: string
    }

/**
 * One program's `cli.entrypoints` entry as a list, with a channel's name and
 * route defaulted the way the generated channel registers them.
 */
export const normalizeCLIEntrypoints = (
  programName: string,
  entrypoints: ConfiguredCLIEntrypoints,
  globalHTTPPrefix: string = ''
): NormalizedCLIEntrypoint[] =>
  (Array.isArray(entrypoints) ? entrypoints : [entrypoints]).map(
    (entrypoint) => {
      if (typeof entrypoint === 'string') {
        return { type: 'local', path: entrypoint }
      }
      if (entrypoint.type === 'channel') {
        return {
          type: 'channel',
          name: entrypoint.name || `${programName}-cli`,
          route: entrypoint.route || `${globalHTTPPrefix}/cli/${programName}`,
          wirePath: entrypoint.wirePath,
          path: entrypoint.path,
        }
      }
      if (!entrypoint.path) {
        throw new Error(
          `CLI entrypoint must have a path: ${JSON.stringify(entrypoint)}`
        )
      }
      return { type: 'local', path: entrypoint.path }
    }
  )

/**
 * The CLI metadata with each configured program's `entrypoints`: `local` when
 * it runs the app in-process, `channel` with the channel name and route when
 * it talks to a running app.
 */
export const withCLIEntrypoints = (
  meta: CLIMeta,
  config: Pick<PikkuCLIConfig, 'cli' | 'globalHTTPPrefix'>
): CLIMeta => {
  const configured = config.cli?.entrypoints
  if (!configured) return meta
  const programs: Record<string, CLIProgramMeta> = { ...meta.programs }
  for (const [programName, entrypoints] of Object.entries(configured)) {
    const programMeta = programs[programName]
    if (!programMeta) continue
    programs[programName] = {
      ...programMeta,
      entrypoints: normalizeCLIEntrypoints(
        programName,
        entrypoints,
        config.globalHTTPPrefix || ''
      ).map((entrypoint) =>
        entrypoint.type === 'channel'
          ? {
              type: 'channel',
              channel: entrypoint.name,
              route: entrypoint.route,
            }
          : { type: 'local' }
      ),
    }
  }
  return { ...meta, programs }
}
