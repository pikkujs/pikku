import { join } from 'node:path'
import { readJsonSafe } from './shared-checks.js'
import type { ValidateFinding } from './persona-checks.js'

export type RequiredDepsInput = {
  root: string
  wiresMcp: boolean
  wiresAgents: boolean
  resolve: (specifier: string) => string | undefined
}

export function runRequiredDepsChecks(
  input: RequiredDepsInput
): ValidateFinding[] {
  const { root, wiresMcp, wiresAgents, resolve } = input
  const findings: ValidateFinding[] = []

  if (wiresMcp && !resolve('@pikku/modelcontextprotocol')) {
    findings.push({
      id: 'mcp-deps-missing',
      severity: 'error',
      message:
        '@pikku/modelcontextprotocol is not installed, but this project exposes MCP tools, resources or prompts — the MCP server cannot start without it.',
      path: join(root, 'package.json'),
      fixHint: 'Install @pikku/modelcontextprotocol in this project.',
    })
  }

  if (wiresAgents && !resolve('@pikku/ai-vercel')) {
    findings.push({
      id: 'agent-deps-missing',
      severity: 'error',
      message:
        '@pikku/ai-vercel is not installed, but this project defines AI agents — there is no runner to execute them.',
      path: join(root, 'package.json'),
      fixHint: 'Install @pikku/ai-vercel in this project.',
    })
  }

  return findings
}

const hasEntries = (value: unknown): boolean =>
  !!value && typeof value === 'object' && Object.keys(value).length > 0

export async function projectWiresMcp(
  root: string,
  outDir: string
): Promise<boolean> {
  const meta = await readJsonSafe<Record<string, unknown>>(
    join(root, outDir, 'mcp', 'pikku-mcp-wirings-meta.gen.json')
  )
  return (
    !!meta &&
    (hasEntries(meta.toolsMeta) ||
      hasEntries(meta.resourcesMeta) ||
      hasEntries(meta.promptsMeta))
  )
}

export async function projectWiresAgents(
  root: string,
  outDir: string
): Promise<boolean> {
  const meta = await readJsonSafe<Record<string, unknown>>(
    join(root, outDir, 'agent', 'pikku-agent-wirings-meta.gen.json')
  )
  return !!meta && hasEntries(meta.agentsMeta)
}
