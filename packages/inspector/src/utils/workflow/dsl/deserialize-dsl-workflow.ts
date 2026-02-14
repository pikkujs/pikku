/**
 * Deserialize workflow JSON back to DSL code
 * Converts the serialized workflow graph format back to TypeScript DSL code
 */

import type {
  SerializedWorkflowGraph,
  SerializedGraphNode,
  DataRef,
  ContextVariable,
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
 * State reference (context variable)
 */
interface StateRef {
  $state: string
  path?: string
}

/**
 * Check if a value is a StateRef
 */
function isStateRef(value: unknown): value is StateRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$state' in value &&
    typeof (value as StateRef).$state === 'string'
  )
}

/**
 * Check if value is a template literal reference
 */
interface TemplateRef {
  $template: {
    parts: string[]
    expressions: unknown[]
  }
}

function isTemplateRef(value: unknown): value is TemplateRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$template' in value &&
    typeof (value as TemplateRef).$template === 'object'
  )
}

/**
 * Convert a DataRef to code expression
 */
function dataRefToCode(ref: DataRef, itemVar?: string): string {
  if (ref.$ref === 'trigger') {
    // Reference to trigger input (data)
    return ref.path ? `data.${ref.path}` : 'data'
  }
  if (ref.$ref === '$item') {
    // Reference to the current loop item
    // The path contains the variable name in this case
    return ref.path || itemVar || 'item'
  }
  // Reference to a step output variable
  return ref.path ? `${ref.$ref}.${ref.path}` : ref.$ref
}

/**
 * Convert a template ref to template literal code
 */
function templateRefToCode(template: TemplateRef, itemVar?: string): string {
  const { parts, expressions } = template.$template
  let result = '`'

  for (let i = 0; i < parts.length; i++) {
    result += parts[i]
    if (i < expressions.length) {
      const expr = expressions[i]
      let exprCode: string
      if (isDataRef(expr)) {
        exprCode = dataRefToCode(expr, itemVar)
      } else if (isTemplateRef(expr)) {
        // Nested template (unlikely but handle it)
        exprCode = templateRefToCode(expr, itemVar)
      } else {
        // Literal value
        exprCode = String(expr)
      }
      result += '${' + exprCode + '}'
    }
  }

  result += '`'
  return result
}

/**
 * Convert a StateRef to code expression
 */
function stateRefToCode(ref: StateRef): string {
  return ref.path ? `${ref.$state}.${ref.path}` : ref.$state
}

/**
 * Convert a single value to code (handles refs, templates, state refs, and literals)
 */
function valueToCode(value: unknown, itemVar?: string): string {
  if (isDataRef(value)) {
    return dataRefToCode(value, itemVar)
  }
  if (isStateRef(value)) {
    return stateRefToCode(value)
  }
  if (isTemplateRef(value)) {
    return templateRefToCode(value, itemVar)
  }
  if (Array.isArray(value)) {
    const elements = value.map((v) => valueToCode(v, itemVar))
    return `[${elements.join(', ')}]`
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    const props = entries.map(([k, v]) => `${k}: ${valueToCode(v, itemVar)}`)
    return `{ ${props.join(', ')} }`
  }
  return JSON.stringify(value)
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
function inputToCode(
  input: Record<string, unknown>,
  indent: string,
  itemVar?: string
): string {
  // Check if this is a passthrough (entire data object)
  if (isPassthrough(input)) {
    return 'data'
  }

  const entries = Object.entries(input)
  if (entries.length === 0) return '{}'

  const lines = entries.map(([key, value]) => {
    return `${indent}  ${key}: ${valueToCode(value, itemVar)},`
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
 * Collect conditional variables that need to be declared before a branch
 */
function collectBranchConditionalVars(
  branchNode: any,
  nodes: Record<string, SerializedGraphNode>,
  conditionalVars: Set<string>
): string[] {
  const vars: string[] = []

  // Check all branches (if/else-if chain)
  if (branchNode.branches) {
    for (const branch of branchNode.branches) {
      if (branch.entry) {
        collectVarsFromBranch(branch.entry, nodes, conditionalVars, vars)
      }
    }
  }

  // Check else branch
  if (branchNode.elseEntry) {
    collectVarsFromBranch(branchNode.elseEntry, nodes, conditionalVars, vars)
  }

  return vars
}

/**
 * Recursively collect output variables from a branch that are in conditionalVars
 */
function collectVarsFromBranch(
  nodeId: string,
  nodes: Record<string, SerializedGraphNode>,
  conditionalVars: Set<string>,
  result: string[]
): void {
  const node = nodes[nodeId]
  if (!node) return

  // Check if this node has an outputVar that's conditional
  if ('outputVar' in node && node.outputVar) {
    const varName = node.outputVar as string
    if (conditionalVars.has(varName) && !result.includes(varName)) {
      result.push(varName)
    }
  }

  // Follow the chain of nodes within the branch
  if ('next' in node && node.next) {
    const nextId = node.next as string
    // Only follow if it's still within the branch
    if (isWithinBranch(nextId)) {
      collectVarsFromBranch(nextId, nodes, conditionalVars, result)
    }
  }
}

/**
 * Check if a node ID is still within a branch (not the main flow)
 */
function isWithinBranch(nodeId: string): boolean {
  return (
    nodeId.includes('_then_') ||
    nodeId.includes('_else_') ||
    nodeId.includes('_branch')
  )
}

/**
 * Generate code for branch content (then/else blocks)
 */
function generateBranchContent(
  entryNodeId: string,
  nodes: Record<string, SerializedGraphNode>,
  indent: string,
  conditionalVars: Set<string>
): string[] {
  const lines: string[] = []
  let currentId: string | undefined = entryNodeId

  while (currentId) {
    const node = nodes[currentId]
    if (!node) break

    const nodeLines = nodeToCode(node, nodes, indent, conditionalVars, true)
    lines.push(...nodeLines)

    // Follow to next node within the branch
    if ('next' in node && node.next) {
      const nextId = node.next as string
      // Only continue if it's still within the branch
      if (isWithinBranch(nextId)) {
        currentId = nextId
      } else {
        break
      }
    } else {
      break
    }
  }

  return lines
}

/**
 * Generate DSL code for a single node
 */
function nodeToCode(
  node: SerializedGraphNode,
  nodes: Record<string, SerializedGraphNode>,
  indent: string,
  conditionalVars: Set<string> = new Set(),
  isInsideBranch: boolean = false
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
      // If this is a conditional var inside a branch, use assignment (let was declared above)
      if (isInsideBranch && conditionalVars.has(outputVar)) {
        lines.push(`${indent}${outputVar} = ${doCall}`)
      } else {
        lines.push(`${indent}const ${outputVar} = ${doCall}`)
      }
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
        const cancelReason =
          flowNode.reason || flowNode.stepName || 'Workflow cancelled'
        lines.push(
          `${indent}throw new WorkflowCancelledException('${cancelReason}')`
        )
        lines.push('')
        break

      case 'branch':
        // Declare conditional variables before the if statement
        const branchConditionalVars = collectBranchConditionalVars(
          flowNode,
          nodes,
          conditionalVars
        )
        for (const varName of branchConditionalVars) {
          lines.push(`${indent}let ${varName}`)
        }

        // Generate if/else-if/else chain
        const branches = flowNode.branches || []
        for (let i = 0; i < branches.length; i++) {
          const branch = branches[i]
          const condition = conditionToCode(branch.condition)
          const keyword = i === 0 ? 'if' : 'else if'
          lines.push(`${indent}${keyword} (${condition}) {`)

          if (branch.entry && nodes[branch.entry]) {
            const branchLines = generateBranchContent(
              branch.entry,
              nodes,
              indent + '  ',
              conditionalVars
            )
            lines.push(...branchLines)
          }
          lines.push(`${indent}}`)
        }

        // Generate else block if present
        if (flowNode.elseEntry && nodes[flowNode.elseEntry]) {
          lines.push(`${indent}else {`)
          const elseLines = generateBranchContent(
            flowNode.elseEntry,
            nodes,
            indent + '  ',
            conditionalVars
          )
          lines.push(...elseLines)
          lines.push(`${indent}}`)
        }
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
              const inputCode = inputToCode(
                input,
                indent + '    ',
                flowNode.itemVar
              )
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
              const inputCode = inputToCode(
                input,
                indent + '  ',
                flowNode.itemVar
              )
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
            let value: string
            if (output.from === 'outputVar') {
              value = output.path
                ? `${output.name}?.${output.path}`
                : output.name
            } else if (output.from === 'stateVar') {
              value = output.path
                ? `${output.name}.${output.path}`
                : output.name
            } else if (output.from === 'input') {
              value = `data.${output.path}`
            } else if (output.from === 'literal') {
              value = JSON.stringify(output.value)
            } else if (output.from === 'expression') {
              value = output.expression
            } else {
              continue
            }
            returnObj.push(`${indent}  ${key}: ${value},`)
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

      case 'set':
        // Generate variable assignment: varName = value
        const setVar = flowNode.variable
        const setValue =
          typeof flowNode.value === 'string'
            ? `'${flowNode.value}'`
            : JSON.stringify(flowNode.value)
        lines.push(`${indent}${setVar} = ${setValue}`)
        lines.push('')
        break
    }
  }

  return lines
}

/**
 * Find variables that are defined inside branches but used in return statements
 * These need to be hoisted with `let` declarations
 */
function findConditionalVars(
  nodes: Record<string, SerializedGraphNode>
): Set<string> {
  const conditionalVars = new Set<string>()
  const varsInBranches = new Set<string>()
  const varsUsedInReturn = new Set<string>()

  // Collect variables defined in branches (then/else/case/default nodes)
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (
      nodeId.includes('_then_') ||
      nodeId.includes('_else_') ||
      nodeId.includes('_case') ||
      nodeId.includes('_default_')
    ) {
      if ('outputVar' in node && node.outputVar) {
        varsInBranches.add(node.outputVar as string)
      }
    }
  }

  // Collect variables used in return statements
  for (const node of Object.values(nodes)) {
    if ('flow' in node && node.flow === 'return' && node.outputs) {
      for (const output of Object.values(
        node.outputs as Record<string, { from: string; name?: string }>
      )) {
        if (output.from === 'outputVar' && output.name) {
          varsUsedInReturn.add(output.name)
        }
      }
    }
  }

  // Variables that are both in branches and used in return need hoisting
  for (const varName of varsInBranches) {
    if (varsUsedInReturn.has(varName)) {
      conditionalVars.add(varName)
    }
  }

  return conditionalVars
}

/**
 * Get default value for a context variable type
 */
function getDefaultForType(type: string): string {
  switch (type) {
    case 'string':
      return "''"
    case 'number':
      return '0'
    case 'boolean':
      return 'false'
    case 'array':
      return '[]'
    case 'object':
      return '{}'
    default:
      return 'undefined'
  }
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

  // Check if workflow has any cancel nodes
  const hasCancelNode = Object.values(workflow.nodes).some(
    (node) => 'flow' in node && (node as any).flow === 'cancel'
  )

  // Find variables defined in branches that need hoisting
  const conditionalVars = findConditionalVars(workflow.nodes)

  // Import statement
  if (hasCancelNode) {
    lines.push(
      `import { pikkuWorkflowFunc, WorkflowCancelledException } from '${pikkuImportPath}'`
    )
  } else {
    lines.push(`import { pikkuWorkflowFunc } from '${pikkuImportPath}'`)
  }
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

  // Generate context variable declarations at the top
  if (workflow.context && Object.keys(workflow.context).length > 0) {
    for (const [varName, varDef] of Object.entries(workflow.context) as [
      string,
      ContextVariable,
    ][]) {
      const defaultValue =
        varDef.default !== undefined
          ? typeof varDef.default === 'string'
            ? `'${varDef.default}'`
            : JSON.stringify(varDef.default)
          : getDefaultForType(varDef.type)
      lines.push(`  let ${varName} = ${defaultValue}`)
    }
    lines.push('')
  }

  // Process nodes in order
  const orderedNodes = traverseNodes(workflow.nodes, workflow.entryNodeIds)

  for (const node of orderedNodes) {
    // Skip child nodes that are processed as part of their parent
    if (
      node.nodeId.includes('_then_') ||
      node.nodeId.includes('_else_') ||
      node.nodeId.includes('_case') ||
      node.nodeId.includes('_default_') ||
      node.nodeId.includes('_child_') ||
      node.nodeId.includes('_item_')
    ) {
      continue
    }

    const nodeLines = nodeToCode(node, workflow.nodes, '  ', conditionalVars)
    lines.push(...nodeLines)
  }

  lines.push('})')
  lines.push('')

  return lines.join('\n')
}

/**
 * Convert a DataRef to graph ref() call
 * @param ref - The data reference
 * @param outputVarToNodeId - Map from outputVar names to node IDs
 */
function dataRefToGraphRef(
  ref: DataRef,
  outputVarToNodeId: Map<string, string>
): string {
  // Convert outputVar reference to nodeId reference
  const nodeId = outputVarToNodeId.get(ref.$ref) || ref.$ref
  if (ref.path) {
    return `ref('${nodeId}', '${ref.path}')`
  }
  return `ref('${nodeId}')`
}

/**
 * Convert a template ref to template() function call for graph code
 * e.g. {$template: {parts: ["Hello ", ""], expressions: [{$ref: "trigger", path: "name"}]}}
 * becomes: template('Hello $0', [ref('trigger', 'name')])
 */
function templateRefToGraphCode(
  tmpl: TemplateRef,
  outputVarToNodeId: Map<string, string>
): string {
  const { parts, expressions } = tmpl.$template

  // Build the template string with $0, $1, etc. placeholders
  let templateStr = ''
  for (let i = 0; i < parts.length; i++) {
    templateStr += parts[i]
    if (i < expressions.length) {
      templateStr += `$${i}`
    }
  }

  // Build the refs array
  const refs: string[] = []
  for (const expr of expressions) {
    if (isDataRef(expr)) {
      refs.push(dataRefToGraphRef(expr, outputVarToNodeId))
    } else {
      // Literal JS expression - can't be represented as a typed ref
      refs.push(`{ $ref: '${String(expr).replace(/'/g, "\\'")}' } as any`)
    }
  }

  // Escape single quotes and newlines in the template string
  templateStr = templateStr
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')

  return `template('${templateStr}', [${refs.join(', ')}])`
}

function valueToGraphCode(
  value: unknown,
  outputVarToNodeId: Map<string, string>,
  refTracker: { hasRefs: boolean }
): string {
  if (isDataRef(value)) {
    refTracker.hasRefs = true
    return dataRefToGraphRef(value, outputVarToNodeId)
  }
  if (isTemplateRef(value)) {
    refTracker.hasRefs = true
    return templateRefToGraphCode(value, outputVarToNodeId)
  }
  if (Array.isArray(value)) {
    const elements = value.map((v) =>
      valueToGraphCode(v, outputVarToNodeId, refTracker)
    )
    return `[${elements.join(', ')}]`
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
    const props = entries.map(
      ([k, v]) => `${k}: ${valueToGraphCode(v, outputVarToNodeId, refTracker)}`
    )
    return `{ ${props.join(', ')} }`
  }
  return JSON.stringify(value)
}

/**
 * Convert input object to graph input code using ref()
 * @param input - The input mapping
 * @param outputVarToNodeId - Map from outputVar names to node IDs
 */
function inputToGraphCode(
  input: Record<string, unknown>,
  outputVarToNodeId: Map<string, string>
): {
  hasRefs: boolean
  code: string
} {
  const entries = Object.entries(input)
  if (entries.length === 0) return { hasRefs: false, code: '{}' }

  const refTracker = { hasRefs: false }
  const lines = entries.map(([key, value]) => {
    return `        ${key}: ${valueToGraphCode(value, outputVarToNodeId, refTracker)},`
  })

  return {
    hasRefs: refTracker.hasRefs,
    code: `{\n${lines.join('\n')}\n      }`,
  }
}

/**
 * Check if a node is a flow node (non-RPC control flow)
 */
function isFlowNode(node: any): boolean {
  return 'flow' in node
}

/**
 * Follow through flow nodes to find the next RPC node
 * This traverses the 'next' chain, skipping flow nodes until finding an RPC node
 */
function findNextRpcNode(
  startNextId: string,
  nodes: Record<string, SerializedGraphNode>,
  flowNodeIds: Set<string>,
  visited: Set<string> = new Set()
): string | null {
  if (visited.has(startNextId)) {
    return null // Cycle detected, stop
  }
  visited.add(startNextId)

  // If it's not a flow node, we found our target
  if (!flowNodeIds.has(startNextId)) {
    // Make sure the node exists and has an rpcName (is an RPC node)
    const node = nodes[startNextId]
    if (node && 'rpcName' in node) {
      return startNextId
    }
    return null
  }

  // It's a flow node - follow its 'next' if it has one
  const flowNode = nodes[startNextId]
  if (flowNode && 'next' in flowNode && flowNode.next) {
    return findNextRpcNode(flowNode.next as string, nodes, flowNodeIds, visited)
  }

  return null
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
  lines.push(`import { pikkuWorkflowGraph } from '${pikkuImportPath}'`)
  lines.push('')

  // Add description as comment if present
  if (workflow.description) {
    lines.push(`/**`)
    lines.push(` * ${workflow.description}`)
    lines.push(` */`)
  }

  // Identify flow nodes (non-RPC nodes like return, sleep, branch)
  const flowNodeIds = new Set<string>()
  for (const [nodeId, node] of Object.entries(workflow.nodes)) {
    if (isFlowNode(node)) {
      flowNodeIds.add(nodeId)
    }
  }

  // Build outputVar to nodeId mapping (for resolving variable references to node IDs)
  const outputVarToNodeId = new Map<string, string>()
  for (const [nodeId, node] of Object.entries(workflow.nodes)) {
    if ('outputVar' in node && typeof node.outputVar === 'string') {
      outputVarToNodeId.set(node.outputVar, nodeId)
    }
  }

  // Build node to RPC mapping (only RPC nodes, not flow nodes)
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

  // Build node configurations (only for RPC nodes)
  const nodeConfigs: string[] = []

  for (const [nodeId, node] of Object.entries(workflow.nodes)) {
    // Skip flow nodes - they can't be represented in pikkuWorkflowGraph
    if (flowNodeIds.has(nodeId)) {
      continue
    }

    const configParts: string[] = []

    // Add next if present - follow through flow nodes to find the actual next RPC node
    if ('next' in node && node.next) {
      const nextId = node.next as string
      // If next points to a flow node, follow through to find the next RPC node
      const actualNextId = flowNodeIds.has(nextId)
        ? findNextRpcNode(nextId, workflow.nodes, flowNodeIds)
        : nextId
      // Only add if we found a valid next RPC node
      if (actualNextId && !flowNodeIds.has(actualNextId)) {
        configParts.push(`next: '${actualNextId}'`)
      }
    }

    // Add input if present
    // Always use callback form to avoid excess property checking in TypeScript
    if ('input' in node && node.input) {
      const input = node.input as Record<string, unknown>
      if (Object.keys(input).length > 0) {
        const { hasRefs, code } = inputToGraphCode(input, outputVarToNodeId)
        if (hasRefs) {
          // Always pass both ref and template for consistent type signature
          configParts.push(`input: (ref, template) => (${code})`)
        } else {
          // Wrap in callback to avoid TypeScript excess property checking
          configParts.push(`input: () => (${code})`)
        }
      }
    }

    if (configParts.length > 0) {
      nodeConfigs.push(
        `    ${nodeId}: {\n      ${configParts.join(',\n      ')},\n    }`
      )
    }
  }

  // Generate the pikkuWorkflowGraph call (builds graph and registers with core)
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
