import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, test, afterEach } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import {
  getAddonFiles,
  getTestFiles,
  resolveAddonDepProtocol,
  type AddonVars,
} from './new-addon.js'

const created: string[] = []

async function makeTmp() {
  const dir = await mkdtemp(join(tmpdir(), 'pikku-new-addon-'))
  created.push(dir)
  return dir
}

async function writeJson(path: string, data: unknown) {
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8')
}

afterEach(async () => {
  while (created.length) {
    await rm(created.pop()!, { recursive: true, force: true })
  }
})

describe('resolveAddonDepProtocol', () => {
  test('uses the workspace protocol inside a yarn workspace', async () => {
    const root = await makeTmp()
    await writeJson(join(root, 'package.json'), {
      name: 'root',
      private: true,
      workspaces: ['packages/**'],
    })
    const target = join(root, 'packages', 'communication')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'workspace:*')
  })

  test('supports the object form of workspaces', async () => {
    const root = await makeTmp()
    await writeJson(join(root, 'package.json'), {
      name: 'root',
      private: true,
      workspaces: { packages: ['packages/*'] },
    })
    const target = join(root, 'packages')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'workspace:*')
  })

  test('falls back to file: when there is no workspace ancestor', async () => {
    const root = await makeTmp()
    const target = join(root, 'standalone')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'file:..')
  })

  test('ignores an ancestor package.json that declares no workspaces', async () => {
    const root = await makeTmp()
    await writeJson(join(root, 'package.json'), { name: 'not-a-workspace' })
    const target = join(root, 'nested')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'file:..')
  })

  test('tolerates unparseable package.json while walking up', async () => {
    const root = await makeTmp()
    await writeFile(join(root, 'package.json'), '{ not json', 'utf8')
    const target = join(root, 'nested')
    await mkdir(target, { recursive: true })

    assert.equal(resolveAddonDepProtocol(target), 'file:..')
  })
})

const vars = (displayName: string, description: string): AddonVars => ({
  name: 'crm',
  camelName: 'crm',
  pascalName: 'Crm',
  screamingName: 'CRM',
  displayName,
  description,
  category: 'General',
  addonDepProtocol: 'workspace:*',
})

/** Every flag combination that embeds the prose in a different shape. */
const flagVariants: Parameters<typeof getAddonFiles>[1][] = [
  { secret: false, variable: false, oauth: false },
  { secret: true, variable: true, oauth: false },
  { secret: false, variable: false, oauth: true },
  { secret: false, variable: false, oauth: false, credential: 'apikey' },
  { secret: false, variable: false, oauth: false, credential: 'bearer' },
  {
    secret: false,
    variable: false,
    oauth: false,
    credential: 'bearer',
    delegated: true,
  },
  { secret: false, variable: false, oauth: false, credential: 'oauth2' },
]

const parseErrors = (fileName: string, source: string) => {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

const scaffoldErrors = (displayName: string, description: string) => {
  const errors: string[] = []
  for (const flags of flagVariants) {
    const files = getAddonFiles(vars(displayName, description), flags)
    for (const [path, source] of Object.entries(files)) {
      if (!path.endsWith('.ts')) {
        continue
      }
      for (const diagnostic of parseErrors(path, source)) {
        errors.push(`${path}: ${diagnostic.messageText}`)
      }
    }
  }
  return errors
}

describe('getAddonFiles', () => {
  test('scaffolds parseable sources for ordinary prose', () => {
    assert.deepEqual(scaffoldErrors('Acme CRM', 'Acme CRM integration'), [])
  })

  /**
   * `--display-name` and `--description` are free-form prose, and interpolated
   * raw into a quoted string an apostrophe terminated the literal — the
   * scaffolded addon did not compile before the user had written a line of it.
   * A backtick or a `${` does the same inside the generated template literals.
   */
  test('scaffolds parseable sources for prose needing escaping', () => {
    assert.deepEqual(
      scaffoldErrors(
        'Bob\'s "Big" CRM \\ Ltd ${escape} `tick`',
        'Bob\'s "Big" CRM \\ integration'
      ),
      []
    )
  })

  /**
   * The addon's package.json `imports` map points into `dist`, which is empty
   * until the addon has been built once — so its own source build resolves
   * `#pikku/<leaf>` through tsconfig `paths` instead. A `paths` map naming only
   * the hub leaves every leaf unresolvable, and the addon does not compile.
   */
  test('the tsconfig paths resolve the leaves, not the hub', () => {
    const addonPaths = JSON.parse(
      getAddonFiles(vars('Acme CRM', 'desc'), {
        secret: false,
        variable: false,
        oauth: false,
      })['tsconfig.json']!
    ).compilerOptions.paths

    assert.deepEqual(addonPaths, {
      '#pikku/*.js': ['./.pikku/*.ts'],
      '#pikku/*': ['./.pikku/*/index.ts', './.pikku/*'],
    })
  })

  /**
   * `pikku all` roots an addon's generated tree one level down, at
   * `.pikku/addon/`, so every published target has to carry that segment. The
   * subpath a consumer writes does not: it names `.pikku/rpc/...` exactly as it
   * would for an application, and the leaf stays the package's own business.
   */
  test('the published exports resolve into the addon leaf', () => {
    const exports = JSON.parse(
      getAddonFiles(vars('Acme CRM', 'desc'), {
        secret: false,
        variable: false,
        oauth: false,
      })['package.json']!
    ).exports

    assert.equal(exports['./.pikku/*'], './dist/.pikku/addon/*')
    assert.equal(
      exports['./.pikku/rpc/pikku-rpc-wirings-map.internal.gen.js'].types,
      './dist/.pikku/addon/rpc/pikku-rpc-wirings-map.internal.gen.d.ts'
    )
  })

  test('the test harness tsconfig resolves the leaves too', () => {
    const testPaths = JSON.parse(
      getTestFiles(vars('Acme CRM', 'desc'))['tsconfig.json']!
    ).compilerOptions.paths

    assert.deepEqual(testPaths, {
      '#pikku/*.js': ['./.pikku/*.ts'],
      '#pikku/*': ['./.pikku/*/index.ts', './.pikku/*'],
    })
  })

  /**
   * The application types live behind `@pikku/core/types`, not the package
   * root. A scaffold naming the root still parses, so every check above stays
   * green while `SingletonServices` extends an unresolved name — which the
   * inspector reads as an addon declaring no services at all.
   */
  test('the scaffolded application types name a subpath that exports them', () => {
    const applicationTypes = getAddonFiles(vars('Acme CRM', 'desc'), {
      secret: false,
      variable: false,
      oauth: false,
    })['types/application-types.d.ts']!

    const specifier = applicationTypes.match(
      /import type \{[^}]*\} from '(@pikku\/core[^']*)'/
    )?.[1]
    assert.ok(specifier, 'the scaffold imports the core application types')

    const coreRoot = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      'core'
    )
    const subpath = specifier.slice('@pikku/core'.length) || '.'
    const target: string = JSON.parse(
      readFileSync(join(coreRoot, 'package.json'), 'utf8')
    ).exports[subpath === '.' ? '.' : `.${subpath}`]
    assert.ok(target, `@pikku/core does not export ${specifier}`)

    // The entry point re-exports rather than declares, so what it carries is
    // only visible by walking the chain — the names are declared in the same
    // file either way, and a check on the declaration passes for a subpath
    // that does not re-export them.
    const reachable = (entry: string, seen = new Set<string>()): string => {
      if (seen.has(entry)) return ''
      seen.add(entry)
      const source = readFileSync(entry, 'utf8')
      const resolve = (specifier: string) =>
        join(dirname(entry), specifier.replace(/\.js$/, '.ts'))
      let text = source
      for (const star of source.matchAll(
        /export (?:type )?\* from '(\.[^']*)'/g
      )) {
        text += reachable(resolve(star[1]!), seen)
      }
      for (const named of source.matchAll(
        /export (?:type )?\{([^}]*)\} from '(\.[^']*)'/g
      )) {
        const carried = reachable(resolve(named[2]!), new Set(seen))
        for (const name of named[1]!.split(',')) {
          const exported = name.trim().split(/\s+as\s+/)[0]
          if (!exported) continue
          const declaration = carried.match(
            new RegExp(
              `\\bexport (?:interface|type|const|class) ${exported}\\b`
            )
          )
          if (declaration) text += `\n${declaration[0]}`
        }
      }
      return text
    }

    const exported = reachable(
      join(
        coreRoot,
        target.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts')
      )
    )
    for (const name of applicationTypes.matchAll(/\bCore[A-Za-z]+/g)) {
      assert.match(
        exported,
        new RegExp(`\\bexport (?:interface|type) ${name[0]}\\b`),
        `${name[0]} is not reachable from ${specifier}`
      )
    }
  })

  test('keeps composed prose in a single string literal', () => {
    const files = getAddonFiles(vars("Bob's CRM", 'desc'), {
      secret: true,
      variable: false,
      oauth: false,
    })

    assert.match(
      files['src/crm.secret.ts']!,
      /describe\("Bob's CRM API key"\)/,
      'the display name and the words around it are one literal'
    )
  })
})
