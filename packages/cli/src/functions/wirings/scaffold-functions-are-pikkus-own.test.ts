import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { CLIProgramMeta } from '@pikku/core/cli'
import { serializePublicRPC } from './rpc/serialize-public-rpc.js'
import { serializeRemoteRPC } from './rpc/serialize-remote-rpc.js'
import { serializeRemoteJobs } from './remote-jobs/serialize-remote-jobs.js'
import { serializeWebhook } from './webhook/serialize-webhook.js'
import { serializePublicAgent } from './agent/serialize-public-agent.js'
import { serializeWorkflowRoutes } from './workflow/serialize-workflow-routes.js'
import { serializeConsoleFunctions } from './console/serialize-console-functions.js'
import { serializeVirtualUserFunctions } from './virtual-user/serialize-virtual-user-functions.js'
import { serializeEventsScaffold } from './realtime/serialize-events-scaffold.js'
import { serializeAnalytics } from './analytics/serialize-analytics.js'
import { serializeFeatureFlagsScaffold } from './flags/serialize-feature-flags-scaffold.js'
import { serializeChannelCLI } from './cli/serialize-channel-cli.js'

const leaf = (name: string) => `#pikku/${name}`

const FUNCTION_DEFINITION =
  /(?:const (\w+) = )?\b(?:pikkuFunc|pikkuSessionlessFunc|pikkuVoidFunc|pikkuChannelFunc|pikkuChannelConnectionFunc|pikkuChannelDisconnectionFunc)(?:<[\s\S]*?>)?\(\{/g

const objectLiteralAt = (source: string, open: number): string => {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) return source.slice(open, i + 1)
  }
  return source.slice(open)
}

const functionDefinitions = (output: string) =>
  [...output.matchAll(FUNCTION_DEFINITION)].map((match) => ({
    name: match[1] ?? 'an inline function',
    config: objectLiteralAt(output, match.index! + match[0].length - 1),
  }))

const tagsOf = (config: string): string[] => {
  const tags = config.match(/\btags: \[([^\]]*)\]/)?.[1]
  return tags ? [...tags.matchAll(/'([^']+)'/g)].map(([, tag]) => tag!) : []
}

const channelCLI = serializeChannelCLI(
  'fabric',
  {
    name: 'fabric',
    description: 'fabric',
    commands: {},
    options: {},
  } as unknown as CLIProgramMeta,
  '#channel',
  new Map(),
  {},
  '#channelTypes',
  '#functionTypes',
  '#middlewareTypes'
)

describe("every function a scaffold generates is tagged as pikku's own", () => {
  const scaffolds: Array<[string, string]> = [
    ['public rpc', serializePublicRPC(leaf).functions],
    ['remote rpc', serializeRemoteRPC(leaf).functions],
    ['remote jobs', serializeRemoteJobs(leaf).functions],
    ['outgoing webhooks', serializeWebhook(leaf).functions],
    ['public agent', serializePublicAgent(leaf).functions],
    ['workflow routes', serializeWorkflowRoutes(leaf).functions],
    ['console', serializeConsoleFunctions(leaf, '#agentTypes').functions],
    [
      'virtual user',
      serializeVirtualUserFunctions(leaf, '#personas').functions,
    ],
    ['events', serializeEventsScaffold(leaf).functions],
    [
      'analytics',
      serializeAnalytics(leaf, [
        {
          specifier: './analytics.js',
          variable: 'analyticsEvents',
          events: ['page_viewed'],
        },
      ]).functions,
    ],
    [
      'feature flags',
      serializeFeatureFlagsScaffold(
        leaf,
        '#pikku/scopes/pikku-flags-manifest.gen.js'
      ),
    ],
    ['channel cli', channelCLI],
  ]

  for (const [name, output] of scaffolds) {
    test(name, () => {
      const definitions = functionDefinitions(output)
      assert.notEqual(definitions.length, 0, `${name} defines no function`)
      for (const { name: funcName, config } of definitions) {
        assert.ok(
          tagsOf(config).includes('pikku'),
          `${funcName} carries no 'pikku' tag, so the console lists it as one of the app's own functions`
        )
      }
    })
  }
})
