/**
 * The console APIs page: the MCP and Gateways tabs.
 *
 * Both were standalone pages when the gherkin was written and are now tabs on
 * one page, selected by a query param. Both list their records in a table keyed
 * on the record's own name, which is project data rather than console copy — so
 * the assertions here are stable without the page carrying test ids.
 *
 * One assertion did not survive: the gherkin expected the console to flag an
 * MCP tool that declares no description. The console renders no such warning
 * anywhere any more — the missing description is reported by the CLI at
 * generation time instead — so asserting it here would be asserting a surface
 * that does not exist. `mcpToolWithoutDescription` is still listed, which is
 * what the console genuinely offers.
 */
import {
  pikkuFeature,
  pikkuScenario,
} from '#pikku/workflow/pikku-workflow-types.gen.js'

const MCP_TAB = '/console/apis?tab=mcp'
const GATEWAYS_TAB = '/console/apis?tab=gateways'

export const mcpToolsListedScenario = pikkuScenario<void, { tools: number }>({
  title: 'MCP tools are listed in the console',
  description: 'An admin opens the MCP tab and finds the project’s tools',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'mcpToolsListedScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the MCP tab',
      'opensConsolePage',
      { path: MCP_TAB, waitFor: 'table' },
      { actor: actors.admin }
    )

    const tools = ['mcpToolWithDescription', 'mcpToolWithoutDescription']
    for (const tool of tools) {
      await scenario.then(
        `sees ${tool}`,
        'seesTableRow',
        { containing: tool },
        { actor: actors.admin }
      )
    }

    return { tools: tools.length }
  },
})

export const gatewayMetadataScenario = pikkuScenario<void, { listed: true }>({
  title: 'Gateway metadata is visible in the console',
  description: 'An admin opens the Gateways tab and finds the gateway’s route',
  tags: ['scenario'],
  func: async (_services, _data, { scenario, actors }) => {
    if (!actors?.admin) {
      throw new Error(
        'gatewayMetadataScenario needs the admin actor — run via `pikku scenario run <environment>`'
      )
    }

    await scenario.given(
      'opens the Gateways tab',
      'opensConsolePage',
      { path: GATEWAYS_TAB, waitFor: 'table' },
      { actor: actors.admin }
    )
    await scenario.then(
      'sees the gateway and its route',
      'seesTableRow',
      { containing: 'e2e-webhook', andContaining: '/webhooks/e2e-gateway' },
      { actor: actors.admin }
    )

    return { listed: true }
  },
})

export const apisConsoleFeature = pikkuFeature({
  name: 'APIs Console Page',
  description: 'The console lists the project’s MCP tools and gateways',
  tags: ['apis-console', 'console'],
  scenarios: [mcpToolsListedScenario, gatewayMetadataScenario],
})
