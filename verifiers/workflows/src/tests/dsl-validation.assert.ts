/**
 * Verifies that the inspector rejects invalid DSL patterns.
 * Creates temp projects with invalid workflows and asserts pikku exits with code 1.
 */

import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

const PIKKU_BIN = join(
  import.meta.dirname!,
  '../../../../packages/cli/dist/bin/pikku.js'
)

interface TestCase {
  name: string
  wrapper: 'pikkuWorkflowFunc' | 'pikkuWorkflowComplexFunc'
  body: string
  shouldFail: boolean
}

const cases: TestCase[] = [
  // --- pikkuWorkflowFunc rejections ---
  {
    name: 'dsl: rejects inline functions',
    wrapper: 'pikkuWorkflowFunc',
    body: `await workflow.do('step', async () => ({ ok: true }))`,
    shouldFail: true,
  },
  {
    name: 'dsl: rejects while loops',
    wrapper: 'pikkuWorkflowFunc',
    body: `
      let i = 0
      while (i < 3) {
        await workflow.do('step', 'myRpc', { i })
        i++
      }`,
    shouldFail: true,
  },
  {
    name: 'dsl: rejects for-in loops',
    wrapper: 'pikkuWorkflowFunc',
    body: `
      for (const key in data) {
        await workflow.do('step', 'myRpc', { key })
      }`,
    shouldFail: true,
  },
  {
    name: 'dsl: rejects unawaited workflow.do',
    wrapper: 'pikkuWorkflowFunc',
    body: `workflow.do('step', 'myRpc', data)`,
    shouldFail: true,
  },

  // --- pikkuWorkflowComplexFunc rejections ---
  {
    name: 'complex: rejects while loops',
    wrapper: 'pikkuWorkflowComplexFunc',
    body: `
      let i = 0
      while (i < 3) {
        await workflow.do('step', 'myRpc', { i })
        i++
      }`,
    shouldFail: true,
  },
  {
    name: 'complex: rejects for-in loops',
    wrapper: 'pikkuWorkflowComplexFunc',
    body: `
      for (const key in data) {
        await workflow.do('step', 'myRpc', { key })
      }`,
    shouldFail: true,
  },
  {
    name: 'complex: rejects unawaited workflow.do',
    wrapper: 'pikkuWorkflowComplexFunc',
    body: `workflow.do('step', 'myRpc', data)`,
    shouldFail: true,
  },
  {
    name: 'complex: rejects do-while loops',
    wrapper: 'pikkuWorkflowComplexFunc',
    body: `
      let i = 0
      do {
        await workflow.do('step', 'myRpc', { i })
        i++
      } while (i < 3)`,
    shouldFail: true,
  },
  {
    name: 'dsl: rejects for loops',
    wrapper: 'pikkuWorkflowFunc',
    body: `
      for (let i = 0; i < 3; i++) {
        await workflow.do('step', 'myRpc', { i })
      }`,
    shouldFail: true,
  },
]

async function createTestProject(testCase: TestCase): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'pikku-dsl-test-'))

  await writeFile(
    join(tmpDir, 'pikku.config.json'),
    JSON.stringify({
      srcDirectories: ['./src'],
      outDir: './.pikku',
      tsconfig: './tsconfig.json',
    })
  )

  await writeFile(
    join(tmpDir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'Node16',
        moduleResolution: 'Node16',
        strict: true,
        esModuleInterop: true,
        outDir: './dist',
      },
      include: ['src'],
    })
  )

  await writeFile(
    join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      type: 'module',
      dependencies: {
        '@pikku/core': 'workspace:*',
      },
    })
  )

  await mkdir(join(tmpDir, 'src'), { recursive: true })

  const workflowCode = `
import { ${testCase.wrapper} } from '../.pikku/workflow/pikku-workflow-types.gen.js'

export const testWorkflow = ${testCase.wrapper}<{ value: string }, unknown>({
  func: async (_services, data, { workflow }) => {
    ${testCase.body}
  },
})
`
  await writeFile(join(tmpDir, 'src', 'test.workflow.ts'), workflowCode)

  return tmpDir
}

function runPikku(dir: string): { exitCode: number; output: string } {
  try {
    const output = execFileSync('node', [PIKKU_BIN], {
      cwd: dir,
      stdio: 'pipe',
      timeout: 30_000,
    })
    return { exitCode: 0, output: output.toString() }
  } catch (err: any) {
    return {
      exitCode: err.status ?? 1,
      output: (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? ''),
    }
  }
}

describe('DSL validation verifier', () => {
  for (const testCase of cases) {
    test(testCase.name, async () => {
      const tmpDir = await createTestProject(testCase)
      try {
        const { exitCode, output } = runPikku(tmpDir)

        if (testCase.shouldFail) {
          assert.notEqual(
            exitCode,
            0,
            `Expected pikku to fail for "${testCase.name}" but it succeeded.\nOutput: ${output}`
          )
        } else {
          assert.equal(
            exitCode,
            0,
            `Expected pikku to succeed for "${testCase.name}" but it failed with exit code ${exitCode}.\nOutput: ${output}`
          )
        }
      } finally {
        await rm(tmpDir, { recursive: true, force: true })
      }
    })
  }
})
