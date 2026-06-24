import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { WiringService } from './wiring.service.js'

const makeMetaService = (
  overrides: Record<string, () => Promise<unknown>> = {}
) => ({
  readFile: async (_path: string) => null,
  getFunctionsMeta: async () => ({}),
  getHttpMeta: async () => ({}),
  getCliMeta: async () => ({ programs: {} }),
  getChannelsMeta: async () => ({}),
  getQueueMeta: async () => ({}),
  getSchedulerMeta: async () => ({}),
  getRpcMeta: async () => ({}),
  getMcpMeta: async () => ({}),
  getGatewayMeta: async () => ({}),
  getWorkflowMeta: async () => ({}),
  getTriggerMeta: async () => ({}),
  getTriggerSourceMeta: async () => ({}),
  getMiddlewareGroupsMeta: async () => ({}),
  getPermissionsGroupsMeta: async () => ({}),
  getAgentsMeta: async () => ({}),
  getEmailMeta: async () => ({
    src: '',
    themeHash: '',
    templates: {
      welcome: {
        variables: ['userName'],
        locales: { en: { contentHash: 'abc123' } },
      },
    },
  }),
  getSecretsMeta: async () => ({}),
  getCredentialsMeta: async () => ({}),
  getVariablesMeta: async () => ({}),
  getServicesMeta: async () => ({}),
  getEmailTemplateAssets: async () => ({
    theme: {},
    strings: {},
    layout: '',
    partials: {},
    html: '',
    subject: '',
    text: '',
    missing: [],
  }),
  ...overrides,
})

describe('WiringService.readAllMeta', () => {
  test('returns emailsMeta with templates from getEmailMeta', async () => {
    const metaService = makeMetaService()
    const service = new WiringService(metaService as never)
    const result = await service.readAllMeta()

    assert.ok(result.emailsMeta)
    assert.ok('templates' in result.emailsMeta)
    assert.ok('welcome' in (result.emailsMeta.templates ?? {}))
  })

  test('counts emails from emailsMeta.templates', async () => {
    const metaService = makeMetaService()
    const service = new WiringService(metaService as never)
    const result = await service.readAllMeta()

    assert.equal(result.counts.emails, 1)
  })

  test('returns zero email count when templates is empty', async () => {
    const metaService = makeMetaService({
      getEmailMeta: async () => ({ src: '', themeHash: '', templates: {} }),
    })
    const service = new WiringService(metaService as never)
    const result = await service.readAllMeta()

    assert.equal(result.counts.emails, 0)
  })
})
