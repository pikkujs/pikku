/**
 * Deserialize workflow JSON back to DSL code
 * Converts the serialized workflow graph format back to TypeScript DSL code
 */

import type {
  SerializedWorkflowGraph,
  SerializedGraphNode,
  DataRef,
} from '../graph/workflow-graph.types.js'

interface DeserializeOptions {
  /** Import path for pikkuWorkflowFunc */
  pikkuImportPath?: string
  /** Whether to include type annotations */
  includeTypes?: boolean
}

/**
 * Check if a value is a DataRef
 */
function isDataRef(value: unknown): value is DataRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$ref' in value &&
    typeof (value as DataRef).$ref === 'string'
  )
}

/**
 * Convert a DataRef to code expression
 */
function dataRefToCode(ref: DataRef): string {
  if (ref.$ref === 'trigger') {
    // Reference to trigger input (data)
    return ref.path ? `data.${ref.path}` : 'data'
  }
  // Reference to a step output variable
  return ref.path ? `${ref.$ref}.${ref.path}` : ref.$ref
}

/**
 * Check if input represents passthrough (entire data object)
 */
function isPassthrough(input: Record<string, unknown>): boolean {
  if (Object.keys(input).length === 1 && '$passthrough' in input) {
    const passthrough = input.$passthrough
    return isDataRef(passthrough) && passthrough.$ref === 'trigger'
  }
  return false
}

/**
 * Convert input object to code
 */
function inputToCode(input: Record<string, unknown>, indent: string): string {
  // Check if this is a passthrough (entire data object)
  if (isPassthrough(input)) {
    return 'data'
  }

  const entries = Object.entries(input)
  if (entries.length === 0) return '{}'

  const lines = entries.map(([key, value]) => {
    if (isDataRef(value)) {
      return `${indent}  ${key}: ${dataRefToCode(value)},`
    }
    return `${indent}  ${key}: ${JSON.stringify(value)},`
  })

  return `{\n${lines.join('\n')}\n${indent}}`
}

/**
 * Convert options to code
 */
function optionsToCode(options: Record<string, unknown>): string {
  const parts: string[] = []
  if (options.retries !== undefined) {
    parts.push(`retries: ${options.retries}`)
  }
  if (options.retryDelay !== undefined) {
    parts.push(`retryDelay: '${options.retryDelay}'`)
  }
  return parts.length > 0 ? `{ ${parts.join(', ')} }` : ''
}

/**
 * Convert a simple condition to code expression
 */
function conditionToCode(condition: any): string {
  if (!condition) return 'true'

  if (condition.type === 'simple') {
    return condition.expression
  }

  if (condition.type === 'and') {
    const parts = condition.conditions.map(conditionToCode)
    return parts.length > 1 ? `(${parts.join(' && ')})` : parts[0]
  }

  if (condition.type === 'or') {
    const parts = condition.conditions.map(conditionToCode)
    return parts.length > 1 ? `(${parts.join(' || ')})` : parts[0]
  }

  return 'true'
}

/**
 * Traverse nodes in execution order starting from entry
 */
function traverseNodes(
  nodes: Record<string, SerializedGraphNode>,
  entryNodeIds: string[]
): SerializedGraphNode[] {
  const result: SerializedGraphNode[] = []
  const visited = new Set<string>()

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = nodes[nodeId]
    if (!node) return

    result.push(node)

    // Follow next pointer
    if ('next' in node && node.next) {
      if (typeof node.next === 'string') {
        visit(node.next)
      }
    }
  }

  for (const entryId of entryNodeIds) {
    visit(entryId)
  }

  return result
}

/**
 * Generate DSL code for a single node
 */
function nodeToCode(
  node: SerializedGraphNode,
  nodes: Record<string, SerializedGraphNode>,
  indent: string
): string[] {
  const lines: string[] = []

  // Handle RPC nodes (function calls)
  if ('rpcName' in node && node.rpcName && node.rpcName !== 'unknown') {
    const stepName = node.stepName || `Call ${node.rpcName}`
    const input = (node.input || {}) as Record<string, unknown>
    const inputCode = inputToCode(input, indent)
    const outputVar = (node as any).outputVar

    let doCall = `await workflow.do('${stepName}', '${node.rpcName}', ${inputCode}`

    // Add options if present
    if ((node as any).options) {
      const optCode = optionsToCode((node as any).options)
      if (optCode) {
        doCall += `, ${optCode}`
      }
    }
    doCall += ')'

    if (outputVar) {
      lines.push(`${indent}const ${outputVar} = ${doCall}`)
    } else {
      lines.push(`${indent}${doCall}`)
    }
    lines.push('')
    return lines
  }

  // Handle flow nodes
  if ('flow' in node) {
    const flowNode = node as any

    switch (flowNode.flow) {
      case 'sleep':
        lines.push(
          `${indent}await workflow.sleep('${flowNode.stepName || 'Sleep'}', '${flowNode.duration}')`
        )
        lines.push('')
        break

      case 'cancel':
        lines.push(
          `${indent}await workflow.cancel('${flowNode.stepName || 'Cancelled'}')`
        )
        lines.push('')
        break

      case 'branch':
        const condition = conditionToCode(flowNode.conditions)
        lines.push(`${indent}if (${condition}) {`)
        // Process then branch nodes
        if (flowNode.thenEntry && nodes[flowNode.thenEntry]) {
          const thenLines = nodeToCode(
            nodes[flowNode.thenEntry],
            nodes,
            indent + '  '
          )
          lines.push(...thenLines)
        }
        lines.push(`${indent}}`)
        lines.push('')
        break

      case 'switch':
        lines.push(`${indent}switch (${flowNode.expression}) {`)
        for (const caseItem of flowNode.cases || []) {
          lines.push(`${indent}  case '${caseItem.value}':`)
          if (caseItem.entry && nodes[caseItem.entry]) {
            const caseLines = nodeToCode(
              nodes[caseItem.entry],
              nodes,
              indent + '    '
            )
            lines.push(...caseLines)
          }
          lines.push(`${indent}    break`)
        }
        if (flowNode.defaultEntry && nodes[flowNode.defaultEntry]) {
          lines.push(`${indent}  default:`)
          const defaultLines = nodeToCode(
            nodes[flowNode.defaultEntry],
            nodes,
            indent + '    '
          )
          lines.push(...defaultLines)
          lines.push(`${indent}    break`)
        }
        lines.push(`${indent}}`)
        lines.push('')
        break

      case 'parallel':
        lines.push(`${indent}await Promise.all([`)
        for (const childId of flowNode.children || []) {
          if (nodes[childId]) {
            const childNode = nodes[childId]
            if ('rpcName' in childNode && childNode.rpcName) {
              const stepName = childNode.stepName || `Call ${childNode.rpcName}`
              const input = (childNode.input || {}) as Record<string, unknown>
              const inputCode = inputToCode(input, indent + '  ')
              lines.push(
                `${indent}  workflow.do('${stepName}', '${childNode.rpcName}', ${inputCode}),`
              )
            }
          }
        }
        lines.push(`${indent}])`)
        lines.push('')
        break

      case 'fanout':
        if (flowNode.mode === 'parallel') {
          lines.push(`${indent}await Promise.all(`)
          lines.push(
            `${indent}  ${flowNode.sourceVar}.map(async (${flowNode.itemVar}) =>`
          )
          if (flowNode.childEntry && nodes[flowNode.childEntry]) {
            const childNode = nodes[flowNode.childEntry]
            if ('rpcName' in childNode && childNode.rpcName) {
              const stepName = childNode.stepName || `Call ${childNode.rpcName}`
              const input = (childNode.input || {}) as Record<string, unknown>
              const inputCode = inputToCode(input, indent + '    ')
              lines.push(
                `${indent}    await workflow.do('${stepName}', '${childNode.rpcName}', ${inputCode})`
              )
            }
          }
          lines.push(`${indent}  )`)
          lines.push(`${indent})`)
        } else {
          // Sequential fanout
          lines.push(
            `${indent}for (const ${flowNode.itemVar} of ${flowNode.sourceVar}) {`
          )
          if (flowNode.childEntry && nodes[flowNode.childEntry]) {
            const childNode = nodes[flowNode.childEntry]
            if ('rpcName' in childNode && childNode.rpcName) {
              const stepName = childNode.stepName || `Call ${childNode.rpcName}`
              const input = (childNode.input || {}) as Record<string, unknown>
              const inputCode = inputToCode(input, indent + '  ')
              lines.push(
                `${indent}  await workflow.do('${stepName}', '${childNode.rpcName}', ${inputCode})`
              )
            }
          }
          if (flowNode.timeBetween) {
            lines.push(
              `${indent}  await workflow.sleep('Wait between iterations', '${flowNode.timeBetween}')`
            )
          }
          lines.push(`${indent}}`)
        }
        lines.push('')
        break

      case 'filter':
        lines.push(
          `${indent}const ${flowNode.outputVar} = ${flowNode.sourceVar}.filter((${flowNode.itemVar}) => ${conditionToCode(flowNode.condition)})`
        )
        lines.push('')
        break

      case 'arrayPredicate':
        const method = flowNode.mode === 'some' ? 'some' : 'every'
        lines.push(
          `${indent}const ${flowNode.outputVar} = ${flowNode.sourceVar}.${method}((${flowNode.itemVar}) => ${conditionToCode(flowNode.condition)})`
        )
        lines.push('')
        break

      case 'return':
        if (flowNode.outputs) {
          const returnObj: string[] = []
          for (const [key, output] of Object.entries(
            flowNode.outputs as Record<string, any>
          )) {
            if (output.from === 'outputVar') {
              const value = output.path
                ? `${output.name}?.${output.path}`
                : output.name
              returnObj.push(`${indent}  ${key}: ${value},`)
            }
          }
          if (returnObj.length > 0) {
            lines.push(`${indent}return {`)
            lines.push(...returnObj)
            lines.push(`${indent}}`)
          }
        }
        break

      case 'inline':
        lines.push(
          `${indent}// Inline step: ${flowNode.stepName || 'Dynamic code'}`
        )
        lines.push(`${indent}// ${flowNode.description || '<dynamic code>'}`)
        lines.push('')
        break
    }
  }

  return lines
}

/**
 * Deserialize a workflow graph to DSL code
 */
export function deserializeDslWorkflow(
  workflow: SerializedWorkflowGraph,
  options: DeserializeOptions = {}
): string {
  const { pikkuImportPath = '../.pikku/workflow/pikku-workflow-types.gen.js' } =
    options

  const lines: string[] = []

  // Import statement
  lines.push(`import { pikkuWorkflowFunc } from '${pikkuImportPath}'`)
  lines.push('')

  // Add description as comment if present
  if (workflow.description) {
    lines.push(`/**`)
    lines.push(` * ${workflow.description}`)
    lines.push(` */`)
  }

  // Function signature
  const tagsComment = workflow.tags?.length
    ? ` // tags: ${workflow.tags.join(', ')}`
    : ''

  lines.push(
    `export const ${workflow.name} = pikkuWorkflowFunc(async ({}, data, { workflow }) => {${tagsComment}`
  )

  // Process nodes in order
  const orderedNodes = traverseNodes(workflow.nodes, workflow.entryNodeIds)

  for (const node of orderedNodes) {
    // Skip child nodes that are processed as part of their parent
    if (
      node.nodeId.includes('_then_') ||
      node.nodeId.includes('_case') ||
      node.nodeId.includes('_default_') ||
      node.nodeId.includes('_child_') ||
      node.nodeId.includes('_item_')
    ) {
      continue
    }

    const nodeLines = nodeToCode(node, workflow.nodes, '  ')
    lines.push(...nodeLines)
  }

  lines.push('})')
  lines.push('')

  return lines.join('\n')
}

/**
 * Convert a DataRef to graph ref() call
 */
function dataRefToGraphRef(ref: DataRef): string {
  if (ref.path) {
    return `ref('${ref.$ref}', '${ref.path}')`
  }
  return `ref('${ref.$ref}')`
}

/**
 * Convert input object to graph input code using ref()
 */
function inputToGraphCode(input: Record<string, unknown>): {
  hasRefs: boolean
  code: string
} {
  const entries = Object.entries(input)
  if (entries.length === 0) return { hasRefs: false, code: '{}' }

  let hasRefs = false
  const lines = entries.map(([key, value]) => {
    if (isDataRef(value)) {
      hasRefs = true
      return `        ${key}: ${dataRefToGraphRef(value)},`
    }
    return `        ${key}: ${JSON.stringify(value)},`
  })

  return {
    hasRefs,
    code: `{\n${lines.join('\n')}\n      }`,
  }
}

/**
 * Serialize wires to code
 */
function wiresToCode(wires: SerializedWorkflowGraph['wires']): string {
  if (!wires || Object.keys(wires).length === 0) return '{}'

  const parts: string[] = []

  if (wires.http && wires.http.length > 0) {
    const httpItems = wires.http.map(
      (h) =>
        `{ route: '${h.route}', method: '${h.method}', startNode: '${h.startNode}' }`
    )
    parts.push(`http: [${httpItems.join(', ')}]`)
  }

  if (wires.channel && wires.channel.length > 0) {
    const channelItems = wires.channel.map((c) => {
      const channelParts: string[] = [`name: '${c.name}'`]
      if (c.onConnect) channelParts.push(`onConnect: '${c.onConnect}'`)
      if (c.onDisconnect) channelParts.push(`onDisconnect: '${c.onDisconnect}'`)
      if (c.onMessage) channelParts.push(`onMessage: '${c.onMessage}'`)
      return `{ ${channelParts.join(', ')} }`
    })
    parts.push(`channel: [${channelItems.join(', ')}]`)
  }

  if (wires.queue && wires.queue.length > 0) {
    const queueItems = wires.queue.map(
      (q) => `{ name: '${q.name}', startNode: '${q.startNode}' }`
    )
    parts.push(`queue: [${queueItems.join(', ')}]`)
  }

  if (wires.cli && wires.cli.length > 0) {
    const cliItems = wires.cli.map(
      (c) => `{ command: '${c.command}', startNode: '${c.startNode}' }`
    )
    parts.push(`cli: [${cliItems.join(', ')}]`)
  }

  if (wires.schedule && wires.schedule.length > 0) {
    const scheduleItems = wires.schedule.map((s) => {
      const scheduleParts: string[] = []
      if (s.cron) scheduleParts.push(`cron: '${s.cron}'`)
      if (s.interval) scheduleParts.push(`interval: '${s.interval}'`)
      scheduleParts.push(`startNode: '${s.startNode}'`)
      return `{ ${scheduleParts.join(', ')} }`
    })
    parts.push(`schedule: [${scheduleItems.join(', ')}]`)
  }

  if (wires.trigger && wires.trigger.length > 0) {
    const triggerItems = wires.trigger.map(
      (t) => `{ name: '${t.name}', startNode: '${t.startNode}' }`
    )
    parts.push(`trigger: [${triggerItems.join(', ')}]`)
  }

  return `{ ${parts.join(', ')} }`
}

/**
 * Deserialize a graph workflow to pikkuWorkflowGraph code
 */
export function deserializeGraphWorkflow(
  workflow: SerializedWorkflowGraph,
  options: DeserializeOptions = {}
): string {
  const { pikkuImportPath = '../.pikku/workflow/pikku-workflow-types.gen.js' } =
    options

  const lines: string[] = []

  // Import statement
  lines.push(
    `import { pikkuWorkflowGraph, wireWorkflow } from '${pikkuImportPath}'`
  )
  lines.push('')

  // Add description as comment if present
  if (workflow.description) {
    lines.push(`/**`)
    lines.push(` * ${workflow.description}`)
    lines.push(` */`)
  }

  // Build node to RPC mapping (first phase)
  const nodeRpcMap: Record<string, string> = {}
  for (const [nodeId, node] of Object.entries(workflow.nodes)) {
    if (
      'rpcName' in node &&
      typeof node.rpcName === 'string' &&
      node.rpcName !== 'unknown'
    ) {
      nodeRpcMap[nodeId] = node.rpcName
    }
  }

  // Build node configurations (second phase)
  const nodeConfigs: string[] = []

  for (const [nodeId, node] of Object.entries(workflow.nodes)) {
    const configParts: string[] = []

    // Add next if present
    if ('next' in node && node.next) {
      configParts.push(`next: '${node.next}'`)
    }

    // Add input if present
    if ('input' in node && node.input) {
      const input = node.input as Record<string, unknown>
      if (Object.keys(input).length > 0) {
        const { hasRefs, code } = inputToGraphCode(input)
        if (hasRefs) {
          configParts.push(`input: (ref) => (${code})`)
        } else {
          configParts.push(`input: ${code}`)
        }
      }
    }

    if (configParts.length > 0) {
      nodeConfigs.push(
        `    ${nodeId}: {\n      ${configParts.join(',\n      ')},\n    }`
      )
    }
  }

  // Generate the pikkuWorkflowGraph call
  lines.push(`export const ${workflow.name} = pikkuWorkflowGraph({`)
  lines.push(`  name: '${workflow.name}',`)
  if (workflow.description) {
    lines.push(`  description: '${workflow.description}',`)
  }
  if (workflow.tags && workflow.tags.length > 0) {
    lines.push(`  tags: [${workflow.tags.map((t) => `'${t}'`).join(', ')}],`)
  }

  // Generate nodes (RPC mapping)
  const rpcMapEntries = Object.entries(nodeRpcMap)
  if (rpcMapEntries.length > 0) {
    lines.push(`  nodes: {`)
    for (const [nodeId, rpcName] of rpcMapEntries) {
      lines.push(`    ${nodeId}: '${rpcName}',`)
    }
    lines.push(`  },`)
  } else {
    lines.push(`  nodes: {},`)
  }

  // Generate config (node configurations)
  if (nodeConfigs.length > 0) {
    lines.push(`  config: {`)
    lines.push(nodeConfigs.join(',\n'))
    lines.push(`  },`)
  }

  lines.push(`})`)
  lines.push('')

  // Generate wireWorkflow if wires are present
  if (workflow.wires && Object.keys(workflow.wires).length > 0) {
    lines.push(`wireWorkflow({`)
    lines.push(`  wires: ${wiresToCode(workflow.wires)},`)
    lines.push(`  graph: ${workflow.name},`)
    lines.push(`})`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Deserialize all workflows from JSON to DSL code
 */
export function deserializeAllDslWorkflows(
  workflows: Record<string, SerializedWorkflowGraph>,
  options: DeserializeOptions = {}
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [name, workflow] of Object.entries(workflows)) {
    if (workflow.source === 'dsl') {
      result[name] = deserializeDslWorkflow(workflow, options)
    } else if (workflow.source === 'graph') {
      result[name] = deserializeGraphWorkflow(workflow, options)
    }
  }

  return result
}
