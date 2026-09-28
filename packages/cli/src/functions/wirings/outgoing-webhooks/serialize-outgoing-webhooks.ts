import type { OutgoingWebhooksMeta } from '@pikku/core/webhook'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface WebhookDeclaration {
  file: string
  variable: string
  event: string
  title: string
  description?: string
  payload?: Record<string, string>
}

export const buildWebhooksMeta = (
  webhooks: readonly WebhookDeclaration[]
): OutgoingWebhooksMeta => {
  const meta: OutgoingWebhooksMeta = {}
  for (const webhook of [...webhooks].sort((a, b) =>
    a.event.localeCompare(b.event)
  )) {
    meta[webhook.event] = {
      event: webhook.event,
      title: webhook.title,
      ...(webhook.description !== undefined
        ? { description: webhook.description }
        : {}),
      ...(webhook.payload ? { payload: webhook.payload } : {}),
      exportedName: webhook.variable,
      sourceFile: webhook.file,
    }
  }
  return meta
}

export const serializeWebhooks = ({
  webhooks,
  outgoingWebhooksFile,
  packageMappings,
}: {
  webhooks: readonly WebhookDeclaration[]
  outgoingWebhooksFile: string
  packageMappings: Record<string, string>
}): string => {
  const sorted = [...webhooks].sort((a, b) => a.event.localeCompare(b.event))
  const imports = sorted.map(
    (webhook, index) =>
      `import type { ${webhook.variable} as webhook${index} } from '${getFileImportRelativePath(outgoingWebhooksFile, webhook.file, packageMappings)}'`
  )
  const entries = sorted.map(
    (webhook, index) =>
      `  ${JSON.stringify(webhook.event)}: OutgoingWebhookPayloadOf<typeof webhook${index}>`
  )
  return [
    entries.length > 0
      ? `import type { TypedWebhookService as CoreTypedWebhookService, OutgoingWebhookPayloadOf } from '@pikku/core/webhook'`
      : `import type { TypedWebhookService as CoreTypedWebhookService } from '@pikku/core/webhook'`,
    `import type { WebhookService } from '@pikku/core/services'`,
    `import './pikku-outgoing-webhooks-meta.gen.json' with { type: 'json' }`,
    ...imports,
    '',
    entries.length > 0
      ? `export interface OutgoingWebhooksMap {\n${entries.join('\n')}\n}`
      : `export interface OutgoingWebhooksMap {}`,
    '',
    `export type OutgoingWebhookEvent = keyof OutgoingWebhooksMap`,
    '',
    `export type TypedWebhookService = CoreTypedWebhookService<OutgoingWebhooksMap>`,
    '',
    `export const typedWebhookService = (service: WebhookService): TypedWebhookService =>\n  service as unknown as TypedWebhookService`,
    '',
  ].join('\n')
}
