import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = join(packageDir, '..', '..', '..')

/**
 * Every name `@pikku/deploy` owns. A provider adapter that re-declares one is
 * writing a second, unchecked copy of the contract: nothing compares the two,
 * so the copy drifts silently until a deploy emits the wrong manifest.
 */
const OWNED_NAMES = [
  'AgentDefinition',
  'BindingSource',
  'ChannelDefinition',
  'ContributorPlatform',
  'DeploymentHandler',
  'DeploymentManifest',
  'DeploymentUnit',
  'DeploymentUnitRole',
  'EntryGenerationContext',
  'GrantedAddon',
  'HttpRouteInfo',
  'MCPEndpointDefinition',
  'PlatformServiceContributor',
  'ProviderAdapter',
  'QueueDefinition',
  'ScheduledTaskDefinition',
  'SecretDeclaration',
  'ServiceCapability',
  'ServiceRequirement',
  'UnresolvedSecretRead',
  'UnscopedAddon',
  'VariableDeclaration',
  'WorkflowDefinition',
  'WorkflowStepDefinition',
]

const sourceFiles = (dir: string): string[] => {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      found.push(path)
    }
  }
  return found
}

const consumerFiles = (): string[] => {
  const deployPackages = join(repoRoot, 'packages', 'deploy')
  const files: string[] = []
  for (const entry of readdirSync(deployPackages)) {
    if (entry === 'deploy-core') continue
    const src = join(deployPackages, entry, 'src')
    try {
      if (statSync(src).isDirectory()) files.push(...sourceFiles(src))
    } catch {
      continue
    }
  }
  files.push(...sourceFiles(join(repoRoot, 'packages', 'cli', 'src', 'deploy')))
  return files
}

describe('the shared deploy contract has exactly one declaration', () => {
  it('is never re-declared by a provider adapter or by the CLI pipeline', () => {
    const offenders: string[] = []

    for (const file of consumerFiles()) {
      const source = readFileSync(file, 'utf-8')
      for (const name of OWNED_NAMES) {
        const declaration = new RegExp(
          `^\\s*(?:export\\s+)?(?:interface|type)\\s+${name}\\b`,
          'm'
        )
        if (declaration.test(source)) {
          offenders.push(`${relative(repoRoot, file)} declares ${name}`)
        }
      }
    }

    assert.deepEqual(
      offenders.sort(),
      [],
      `these files re-declare a type @pikku/deploy owns — import it instead:\n  ${offenders.sort().join('\n  ')}`
    )
  })

  it('exports every name it owns from the barrel', () => {
    const barrel = readFileSync(join(packageDir, 'src', 'index.ts'), 'utf-8')
    const missing = OWNED_NAMES.filter((name) => !barrel.includes(name))
    assert.deepEqual(
      missing,
      [],
      `owned but not re-exported from index.ts: ${missing.join(', ')}`
    )
  })
})
