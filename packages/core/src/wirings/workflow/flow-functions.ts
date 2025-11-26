/**
 * Flow control functions for WorkflowGraph.
 * These functions use graph.branch() to select which path to take.
 *
 * Note: These are reference implementations. In practice, these would be
 * defined in user code using pikkuGraphFunc from the generated types.
 */

import type { GraphContext } from './workflow-graph.types.js'
import { wireForgeNode } from '../forge-node/forge-node.types.js'

/**
 * Core flow function types
 * These define the function signatures for flow control nodes
 */

/**
 * If condition input
 */
export interface IfConditionInput {
  condition: boolean
}

/**
 * Switch case input
 */
export interface SwitchCaseInput {
  value: string
  cases: string[]
}

/**
 * While loop input
 */
export interface WhileLoopInput {
  condition: boolean
  maxIterations?: number
}

/**
 * For loop input
 */
export interface ForLoopInput {
  count: number
  maxIterations?: number
}

/**
 * Delay input
 */
export interface DelayInput {
  duration: number // milliseconds
}

/**
 * Merge input (combines multiple inputs)
 */
export interface MergeInput {
  inputs: Record<string, unknown>
}

/**
 * If condition function - branches on boolean
 */
export async function ifConditionFunc(
  _services: any,
  data: IfConditionInput,
  wire: { graph: GraphContext<'true' | 'false'> }
): Promise<void> {
  wire.graph.branch(data.condition ? 'true' : 'false')
}

/**
 * Switch case function - branches on value match
 */
export async function switchCaseFunc(
  _services: any,
  data: SwitchCaseInput,
  wire: { graph: GraphContext<string> }
): Promise<void> {
  wire.graph.branch(data.cases.includes(data.value) ? data.value : 'default')
}

/**
 * While loop function - continues or exits based on condition
 */
export async function whileLoopFunc(
  _services: any,
  data: WhileLoopInput,
  wire: { graph: GraphContext<'continue' | 'done'> }
): Promise<void> {
  const maxIterations = data.maxIterations ?? 100
  if (wire.graph.iteration >= maxIterations) {
    wire.graph.branch('done')
    return
  }
  wire.graph.branch(data.condition ? 'continue' : 'done')
}

/**
 * For loop function - iterates a fixed number of times
 */
export async function forLoopFunc(
  _services: any,
  data: ForLoopInput,
  wire: { graph: GraphContext<'next' | 'done'> }
): Promise<{ index: number }> {
  const maxIterations = data.maxIterations ?? data.count
  if (wire.graph.iteration >= Math.min(data.count, maxIterations)) {
    wire.graph.branch('done')
    return { index: wire.graph.iteration }
  }
  wire.graph.branch('next')
  return { index: wire.graph.iteration }
}

/**
 * Delay function - waits for specified duration
 */
export async function delayFunc(
  _services: any,
  data: DelayInput
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, data.duration))
}

/**
 * Merge function - passes through combined inputs
 */
export async function mergeFunc(
  _services: any,
  data: MergeInput
): Promise<Record<string, unknown>> {
  return data.inputs
}

// Wire forge nodes for UI visualization

wireForgeNode({
  name: 'ifCondition',
  displayName: 'If Condition',
  category: 'Flow',
  type: 'action',
  rpc: 'ifCondition',
  description: 'Conditional branching based on boolean condition',
})

wireForgeNode({
  name: 'switchCase',
  displayName: 'Switch Case',
  category: 'Flow',
  type: 'action',
  rpc: 'switchCase',
  description: 'Multi-way branching based on value matching',
})

wireForgeNode({
  name: 'whileLoop',
  displayName: 'While Loop',
  category: 'Flow',
  type: 'action',
  rpc: 'whileLoop',
  description: 'Loop while condition is true',
})

wireForgeNode({
  name: 'forLoop',
  displayName: 'For Loop',
  category: 'Flow',
  type: 'action',
  rpc: 'forLoop',
  description: 'Loop a fixed number of times',
})

wireForgeNode({
  name: 'delay',
  displayName: 'Delay',
  category: 'Flow',
  type: 'action',
  rpc: 'delay',
  description: 'Wait for a specified duration',
})

wireForgeNode({
  name: 'merge',
  displayName: 'Merge',
  category: 'Flow',
  type: 'action',
  rpc: 'merge',
  description: 'Combine multiple inputs into one output',
})
