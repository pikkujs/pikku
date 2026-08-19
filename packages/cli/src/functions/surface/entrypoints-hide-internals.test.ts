import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectSurface } from './collect-surface.js'

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..'
)

const HIDDEN: Record<string, Record<string, string[]>> = {
  'packages/core': {
    './types': [
      'CoreSecretlessSingletonServices',
      'PikkuRawWire',
      'SchemaRefLike',
    ],
    './scenario': [
      'FeatureMetaEntry',
      'FeaturePlanEntry',
      'PikkuScenarioStepWire',
      'ScenarioArtifactKind',
      'ScenarioSkip',
      'ScenarioStepInvocation',
      'ScenarioSurfaceResolution',
    ],
    './dev': ['ReloadGeneratedMetaOptions'],
  },
  'packages/inspector': {
    '.': [
      'AddWiring',
      'ExportedCLIContractsMeta',
      'ExportedChannelContractsMeta',
      'ExportedChannelRouteMeta',
      'ExportedHTTPContractsMeta',
      'ExportedHTTPRouteConfigMeta',
      'ExportedHTTPRouteEntryMeta',
      'ExportedHTTPRouteFunctionMeta',
      'ExportedHTTPRouteMapMeta',
      'ExportedHTTPRoutesGroupMeta',
      'InspectorAIMiddlewareState',
      'InspectorApprovalDescriptionDefinition',
      'InspectorChannelMiddlewareState',
      'InspectorChannelState',
      'InspectorExportedContractsState',
      'InspectorFilesAndMethods',
      'InspectorFunctionState',
      'InspectorMiddlewareDefinition',
      'InspectorMiddlewareInstance',
      'InspectorPermissionDefinition',
      'InspectorPermissionInstance',
      'PathToNameAndType',
      'SchemaVendor',
    ],
    './workflow-graph': [
      'FlowType',
      'SerializedGraphNode',
      'SerializedNext',
      'StateRef',
      'WorkflowSourceType',
      'WorkflowWires',
      'isFlowNode',
      'isStateRef',
    ],
  },
  'packages/runtimes/aws-lambda': { '.': ['LambdaServiceFactories'] },
  'packages/runtimes/azure-functions': { '.': ['AzureServiceFactories'] },
  'packages/runtimes/cloudflare': {
    '.': ['RunFetchOptions'],
    './workflow-do': [
      'DoPendingAlarm',
      'DoRunRecord',
      'DoStepHistoryRecord',
      'DoStepRecord',
      'PikkuDoStepDispatch',
      'PikkuStepStub',
      'PikkuStepWorker',
      'PikkuStepWorkerEnv',
      'PikkuWorkflowDoEnv',
      'PikkuWorkflowDoOptions',
    ],
  },
  'packages/runtimes/express-server': { '.': ['ExpressCoreConfig'] },
  'packages/runtimes/fastify-server': { '.': ['FastifyCoreConfig'] },
  'packages/runtimes/tanstack-start': { '.': ['TanStackStartAuthContext'] },
  'packages/runtimes/uws-handler': { '.': ['PikkuuWSHandlerOptions'] },
  'packages/runtimes/uws-server': { '.': ['UWSCoreConfig'] },
  'packages/runtimes/ws': { '.': ['PikkuWSHandlerOptions'] },
  'packages/services/aws-services': { '.': ['SQSQueueServiceConfig'] },
  'packages/services/browser': {
    '.': [
      'BrowserLaunchOptions',
      'BrowserLimits',
      'BrowserSession',
      'BrowserSessionInfo',
    ],
  },
}

describe('entry points do not re-export package internals', () => {
  for (const [location, bySubpath] of Object.entries(HIDDEN)) {
    test(location, async () => {
      const surface = await collectSurface(join(repoRoot, location))

      for (const [subpath, hidden] of Object.entries(bySubpath)) {
        const entrypoint = surface.find((each) => each.subpath === subpath)
        assert.ok(
          entrypoint,
          `${location} no longer declares the ${subpath} entry point`
        )

        const exported = new Set(entrypoint.symbols.map((each) => each.name))
        const leaked = hidden.filter((name) => exported.has(name))

        assert.deepEqual(
          leaked,
          [],
          `${location} ${subpath} re-exports internals: ${leaked.join(', ')}`
        )
      }
    })
  }
})
