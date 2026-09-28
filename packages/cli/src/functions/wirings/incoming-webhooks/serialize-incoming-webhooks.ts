import type { IncomingWebhooksMeta } from '@pikku/core/webhook'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

const ADDON_DEFINITIONS = '.pikku/webhooks/pikku-incoming-webhooks.gen.js'

const sortedEntries = (meta: IncomingWebhooksMeta) =>
  Object.values(meta).sort((a, b) => a.id.localeCompare(b.id))

const importOwn = (
  meta: IncomingWebhooksMeta,
  fromFile: string,
  packageMappings: Record<string, string>
) =>
  sortedEntries(meta)
    .filter((entry) => !entry.instance && entry.sourceFile)
    .map(
      (entry, index) =>
        [
          entry.id,
          `webhook${index}`,
          `import { ${entry.exportedName} as webhook${index} } from '${getFileImportRelativePath(fromFile, entry.sourceFile!, packageMappings)}'`,
        ] as const
    )

/** Every incoming webhook's declaration by scoped id, which `pikku webhooks upsert` runs. */
export const serializeIncomingWebhookDefinitions = ({
  meta,
  incomingWebhooksFile,
  packageMappings,
}: {
  meta: IncomingWebhooksMeta
  incomingWebhooksFile: string
  packageMappings: Record<string, string>
}): string => {
  const own = importOwn(meta, incomingWebhooksFile, packageMappings)
  const ownNames = new Map(own.map(([id, local]) => [id, local]))
  const packages = [
    ...new Set(
      sortedEntries(meta)
        .map((entry) => entry.package)
        .filter((pkg): pkg is string => !!pkg)
    ),
  ]
  const addonNames = new Map(
    packages.map((pkg, index) => [pkg, `addon${index}`])
  )

  const entries = sortedEntries(meta).map((entry) => {
    const value = entry.package
      ? `${addonNames.get(entry.package)}[${JSON.stringify(entry.localId)}]`
      : ownNames.get(entry.id)
    return `  ${JSON.stringify(entry.id)}: ${value},`
  })

  return [
    `import type { CoreIncomingWebhook } from '@pikku/core/webhook'`,
    ...own.map(([, , line]) => line),
    ...packages.map(
      (pkg) =>
        `import { incomingWebhooks as ${addonNames.get(pkg)} } from '${pkg}/${ADDON_DEFINITIONS}'`
    ),
    '',
    `export const incomingWebhooks: Record<string, CoreIncomingWebhook<any>> = {`,
    ...entries,
    `}`,
    '',
  ].join('\n')
}

/**
 * Mounts each incoming webhook's route. An addon's is wired without `func`:
 * the route's `ns:fn` id reaches the addon's own function inside its instance,
 * so the instance's secret overrides apply and the raw request is kept.
 */
export const serializeIncomingWebhookWiring = ({
  meta,
  incomingWebhooksWiringFile,
  packageMappings,
}: {
  meta: IncomingWebhooksMeta
  incomingWebhooksWiringFile: string
  packageMappings: Record<string, string>
}): string => {
  const own = importOwn(meta, incomingWebhooksWiringFile, packageMappings)
  const ownNames = new Map(own.map(([id, local]) => [id, local]))
  const wirings = sortedEntries(meta).map((entry) => {
    const local = ownNames.get(entry.id)
    return local
      ? `wireHTTP({ method: 'post', route: ${JSON.stringify(entry.route)}, auth: false, func: ${local}.func })`
      : `wireHTTP({ method: 'post', route: ${JSON.stringify(entry.route)}, auth: false } as WireHTTPInput)`
  })
  const hasAddon = sortedEntries(meta).some((entry) => !ownNames.has(entry.id))
  return [
    `import { wireHTTP } from '@pikku/core/http'`,
    ...own.map(([, , line]) => line),
    '',
    ...(hasAddon
      ? [`type WireHTTPInput = Parameters<typeof wireHTTP>[0]`, '']
      : []),
    ...wirings,
    '',
  ].join('\n')
}
