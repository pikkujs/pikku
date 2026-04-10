import { LocalEnvironmentOnlyError } from '@pikku/core/errors'
import { pikkuSessionlessFunc } from '#pikku'
import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
}

function escapeBackticks(str: string): string {
  return str.replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

export const writeAgentFile = pikkuSessionlessFunc<
  {
    name: string
    exportName: string
    config: {
      instructions: string
      description: string
      model: string
      tools: string[]
      maxSteps: number
      temperature?: number
      toolChoice: string
      aiMiddleware?: string[]
      tags?: string[]
    }
  },
  { filePath: string; content: string }
>({
  description: 'Generates and writes an AI agent source file',
  func: async ({ metaService }, { name, exportName, config }) => {
    const metaBasePath = (metaService as any)?.basePath as string | undefined
    if (!metaBasePath) {
      throw new LocalEnvironmentOnlyError('Only available in local development mode')
    }
    const rootDir = dirname(metaBasePath)

    const kebabName = toKebabCase(name)
    const toolLines = config.tools.map((t) => `    ref('${t}'),`).join('\n')

    const lines: string[] = []
    lines.push(
      `import { pikkuAIAgent } from '#pikku/agent/pikku-agent-types.gen.js'`
    )
    lines.push(`import { ref } from '#pikku/pikku-types.gen.js'`)
    lines.push('')
    lines.push(`export const ${exportName} = pikkuAIAgent({`)
    lines.push(`  name: '${kebabName}',`)
    lines.push(`  description: '${config.description.replace(/'/g, "\\'")}',`)
    lines.push(`  instructions: \`${escapeBackticks(config.instructions)}\`,`)
    lines.push(`  model: '${config.model}',`)
    lines.push(`  tools: [`)
    lines.push(toolLines)
    lines.push(`  ],`)
    lines.push(`  maxSteps: ${config.maxSteps},`)

    if (config.temperature !== undefined) {
      lines.push(`  temperature: ${config.temperature},`)
    }

    if (config.toolChoice && config.toolChoice !== 'auto') {
      lines.push(`  toolChoice: '${config.toolChoice}',`)
    }

    if (config.tags && config.tags.length > 0) {
      lines.push(`  tags: [${config.tags.map((t) => `'${t}'`).join(', ')}],`)
    }

    lines.push(`})`)
    lines.push('')

    const content = lines.join('\n')
    const agentsDir = join(rootDir, 'src', 'agents')
    await mkdir(agentsDir, { recursive: true })
    const filePath = join(agentsDir, `${kebabName}.agent.ts`)
    await writeFile(filePath, content, 'utf-8')

    return { filePath, content }
  },
})
