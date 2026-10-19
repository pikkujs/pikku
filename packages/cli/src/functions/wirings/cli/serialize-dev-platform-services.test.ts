import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import type { PlatformServiceContributor } from '@pikku/deploy'
import {
  devContributorPlatform,
  devRuntimeServices,
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
        `export const createPlatformServices = async (env: Record<string, string | undefined>, runtime: Record<string, any> = {}): Promise<Record<string, any>> => {`,
        `  const services: Record<string, any> = {}`,
        `  services.emailService = new HostEmailService(env.MAIL_URL)`,
        `  return services`,
        `}`,
        ``,
      ].join('\n')
    )
  })

  test('contributors run in needs/provides order and may read runtime services', () => {
    const reader: PlatformServiceContributor = {
      name: 'reader',
      needs: ['logSources', 'kysely'],
      emit: () => [`  services.reader = [services.logSources, runtime.kysely]`],
    }
    const sources: PlatformServiceContributor = {
      name: 'sources',
      provides: ['logSources'],
      emit: () => [`  services.logSources = {}`],
    }
    const code = serializeDevPlatformServices(
      [reader, sources],
      devContributorPlatform([], devRuntimeServices({ db: true }))
    )
    assert.ok(
      code.indexOf('services.logSources = {}') <
        code.indexOf('services.reader =')
    )
  })

  test('a runtime need the dev server does not hold fails codegen', () => {
    const reader: PlatformServiceContributor = {
      name: 'reader',
      needs: ['kysely'],
      emit: () => [],
    }
    assert.throws(
      () =>
        serializeDevPlatformServices(
          [reader],
          devContributorPlatform([], devRuntimeServices({ db: false }))
        ),
      /'reader' needs 'kysely', which nothing provides/
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

const typecheck = (file: string) =>
  ts
    .getPreEmitDiagnostics(
      ts.createProgram([file], {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        types: [],
      })
    )
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))

const mailService = `export class HostEmailService {
  constructor(readonly options: { url: string; onError?: (error: unknown) => void }) {}
  send(template: 'welcome', locale: 'en'): void {}
}
`

describe('the generated file typechecks', () => {
  let root: string
  let project: string
  let outside: string

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'pikku-dev-platform-tsc-')))
    project = join(root, 'project')
    outside = join(root, 'host-repo', 'mail')
    mkdirSync(join(project, '.pikku'), { recursive: true })
    mkdirSync(join(project, 'node_modules', '@host'), { recursive: true })
    mkdirSync(join(project, 'src'), { recursive: true })
    mkdirSync(join(outside, 'src'), { recursive: true })
    writeFileSync(join(project, 'package.json'), '{"type":"module"}')
    writeFileSync(
      join(outside, 'package.json'),
      JSON.stringify({
        name: '@host/mail',
        type: 'module',
        exports: {
          './service': {
            types: './src/service.ts',
            import: './src/service.ts',
          },
        },
      })
    )
    writeFileSync(join(outside, 'src', 'service.ts'), mailService)
    writeFileSync(join(project, 'src', 'local-mail.ts'), mailService)
    symlinkSync(outside, join(project, 'node_modules', '@host', 'mail'), 'dir')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const contributor = (from: string): PlatformServiceContributor => ({
    name: 'email',
    imports: [`import { HostEmailService } from ${JSON.stringify(from)}`],
    emit: () => [
      `  if (env.MAIL_URL) {`,
      `    const email = new HostEmailService({`,
      `      url: env.MAIL_URL,`,
      `      onError: (error) => console.warn(error instanceof Error ? error.message : String(error)),`,
      `    })`,
      `    services.emailService = email`,
      `    email.send('welcome', 'en')`,
      `  }`,
    ],
  })

  const generate = (from: string) => {
    const file = join(project, '.pikku', 'pikku-dev-platform-services.gen.ts')
    const code = serializeDevPlatformServices([contributor(from)], platform, {
      file,
    })
    writeFileSync(file, code)
    return { file, code }
  }

  test('a file:// URL into an installed package becomes its package export', () => {
    const { file, code } = generate(
      pathToFileURL(join(outside, 'src', 'service.ts')).href
    )
    assert.match(code, /from "@host\/mail\/service"/)
    assert.doesNotMatch(code, /file:/)
    assert.deepEqual(typecheck(file), [])
  })

  test('an absolute path outside any package becomes a path relative to .pikku', () => {
    const { file, code } = generate(join(project, 'src', 'local-mail.ts'))
    assert.match(code, /from "\.\.\/src\/local-mail\.js"/)
    assert.deepEqual(typecheck(file), [])
  })

  test('a file:// URL is what breaks it without the rewrite', () => {
    const file = join(project, '.pikku', 'pikku-dev-platform-services.gen.ts')
    writeFileSync(
      file,
      serializeDevPlatformServices(
        [contributor(pathToFileURL(join(outside, 'src', 'service.ts')).href)],
        platform
      )
    )
    assert.ok(typecheck(file).some((d) => d.startsWith('Cannot find module')))
  })

  test('bare and relative specifiers are left alone', () => {
    const code = serializeDevPlatformServices(
      [contributor('@host/mail/service')],
      platform,
      { file: join(project, '.pikku', 'x.gen.ts') }
    )
    assert.match(code, /from "@host\/mail\/service"/)
  })
})
