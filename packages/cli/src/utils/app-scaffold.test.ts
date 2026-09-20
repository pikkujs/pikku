import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assignPersonaApp,
  nextPort,
  personaAppsInSource,
  personasNamedInSource,
  refuseNewApp,
  retargetApp,
  validateSlug,
  type Frontend,
} from './app-scaffold.js'

const app = (over: Partial<Frontend> = {}): Frontend => ({
  cwd: 'apps/app',
  dev: { command: ['bun', 'dev'], port: 7104, healthPath: '/' },
  ...over,
})

describe('validateSlug', () => {
  test('accepts a directory-, package- and host-safe slug', () => {
    assert.equal(validateSlug('Supplier-Portal'), 'supplier-portal')
  })

  test('rejects what cannot be one', () => {
    for (const bad of ['1st', '-lead', 'has space', '', 'a'.repeat(40)]) {
      assert.equal(validateSlug(bad), null, bad)
    }
  })

  // `api` is the backend's own name on every host that serves both halves.
  test('api is reserved', () => {
    assert.equal(validateSlug('api'), null)
  })
})

describe('nextPort', () => {
  test('the first frontend takes the default', () => {
    assert.equal(nextPort({}), 7104)
  })

  test('each later one takes the next free port, never a duplicate', () => {
    assert.equal(nextPort({ app: app(), admin: app({ dev: { command: [], port: 7105, healthPath: '/' } }) }), 7106)
  })

  test('a frontend with no dev port does not drag the next one to NaN', () => {
    assert.equal(nextPort({ app: app({ dev: undefined }) }), 7104)
  })
})

describe('refuseNewApp', () => {
  const none = new Map<string, string>()

  test('a surface word is not an audience', () => {
    const r = refuseNewApp('admin', 'dashboard', ['ops'], {}, none)
    assert.match(r ?? '', /names a SURFACE, not the people/)
  })

  // Two ROLES are not two apps. This is the rule the whole command exists for.
  test('an audience that already has an app does not get a second one', () => {
    const r = refuseNewApp('backoffice', 'staff', ['manager'], { app: app({ serves: 'staff' }) }, none)
    assert.match(r ?? '', /already serves staff/)
    assert.match(r ?? '', /differ by nav and permitted actions/)
  })

  // The plan's first app IS the one on disk, keyed `app`. Without this the
  // caller reads the audience refusal as a collision and tries to create the
  // app it is already inside.
  test('the plan name of an existing app points back at it', () => {
    const r = refuseNewApp('customer', 'customer', ['buyer'], { app: app({ planSlug: 'customer' }) }, none)
    assert.match(r ?? '', /IS your customer/)
  })

  test('a persona who already signs in elsewhere is not moved silently', () => {
    const r = refuseNewApp('supplier', 'supplier', ['rep'], { app: app({ serves: 'staff' }) }, new Map([['rep', 'app']]))
    assert.match(r ?? '', /rep already belong to the "app" app/)
  })

  test('a genuinely new audience is permitted', () => {
    assert.equal(
      refuseNewApp('supplier', 'supplier', ['rep'], { app: app({ serves: 'staff' }) }, none),
      null
    )
  })
})

describe('personas in source', () => {
  const SOURCE = `export const personas = definePersonas({
  owner: {
    name: 'Owner',
    app: 'app',
  },
  supplierRep: {
    name: 'Supplier rep',
  },
})
`
  async function withSource(body: string, fn: (dir: string) => Promise<void>) {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-app-'))
    try {
      await mkdir(join(dir, 'packages', 'functions', 'src'), { recursive: true })
      await writeFile(join(dir, 'packages', 'functions', 'src', 'personas.ts'), body)
      await fn(dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }

  test('every declared persona is found, with or without an app', async () => {
    await withSource(SOURCE, async (dir) => {
      assert.deepEqual([...personasNamedInSource(dir)].sort(), ['owner', 'supplierRep'])
      assert.deepEqual([...personaAppsInSource(dir)], [['owner', 'app']])
    })
  })

  test('assigning an app adds it where absent and replaces it where present', async () => {
    await withSource(SOURCE, async (dir) => {
      assert.equal(assignPersonaApp(dir, ['owner', 'supplierRep'], 'supplier'), true)
      const after = await readFile(join(dir, 'packages', 'functions', 'src', 'personas.ts'), 'utf8')
      assert.equal(after.match(/app: 'supplier'/g)?.length, 2)
      assert.equal(after.includes("app: 'app'"), false)
    })
  })

  test('naming nobody who exists changes nothing', async () => {
    await withSource(SOURCE, async (dir) => {
      assert.equal(assignPersonaApp(dir, ['nobody'], 'supplier'), false)
    })
  })
})

describe('retargetApp', () => {
  test('the clone takes its own name, port and build cache', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pikku-clone-'))
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: '@project/app',
          scripts: {
            dev: 'vite dev --port 7104',
            preview: 'vite preview --port=7104',
            tsc: 'tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/app-tsc.tsbuildinfo',
          },
        })
      )
      retargetApp(dir, 'supplier', 7105)
      const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
      assert.equal(pkg.name, '@project/supplier')
      assert.equal(pkg.scripts.dev, 'vite dev --port 7105')
      assert.equal(pkg.scripts.preview, 'vite preview --port=7105')
      // Two apps sharing one incremental cache produce type errors that vanish
      // on a clean build — an hour of debugging for a one-word edit.
      assert.match(pkg.scripts.tsc, /supplier-tsc\.tsbuildinfo/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
