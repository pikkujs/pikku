/**
 * Per-unit filtered codegen for the deploy pipeline.
 *
 * For each deployment unit, runs `pikku all` with --names and --outDir
 * flags to produce a separate .pikku/ directory containing only the
 * registrations needed by that unit.
 *
 * Uses --stateInput to avoid re-inspecting the codebase for each unit.
 */

import { execFile } from 'node:child_process'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

import type { InspectorState } from '@pikku/inspector'
import { serializeInspectorState } from '@pikku/inspector'
import type {
  DeploymentManifest,
  DeploymentUnit,
} from '../analyzer/manifest.js'

const execFileAsync = promisify(execFile)

export interface PerUnitCodegenOptions {
  /** Root directory of the project (where pikku.config.json lives) */
  projectDir: string
  /** The deployment manifest with all units */
  manifest: DeploymentManifest
  /** The full (unfiltered) inspector state */
  inspectorState: InspectorState
  /** Base output directory for deploy artifacts (defaults to <projectDir>/.deploy) */
  deployDir?: string
  /** Path to pikku binary (auto-resolved if not provided) */
  pikkuBin?: string
  /** Called for each unit as it starts/completes */
  onProgress?: (
    unitName: string,
    status: 'start' | 'done' | 'error',
    error?: string
  ) => void
}

export interface PerUnitCodegenResult {
  /** Map of unit name -> path to the unit's .pikku directory */
  unitPikkuDirs: Map<string, string>
  /** Units that failed codegen */
  errors: Array<{ unitName: string; error: string }>
}

/**
 * Resolve the pikku CLI binary path.
 *
 * Since deploy-apply runs inside the pikku process, we can find the binary
 * by looking at process.argv[1] (the script being executed).
 */
function resolvePikkuBin(): string {
  return process.argv[1]
}

/**
 * Collect the full set of filter names for a deployment unit.
 *
 * The --names filter matches against different identifier types depending
 * on the metadata being filtered (function names, agent names, channel
 * names, etc.).  For a unit to get its complete metadata, we need to
 * include both the function IDs and any wiring-level names (e.g. agent
 * names, channel names) that reference those functions.
 */
function collectFilterNames(
  unit: DeploymentUnit,
  manifest: DeploymentManifest
): string[] {
  const names = new Set<string>(unit.functionIds)

  switch (unit.role) {
    case 'agent': {
      // Include the agent name so agent metadata is preserved
      const agentDef = manifest.agents.find((a) => a.unitName === unit.name)
      if (agentDef) {
        names.add(agentDef.name)
      }
      break
    }
    case 'mcp': {
      // Include MCP endpoint tool/resource/prompt names
      for (const mcp of manifest.mcpEndpoints) {
        if (mcp.unitName === unit.name) {
          for (const id of mcp.toolFunctionIds) names.add(id)
          for (const id of mcp.resourceFunctionIds) names.add(id)
          for (const id of mcp.promptFunctionIds) names.add(id)
        }
      }
      break
    }
    case 'channel': {
      // Include the channel name so channel metadata is preserved
      const channelDef = manifest.channels.find((c) => c.unitName === unit.name)
      if (channelDef) {
        names.add(channelDef.name)
      }
      break
    }
    case 'queue-consumer': {
      // Include the queue name (metadata key) and consumer function ID
      const queueDef = manifest.queues.find((q) => q.consumerUnit === unit.name)
      if (queueDef) {
        names.add(queueDef.name)
        names.add(queueDef.consumerFunctionId)
      }
      break
    }
    case 'scheduled': {
      // Include the scheduled task name (metadata key) and function ID
      const schedDef = manifest.scheduledTasks.find(
        (s) => s.unitName === unit.name
      )
      if (schedDef) {
        names.add(schedDef.name)
        names.add(schedDef.functionId)
      }
      break
    }
    default:
      // http, rpc, workflow-orchestrator, workflow-step: function IDs suffice
      break
  }

  return [...names]
}

/**
 * Runs filtered codegen for each deployment unit.
 *
 * For each unit:
 * 1. Calls `pikku all --stateInput=<state-file> --names=<func-ids> --outDir=<unit-dir/.pikku> --silent`
 * 2. This produces pikku-bootstrap.gen.ts (and all other codegen) filtered to only that unit's functions
 *
 * The inspector state is saved once to a temp file and reused across all units.
 */
export async function generatePerUnitCodegen(
  options: PerUnitCodegenOptions
): Promise<PerUnitCodegenResult> {
  const { projectDir, manifest, inspectorState, onProgress } = options

  const deployDir = options.deployDir ?? join(projectDir, '.deploy')
  const unitsDir = join(deployDir, 'units')
  const pikkuBin = options.pikkuBin ?? resolvePikkuBin()

  const unitPikkuDirs = new Map<string, string>()
  const errors: Array<{ unitName: string; error: string }> = []

  // Create a temp file for the serialized inspector state
  const stateFileName = `pikku-state-${randomBytes(8).toString('hex')}.json`
  const stateFilePath = join(tmpdir(), stateFileName)

  try {
    // Serialize and write the inspector state once
    const serialized = serializeInspectorState(inspectorState)
    await writeFile(stateFilePath, JSON.stringify(serialized), 'utf-8')

    // Clean the units directory to avoid stale artifacts
    await rm(unitsDir, { recursive: true, force: true })
    await mkdir(unitsDir, { recursive: true })

    // Generate codegen for each unit
    for (const unit of manifest.units) {
      const filterNames = collectFilterNames(unit, manifest)

      if (filterNames.length === 0) {
        errors.push({
          unitName: unit.name,
          error: 'Unit has no function IDs — skipping codegen',
        })
        continue
      }

      onProgress?.(unit.name, 'start')

      const unitDir = join(unitsDir, unit.name)
      const unitPikkuDir = join(unitDir, '.pikku')
      await mkdir(unitDir, { recursive: true })

      const namesArg = filterNames.join(',')

      try {
        await execFileAsync(
          process.execPath, // node binary
          [
            pikkuBin,
            'all',
            `--stateInput=${stateFilePath}`,
            `--names=${namesArg}`,
            `--outDir=${unitPikkuDir}`,
            '--silent',
          ],
          {
            cwd: projectDir,
            timeout: 60_000,
            env: {
              ...process.env,
              // Prevent recursive deploy or watch behavior
              PIKKU_DEPLOY_CODEGEN: '1',
            },
          }
        )

        unitPikkuDirs.set(unit.name, unitPikkuDir)
        onProgress?.(unit.name, 'done')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push({ unitName: unit.name, error: message })
        onProgress?.(unit.name, 'error', message)
      }
    }
  } finally {
    // Clean up the temp state file
    try {
      await rm(stateFilePath, { force: true })
    } catch {
      // Ignore cleanup errors
    }
  }

  return { unitPikkuDirs, errors }
}
