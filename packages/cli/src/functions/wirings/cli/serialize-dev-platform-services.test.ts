import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
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

describe('the generated file typechecks', () => {
  test('under strict, with a contributor whose emitted code is typed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pikku-dev-platform-tsc-'))
    try {
      writeFileSync(
        join(dir, 'host-email.ts'),
        `export class HostEmailService {\n  constructor(readonly url: string | undefined) {}\n  send(template: 'welcome', locale: 'en'): void {}\n}\n`
      )
      const typed: PlatformServiceContributor = {
        name: 'email',
        imports: [`import { HostEmailService } from './host-email.js'`],
        emit: () => [
          `  const email = new HostEmailService(env.MAIL_URL)`,
          `  services.emailService = email`,
          `  ;[1].forEach((n: number) => email.send('welcome', 'en'))`,
        ],
      }
      const file = join(dir, 'dev-platform-services.gen.ts')
      writeFileSync(file, serializeDevPlatformServices([typed], platform))
      const program = ts.createProgram([file], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        types: [],
      })
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      assert.deepEqual(diagnostics, [])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
