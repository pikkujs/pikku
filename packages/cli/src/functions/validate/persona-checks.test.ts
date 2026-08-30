import assert from 'node:assert'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { runPersonaChecks } from './persona-checks.js'

const makeTmp = async () => mkdtemp(join(tmpdir(), 'pikku-persona-checks-'))

const config = {
  srcDirectories: ['packages/functions/src'],
  outDir: 'packages/functions/.pikku',
  environments: { local: { apiUrl: 'http://localhost:4002' } },
}

const srcDir = (root: string) => join(root, 'packages', 'functions', 'src')

const writeSource = async (
  root: string,
  name: string,
  contents: string
): Promise<void> => {
  await mkdir(srcDir(root), { recursive: true })
  await writeFile(join(srcDir(root), name), contents, 'utf8')
}

const writePersonaMeta = async (
  root: string,
  meta: Record<string, unknown>
): Promise<void> => {
  const dir = join(root, 'packages', 'functions', '.pikku', 'scopes')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'pikku-personas-meta.gen.json'),
    JSON.stringify(meta, null, 2),
    'utf8'
  )
}

const actorWiring = [
  "import { actor } from '@pikku/better-auth'",
  'export const auth = () => ({ plugins: [actor({ secret: undefined })] })',
  '',
].join('\n')

const personaDeclaration = [
  "import { definePersonas } from '#pikku/scopes/pikku-personas.gen.js'",
  'definePersonas({',
  "  founder: { name: 'Anna Müller' },",
  '})',
  '',
].join('\n')

const ids = (findings: { id: string }[]): string[] => findings.map((f) => f.id)

describe('persona checks', () => {
  test('no personas anywhere → warns, and says nothing further', async () => {
    const tmp = await makeTmp()
    try {
      await mkdir(srcDir(tmp), { recursive: true })
      const findings = await runPersonaChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), ['no-personas'])
      assert.strictEqual(findings[0]!.severity, 'warn')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('personas in generated meta + actor sign-in → no findings', async () => {
    const tmp = await makeTmp()
    try {
      await writePersonaMeta(tmp, { founder: { id: 'founder' } })
      await writeSource(tmp, 'auth.wiring.ts', actorWiring)
      const findings = await runPersonaChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a source declaration counts before codegen has ever run', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'personas.ts', personaDeclaration)
      await writeSource(tmp, 'auth.wiring.ts', actorWiring)
      const findings = await runPersonaChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('an empty generated meta falls back to the source scan', async () => {
    const tmp = await makeTmp()
    try {
      await writePersonaMeta(tmp, {})
      await writeSource(tmp, 'personas.ts', personaDeclaration)
      await writeSource(tmp, 'auth.wiring.ts', actorWiring)
      const findings = await runPersonaChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('personas without actor sign-in → warns', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'personas.ts', personaDeclaration)
      const findings = await runPersonaChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), ['personas-no-actor-sign-in'])
      assert.strictEqual(findings[0]!.severity, 'warn')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a hand-rolled /sign-in/actor route satisfies the check', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'personas.ts', personaDeclaration)
      await writeSource(
        tmp,
        'actor.http.ts',
        "wireHTTP({ method: 'post', route: '/auth/sign-in/actor' })\n"
      )
      const findings = await runPersonaChecks(tmp, config)
      assert.deepStrictEqual(ids(findings), [])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('personas with no configured environment → warns', async () => {
    const tmp = await makeTmp()
    try {
      await writeSource(tmp, 'personas.ts', personaDeclaration)
      await writeSource(tmp, 'auth.wiring.ts', actorWiring)
      const findings = await runPersonaChecks(tmp, {
        ...config,
        environments: {},
      })
      assert.deepStrictEqual(ids(findings), ['personas-no-environments'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  test('a missing pikku config still reports the missing personas', async () => {
    const tmp = await makeTmp()
    try {
      const findings = await runPersonaChecks(tmp, null)
      assert.deepStrictEqual(ids(findings), ['no-personas'])
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })
})
