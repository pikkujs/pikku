import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { devRuntimeServices, localSpecifier } from './dev-specifier.js'

describe('devRuntimeServices', () => {
  test('kysely is a baseline service only when the app has a db', () => {
    assert.ok(!devRuntimeServices({ db: false }).includes('kysely'))
    assert.ok(devRuntimeServices({ db: true }).includes('kysely'))
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

  const generate = (from: string) => {
    const file = join(project, '.pikku', 'pikku-dev-contributors.gen.ts')
    const specifier = localSpecifier(from, { file })
    const code = `import { HostEmailService } from ${JSON.stringify(specifier)}\nexport const email = new HostEmailService({ url: 'x' })\nemail.send('welcome', 'en')\n`
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
    const file = join(project, '.pikku', 'raw.gen.ts')
    writeFileSync(
      file,
      `import { HostEmailService } from ${JSON.stringify(pathToFileURL(join(outside, 'src', 'service.ts')).href)}\nexport const e = HostEmailService\n`
    )
    assert.ok(typecheck(file).some((d) => d.startsWith('Cannot find module')))
  })

  test('bare and relative specifiers are left alone', () => {
    const file = join(project, '.pikku', 'x.gen.ts')
    assert.equal(
      localSpecifier('@host/mail/service', { file }),
      '@host/mail/service'
    )
    assert.equal(localSpecifier('./local.js', { file }), './local.js')
  })
})
