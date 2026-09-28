import type { WebhookDefinitionsMeta } from '@pikku/core/webhook'
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
): WebhookDefinitionsMeta => {
  const meta: WebhookDefinitionsMeta = {}
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
  webhooksFile,
  packageMappings,
}: {
  webhooks: readonly WebhookDeclaration[]
  webhooksFile: string
  packageMappings: Record<string, string>
}): string => {
  const sorted = [...webhooks].sort((a, b) => a.event.localeCompare(b.event))
  const imports = sorted.map(
    (webhook, index) =>
      `import type { ${webhook.variable} as webhook${index} } from '${getFileImportRelativePath(webhooksFile, webhook.file, packageMappings)}'`
  )
  const entries = sorted.map(
    (webhook, index) =>
      `  ${JSON.stringify(webhook.event)}: WebhookPayloadOf<typeof webhook${index}>`
  )
  return [
    `import type { TypedWebhookService as CoreTypedWebhookService${entries.length > 0 ? ', WebhookPayloadOf' : ''} } from '@pikku/core/webhook'`,
    `import type { WebhookService } from '@pikku/core/services'`,
    `import './pikku-webhooks-meta.gen.json' with { type: 'json' }`,
    ...imports,
    '',
    entries.length > 0
      ? `export interface WebhooksMap {\n${entries.join('\n')}\n}`
      : `export interface WebhooksMap {}`,
    '',
    `export type WebhookEvent = keyof WebhooksMap`,
    '',
    `export type TypedWebhookService = CoreTypedWebhookService<WebhooksMap>`,
    '',
    `export const typedWebhookService = (service: WebhookService): TypedWebhookService =>\n  service as unknown as TypedWebhookService`,
    '',
  ].join('\n')
}
