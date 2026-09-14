import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import type { Logger } from '@pikku/core/services'
import type { VariablesService } from '@pikku/core/services'

import { createDevAgentRunner } from './dev-agent-runner.js'

const require = createRequire(import.meta.url)

/** The directory of an installed package, from any file it exports. */
const packageRoot = (name: string) => {
  let dir = dirname(require.resolve(name))
  while (dir !== dirname(dir)) {
    try {
      if (require(join(dir, 'package.json')).name === name) {
        return dir
      }
    } catch {
      // Not this level's package.json — keep walking up.
    }
    dir = dirname(dir)
  }
  throw new Error(`could not find the package root of ${name}`)
}

describe('createDevAgentRunner', () => {
  const tempDirs: string[] = []

  after(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  const lines: Record<'info' | 'debug' | 'warn' | 'error', string[]> = {
    info: [],
    debug: [],
    warn: [],
    error: [],
  }

  const logger = {
    info: (message: string) => lines.info.push(message),
    debug: (message: string) => lines.debug.push(message),
    warn: (message: string) => lines.warn.push(message),
    error: (message: string) => lines.error.push(message),
  } as unknown as Logger

  const variables = (values: Record<string, string>) =>
    ({
      get: async (name: string) => values[name],
    }) as unknown as VariablesService

  const project = async (installed: string[]) => {
    const root = await mkdtemp(join(tmpdir(), 'pikku-dev-agent-'))
    tempDirs.push(root)
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'project', version: '0.0.0' })
    )
    for (const name of installed) {
      const target = join(root, 'node_modules', name)
      await mkdir(dirname(target), { recursive: true })
      await symlink(packageRoot(name), target, 'dir')
    }
    return root
  }

  const run = async (projectRoot: string, values: Record<string, string>) => {
    for (const key of Object.keys(lines)) {
      lines[key as keyof typeof lines].length = 0
    }
    return createDevAgentRunner({
      logger,
      projectRoot,
      variables: variables(values),
    })
  }

  const gateway = {
    LITELLM_PROXY_URL: 'http://localhost:4000',
    LITELLM_API_KEY: 'sk-test',
  }

  test('no AI provider env leaves agents disabled', async () => {
    const root = await project([])

    assert.equal(await run(root, {}), undefined)
    assert.ok(
      lines.debug.some((line) => line.includes('no AI provider env')),
      lines.debug.join('\n')
    )
  })

  test('a half pair of env vars is not a provider', async () => {
    const root = await project([])

    assert.equal(
      await run(root, { OPENAI_BASE_URL: 'http://localhost:4000' }),
      undefined
    )
  })

  test("a project with no AI SDK of its own gets the CLI's, audio included", async () => {
    const root = await project([])

    assert.notEqual(await run(root, gateway), undefined)
    const wired = lines.info.find((line) => line.includes('agent runner wired'))
    assert.ok(wired, lines.info.join('\n'))
    assert.ok(!wired.includes('no audio'), wired)
  })

  test('a project with its own AI SDK but no @ai-sdk/openai gets no audio', async () => {
    const root = await project(['@pikku/ai-vercel', '@ai-sdk/openai-compatible'])

    assert.notEqual(await run(root, gateway), undefined)
    const wired = lines.info.find((line) => line.includes('agent runner wired'))
    assert.ok(wired, lines.info.join('\n'))
    assert.ok(
      wired.includes('no audio — @ai-sdk/openai not resolvable'),
      `audio must not be borrowed from the CLI when the pair came from the project: ${wired}`
    )
  })

  test("a project that installed the pair and @ai-sdk/openai keeps audio", async () => {
    const root = await project([
      '@pikku/ai-vercel',
      '@ai-sdk/openai-compatible',
      '@ai-sdk/openai',
    ])

    assert.notEqual(await run(root, gateway), undefined)
    const wired = lines.info.find((line) => line.includes('agent runner wired'))
    assert.ok(wired, lines.info.join('\n'))
    assert.ok(!wired.includes('no audio'), wired)
  })
})
