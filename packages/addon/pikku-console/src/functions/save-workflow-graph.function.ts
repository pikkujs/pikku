import { pikkuSessionlessFunc } from '#pikku'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { pikkuState } from '@pikku/core/internal'

function graphToTypeScript(
  name: string,
  description: string,
  graph: Record<string, any>
): string {
  const nodeEntries = Object.entries(graph)
  const nodesObj = nodeEntries
    .map(([id, node]) => `    ${id}: '${node.rpcName}'`)
    .join(',\n')

  const configEntries = nodeEntries
    .map(([id, node]) => {
      const parts: string[] = []

      if (node.input && Object.keys(node.input).length > 0) {
        const inputFields = Object.entries(node.input)
          .map(([key, val]) => {
            if (
              typeof val === 'object' &&
              val !== null &&
              '$ref' in (val as any)
            ) {
              const r = val as { $ref: string; path: string }
              return `        ${key}: ref('${r.$ref}', '${r.path}')`
            }
            if (
              typeof val === 'object' &&
              val !== null &&
              '$template' in (val as any)
            ) {
              return `        ${key}: ${JSON.stringify(val)}`
            }
            return `        ${key}: ${JSON.stringify(val)}`
          })
          .join(',\n')
        parts.push(`      input: (ref) => ({\n${inputFields},\n      })`)
      }

      if (node.next) {
        if (typeof node.next === 'string') {
          parts.push(`      next: '${node.next}'`)
        } else if (Array.isArray(node.next)) {
          parts.push(
            `      next: [${node.next.map((n: string) => `'${n}'`).join(', ')}]`
          )
        } else {
          const branches = Object.entries(node.next)
            .map(([k, v]) => `${k}: '${v}'`)
            .join(', ')
          parts.push(`      next: { ${branches} } as any`)
        }
      }

      if (node.onError) {
        parts.push(`      onError: '${node.onError}'`)
      }

      return `    ${id}: {\n${parts.join(',\n')},\n    }`
    })
    .join(',\n')

  const desc = description
    ? `\n  description: '${description.replace(/'/g, "\\'")}',`
    : ''

  return `import { pikkuWorkflowGraph } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const ${name} = pikkuWorkflowGraph({${desc}
  nodes: {
${nodesObj},
  },
  config: {
${configEntries},
  },
})
`
}

export const saveWorkflowGraph = pikkuSessionlessFunc<
  {
    name: string
    description: string
    graph: Record<string, any>
  },
  { success: boolean; sourceFile: string }
>({
  title: 'Save Workflow Graph',
  description:
    'Converts a workflow graph JSON to a pikkuWorkflowGraph TypeScript file and saves it.',
  expose: true,
  auth: false,
  func: async (_services, { name, description, graph }) => {
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

    const content = graphToTypeScript(name, description, graph)
    await writeFile(filePath, content, 'utf-8')

    execSync('npx pikku all', {
      cwd: rootDir,
      stdio: 'pipe',
      timeout: 60_000,
    })

    return { success: true, sourceFile: filePath }
  },
})
