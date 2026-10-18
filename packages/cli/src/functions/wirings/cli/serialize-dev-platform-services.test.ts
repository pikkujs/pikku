import { describe, test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import type { PlatformServiceContributor } from '@pikku/deploy'
import {
  devContributorPlatform,
  serializeDevPlatformServices,
} from './serialize-dev-platform-services.js'

const email: PlatformServiceContributor = {
  name: 'email',
  imports: [`import { HostEmailService } from './host-email.js'`],
  emit: () => [`  services.emailService = new HostEmailService(env.MAIL_URL)`],
}

const platform = devContributorPlatform(['emailService', 'queueService'])

describe('serializeDevPlatformServices', () => {
  test('emits imports, then a createPlatformServices that returns the contributed services', () => {
    const code = serializeDevPlatformServices([email], platform)
    assert.equal(
      code,
      [
        `import { HostEmailService } from './host-email.js'`,
        ``,
        `export const createPlatformServices = async (env: Record<string, string | undefined>): Promise<Record<string, any>> => {`,
        `  const services: Record<string, any> = {}`,
        `  services.emailService = new HostEmailService(env.MAIL_URL)`,
        `  return services`,
        `}`,
        ``,
      ].join('\n')
    )
  })

  test('a contributor named twice is emitted once, the last winning', () => {
    const replacement: PlatformServiceContributor = {
      name: 'email',
      emit: () => [`  services.emailService = 'replaced'`],
    }
    const code = serializeDevPlatformServices([email, replacement], platform)
    assert.match(code, /replaced/)
    assert.doesNotMatch(code, /HostEmailService/)
  })

  test('imports can read which services the project requires', () => {
    const queue: PlatformServiceContributor = {
      name: 'queue',
      imports: (p) => (p.needsQueue ? [`import { Q } from './q.js'`] : []),
      emit: () => [],
    }
    assert.match(serializeDevPlatformServices([queue], platform), /Q } from/)
    assert.doesNotMatch(
      serializeDevPlatformServices([queue], devContributorPlatform([])),
      /Q } from/
    )
  })

  test('the generated source imports nothing from @pikku/deploy', () => {
    const code = serializeDevPlatformServices([email], platform)
    assert.doesNotMatch(code, /@pikku\/deploy/)
    assert.deepEqual(
      [...code.matchAll(/^import [^;]*?from '([^']+)'/gm)].map((m) => m[1]),
      ['./host-email.js']
    )
  })

  test('pikku serve never loads or merges the generated file', () => {
    const serve = readFileSync(
      new URL('../../commands/serve.ts', import.meta.url),
      'utf8'
    )
    assert.doesNotMatch(serve, /dev-platform-services|devPlatformServices/)
  })
})
