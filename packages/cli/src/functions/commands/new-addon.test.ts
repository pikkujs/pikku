import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test, afterEach } from 'node:test'
import ts from 'typescript'
import {
  getAddonFiles,
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
