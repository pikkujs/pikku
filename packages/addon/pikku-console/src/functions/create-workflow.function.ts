import { pikkuSessionlessFunc } from '#pikku'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { pikkuState } from '@pikku/core/internal'

export const createWorkflow = pikkuSessionlessFunc<
  { name: string; description?: string },
  { success: boolean; sourceFile: string; exportedName: string }
>({
  title: 'Create Workflow',
  description: 'Scaffolds a new empty workflow file and runs pikku all.',
  expose: true,
  auth: false,
  func: async (_services, { name, description }) => {
    const metaDir = pikkuState(null, 'package', 'metaDir') ?? ''
    if (!metaDir) {
      throw new Error('Only available in local development mode')
    }
    const rootDir = dirname(metaDir)

    const configPath = join(rootDir, 'pikku.config.json')
    if (!existsSync(configPath)) {
      throw new Error('pikku.config.json not found')
    }
    const config = JSON.parse(await readFile(configPath, 'utf-8'))

    const pikkuDir = config.scaffold?.pikkuDir
    if (!pikkuDir) {
      throw new Error('scaffold.pikkuDir not configured in pikku.config.json')
    }

    const srcDir = join(rootDir, dirname(pikkuDir))
    const workflowDir = join(srcDir, 'workflows')
    await mkdir(workflowDir, { recursive: true })

    const fileName = `${name}.workflow.ts`
    const filePath = join(workflowDir, fileName)
    if (existsSync(filePath)) {
      throw new Error(`Workflow file already exists: ${filePath}`)
    }

    const desc = description
      ? `\n  description: '${description.replace(/'/g, "\\'")}',`
      : ''

    const content = `import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const ${name} = pikkuWorkflowGraph({${desc}
  nodes: {},
  config: {},
})
`
    await writeFile(filePath, content, 'utf-8')

    execSync('npx pikku all', {
      cwd: rootDir,
      stdio: 'pipe',
      timeout: 60_000,
    })

    return { success: true, sourceFile: filePath, exportedName: name }
  },
})
