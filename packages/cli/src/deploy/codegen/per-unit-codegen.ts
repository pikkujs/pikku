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
import { toSafeKebab } from '../analyzer/analyzer.js'

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
  /** Resolve unit output directory (defaults to <deployDir>/<unit-name>) */
  resolveUnitDir?: (unit: DeploymentUnit, baseDeployDir: string) => string
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
  manifest: DeploymentManifest,
  inspectorState: InspectorState
): string[] {
  const names = new Set<string>(unit.functionIds)

  // Include catch-all scaffold routes based on unit contents
  const functionsMeta = inspectorState.functions.meta
  const hasExposed = unit.functionIds.some((id) => functionsMeta[id]?.expose)
  const hasRemote = unit.functionIds.some((id) => functionsMeta[id]?.remote)

  if (hasExposed) {
    // Include the RPC catch-all scaffold function + route
    names.add('rpcCaller')
    names.add('/rpc/:rpcName')
    names.add('http:post:/rpc/:rpcName')
  }
  if (hasRemote) {
    // Include the remote RPC scaffold function + route
    names.add('remoteRPCHandler')
    names.add('/remote/rpc/:rpcName')
    names.add('http:post:/remote/rpc/:rpcName')
  }

  switch (unit.role) {
    case 'agent': {
      const agentDef = manifest.agents.find((a) => a.unitName === unit.name)
      if (agentDef) {
        names.add(agentDef.name)
        // Include agent catch-all routes
        names.add('agentCaller')
        names.add('agentStreamCaller')
        names.add('agentApproveCaller')
        names.add('agentResumeCaller')
        // Include RPC catch-all for agent tool dispatch
        names.add('/rpc/:rpcName')
        for (const id of agentDef.toolFunctionIds) names.add(id)
      }
      break
    }
    case 'mcp': {
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
      const channelDef = manifest.channels.find((c) => c.unitName === unit.name)
      if (channelDef) {
        names.add(channelDef.name)
        for (const id of channelDef.functionIds) names.add(id)
      }
      break
    }
    case 'function': {
      // For function units, include queue/scheduler names from handlers
      for (const handler of unit.handlers) {
        if (handler.type === 'queue') names.add(handler.queueName)
        if (handler.type === 'scheduled') names.add(handler.taskName)
      }
      // Function units with workflow-state capability (workflow-starter,
      // workflow-runner, workflow-status-checker) call rpc.startWorkflow
      // and look workflows up by name in the registry. The registry is
      // populated when the user's `pikkuWorkflowGraph(...)` calls execute
      // at module load — so the per-unit bootstrap needs the workflow
      // wirings file. We only pull in the workflow NAME (graph structure
      // only — nodes reference step functions by string ID), not the step
      // function bodies; those stay in their own per-step units and are
      // reached via queue dispatch at runtime.
      const usesWorkflowState = unit.services.some(
        (s) => s.capability === 'workflow-state'
      )
      if (usesWorkflowState) {
        for (const wf of manifest.workflows) {
          names.add(wf.name)
          // Include orchestrator + per-step queue NAMES so queue meta gets
          // emitted into this unit. The runtime needs these in
          // `pikkuState('queue', 'meta')` to map a step's rpcName to its
          // dedicated queue (otherwise it falls back to the shared
          // 'pikku-workflow-step-worker' queue which doesn't exist in
          // per-unit deploys). Names only — no function bodies bundled.
          names.add(`wf-orchestrator-${toSafeKebab(wf.name)}`)
          for (const step of wf.steps) {
            if (step.functionId) {
              names.add(`wf-step-${toSafeKebab(step.functionId)}`)
            }
          }
        }
      }
      break
    }
    case 'workflow': {
      const wfDef = manifest.workflows.find(
        (w) => w.orchestratorUnit === unit.name
      )
      if (wfDef) {
        names.add(wfDef.pikkuFuncId)
        names.add(wfDef.name)
        // Include workflow scaffold functions + catch-all routes
        names.add('workflowStarter')
        names.add('workflowRunner')
        names.add('workflowStatusChecker')
        names.add('workflowStatusStream')
        names.add('graphStarter')
        names.add('/workflow/:workflowName/start')
        names.add('/workflow/:workflowName/run')
        names.add('/workflow/:workflowName/status/:runId')
        names.add('/workflow/:workflowName/status/:runId/stream')
        names.add('/workflow/:workflowName/graph/:nodeId')
        names.add('http:post:/workflow/:workflowName/start')
        names.add('http:post:/workflow/:workflowName/run')
        names.add('http:get:/workflow/:workflowName/status/:runId')
        names.add('http:get:/workflow/:workflowName/status/:runId/stream')
        names.add('http:post:/workflow/:workflowName/graph/:nodeId')
        // Queue names for orchestrator and step workers
        names.add(`wf-orchestrator-${toSafeKebab(wfDef.name)}`)
        for (const step of wfDef.steps) {
          if (step.functionId) {
            names.add(step.functionId)
            names.add(`wf-step-${toSafeKebab(step.functionId)}`)
          }
        }
      }
      break
    }
    default:
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

  const baseDir = options.deployDir ?? join(projectDir, '.deploy')
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

    // Generate codegen for each unit
    for (const unit of manifest.units) {
      const filterNames = collectFilterNames(unit, manifest, inspectorState)

      if (filterNames.length === 0) {
        errors.push({
          unitName: unit.name,
          error: 'Unit has no function IDs — skipping codegen',
        })
        continue
      }

      onProgress?.(unit.name, 'start')

      const unitDir = options.resolveUnitDir
        ? options.resolveUnitDir(unit, baseDir)
        : join(baseDir, unit.name)
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
