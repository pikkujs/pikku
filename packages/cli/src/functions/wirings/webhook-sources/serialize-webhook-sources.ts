import type { WebhookSourcesMeta } from '@pikku/core/trigger'
import { PIKKU_INCOMING_WEBHOOK_QUEUE_NAME } from '@pikku/core/trigger'

export const WEBHOOK_SOURCE_SCHEMAS = `/**
 * Auto-generated webhook source schemas
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { z } from 'zod'

/** Whatever the provider sent, as parsed; \`receive\` reads the raw bytes instead. */
export const WebhookSourceBody = z.record(z.string(), z.unknown())

export const WebhookSourceJob = z.object({
  source: z.string(),
  event: z.object({
    name: z.string(),
    id: z.string().optional(),
    data: z.unknown(),
  }),
  receiptId: z.string().optional(),
})
`

/**
 * Lowers every webhook source onto an open route that receives and queues its
 * events, plus the one worker that dispatches them to their triggers.
 */
export const serializeWebhookSourceWirings = (
  meta: WebhookSourcesMeta,
  leaf: (name: string) => string,
  schemasImportPath: string
): string => {
  const routes = Object.values(meta)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(
      (source) => `wireHTTP({
  method: ${JSON.stringify(source.method)},
  route: ${JSON.stringify(source.route)},
  auth: false,
  tags: ['pikku'],
  func: pikkuSessionlessFunc({
    tags: ['pikku'],
    input: WebhookSourceBody,
    func: async (_services, _data, wire) =>
      receiveWebhookSourceRequest(${JSON.stringify(source.name)}, wire),
  }),
})
`
    )

  return `/**
 * Auto-generated webhook source routes and worker
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { pikkuSessionlessFunc } from '${leaf('function')}'
import { wireHTTP } from '${leaf('http')}'
import { wireQueueWorker } from '${leaf('queue')}'
import {
  dispatchWebhookSourceJob,
  receiveWebhookSourceRequest,
} from '@pikku/core/trigger'
import { WebhookSourceBody, WebhookSourceJob } from '${schemasImportPath}'

${routes.join('\n')}
wireQueueWorker({
  name: '${PIKKU_INCOMING_WEBHOOK_QUEUE_NAME}',
  tags: ['pikku'],
  func: pikkuSessionlessFunc({
    tags: ['pikku'],
    input: WebhookSourceJob,
    func: async (_services, data) => dispatchWebhookSourceJob(data),
  }),
})
`
}

/**
 * The entry \`pikku webhooks\` loads: the app's own config and services, so
 * each source's check, setup and teardown reach the provider with the
 * credentials the app runs with.
 */
export const serializeWebhookSourcesLifecycle = ({
  bootstrapPath,
  pikkuConfigFactory,
  singletonServicesFactory,
}: {
  bootstrapPath: string
  pikkuConfigFactory?: { path: string; variable: string }
  singletonServicesFactory: { path: string; variable: string }
}): string => `/**
 * Auto-generated webhook source lifecycle entry
 * Do not edit manually - regenerate with 'npx pikku'
 */
import { LocalVariablesService } from '@pikku/core/services'
import { pikkuState } from '@pikku/core/state'
import { runWebhookSourceLifecycle } from '@pikku/core/trigger'
${pikkuConfigFactory ? `import { ${pikkuConfigFactory.variable} as createConfig } from '${pikkuConfigFactory.path}'\n` : ''}import { ${singletonServicesFactory.variable} as createSingletonServices } from '${singletonServicesFactory.path}'
import '${bootstrapPath}'

export const runWebhookSources = async (
  args: Omit<Parameters<typeof runWebhookSourceLifecycle>[0], 'singletonServices'>
) => {
  const config = ${pikkuConfigFactory ? 'await createConfig(new LocalVariablesService())' : '{}'}
  const singletonServices = await createSingletonServices(config as any)
  pikkuState(null, 'package', 'singletonServices', singletonServices)
  return runWebhookSourceLifecycle({ ...args, singletonServices })
}
`
