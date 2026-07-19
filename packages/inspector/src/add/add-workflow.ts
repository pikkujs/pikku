import * as ts from 'typescript'
import type { AddWiring, InspectorState } from '../types.js'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { extractFunctionNode } from '../utils/extract-function-node.js'
import { ErrorCode } from '../error-codes.js'
import type { WorkflowStepMeta, WorkflowContext } from '@pikku/core/workflow'
import {
  extractStringLiteral,
  isStringLike,
  isFunctionLike,
  extractDescription,
  extractDuration,
} from '../utils/extract-node-value.js'
import {
  getCommonWireMetaData,
  getPropertyValue,
} from '../utils/get-property-value.js'
import { extractDSLWorkflow } from '../utils/workflow/dsl/extract-dsl-workflow.js'
import {
  getSourceText,
  extractActorFromOptions,
} from '../utils/workflow/dsl/patterns.js'

/**
 * Extract a workflow step's display name without letting a non-static name
 * (e.g. a function call) abort the scan. The step name is cosmetic, so a
 * resolution failure must never prevent the RPC from being registered.
 */
function extractStepName(node: ts.Node, checker: ts.TypeChecker): string {
  try {
    return extractStringLiteral(node, checker)
  } catch {
    return getSourceText(node)
  }
}

/**
 * Walk a function body for any `X.expectEventually(...)` call. Used to enforce
 * that the durable-polling assertion is a scenario-only primitive — regular
 * workflows must not carry test/assertion semantics.
 */
function containsExpectEventuallyCall(node: ts.Node): boolean {
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'expectEventually'
  ) {
    return true
  }
  let found = false
  ts.forEachChild(node, (child) => {
    if (!found && !ts.isFunctionDeclaration(child)) {
      found = containsExpectEventuallyCall(child)
    }
  })
  return found
}

/**
 * Recursively check if any step has inline type (non-serializable)
 */
function hasInlineSteps(steps: WorkflowStepMeta[]): boolean {
  for (const step of steps) {
    if (step.type === 'inline') {
      return true
    } else if (step.type === 'branch') {
      for (const branch of step.branches) {
        if (hasInlineSteps(branch.steps)) return true
      }
      if (step.elseSteps && hasInlineSteps(step.elseSteps)) return true
    } else if (step.type === 'switch' && step.cases) {
      for (const c of step.cases) {
        if (c.steps && hasInlineSteps(c.steps)) return true
      }
      if (step.defaultSteps && hasInlineSteps(step.defaultSteps)) return true
    } else if (step.type === 'fanout' && step.body) {
      if (hasInlineSteps(step.body)) return true
    } else if (step.type === 'parallel' && step.children) {
      if (hasInlineSteps(step.children)) return true
    }
  }
  return false
}

/**
 * Recursively collect all RPC names from workflow steps
 */
export function collectInvokedRPCs(
  steps: WorkflowStepMeta[],
  rpcs: Set<string>
): void {
  for (const step of steps) {
    if (step.type === 'rpc' && step.rpcName) {
      rpcs.add(step.rpcName)
    } else if (step.type === 'branch') {
      for (const branch of step.branches) {
        collectInvokedRPCs(branch.steps, rpcs)
      }
      if (step.elseSteps) collectInvokedRPCs(step.elseSteps, rpcs)
    } else if (step.type === 'switch' && step.cases) {
      for (const c of step.cases) {
        if (c.steps) collectInvokedRPCs(c.steps, rpcs)
      }
      if (step.defaultSteps) collectInvokedRPCs(step.defaultSteps, rpcs)
    } else if (step.type === 'fanout' && step.body) {
      collectInvokedRPCs(step.body, rpcs)
    } else if (step.type === 'parallel' && step.children) {
      collectInvokedRPCs(step.children, rpcs)
    }
  }
}

/**
 * Scan for workflow.do(), workflow.expectEventually(), workflow.sleep(), and
 * workflow.cancel() calls to extract workflow steps
 */
function getWorkflowInvocations(
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  workflowName: string,
  steps: WorkflowStepMeta[]
) {
  // Look for property access expressions: workflow.do or workflow.sleep
  if (ts.isPropertyAccessExpression(node)) {
    const { name } = node

    // Check if this is accessing 'do' or 'sleep' property
    if (
      name.text === 'do' ||
      name.text === 'sleep' ||
      name.text === 'cancel' ||
      name.text === 'expectEventually'
    ) {
      // Check if the parent is a call expression
      const parent = node.parent
      if (ts.isCallExpression(parent) && parent.expression === node) {
        const args = parent.arguments

        if (name.text === 'do' && args.length >= 2) {
          // workflow.do(stepName, rpcName|fn, data?, options?)
          const stepNameArg = args[0]
          const secondArg = args[1]
          const optionsArg =
            args.length >= 4 ? args[args.length - 1] : undefined

          const stepName = extractStepName(stepNameArg, checker)
          const description =
            extractDescription(optionsArg, checker) ?? undefined

          // Determine form by checking 2nd argument type
          if (isStringLike(secondArg, checker)) {
            // RPC form: workflow.do(stepName, rpcName, data, options?)
            const rpcName = extractStringLiteral(secondArg, checker)
            steps.push({
              type: 'rpc',
              stepName,
              rpcName,
              actor: extractActorFromOptions(optionsArg),
            })
            state.rpc.invokedFunctions.add(rpcName)
          } else if (isFunctionLike(secondArg)) {
            // Inline form: workflow.do(stepName, fn, options?)
            steps.push({
              type: 'inline',
              stepName: stepName || '<dynamic>',
              description: description || '<dynamic>',
            })
          }
        } else if (name.text === 'expectEventually' && args.length >= 4) {
          // workflow.expectEventually(stepName, rpcName, data, predicate, options?)
          const stepName = extractStepName(args[0], checker)
          if (isStringLike(args[1], checker)) {
            const rpcName = extractStringLiteral(args[1], checker)
            steps.push({
              type: 'rpc',
              stepName,
              rpcName,
              expectEventually: true,
              actor: extractActorFromOptions(
                args.length >= 5 ? args[4] : undefined
              ),
            })
            state.rpc.invokedFunctions.add(rpcName)
          }
        } else if (name.text === 'sleep' && args.length >= 2) {
          // workflow.sleep(stepName, duration)
          const stepNameArg = args[0]
          const durationArg = args[1]

          const stepName = extractStepName(stepNameArg, checker)
          const duration = extractDuration(durationArg, checker)

          steps.push({
            type: 'sleep',
            stepName: stepName || '<dynamic>',
            duration: duration || '<dynamic>',
          })
        } else if (name.text === 'cancel') {
          // workflow.cancel(reason?)
          steps.push({
            type: 'cancel',
          })
        }
      }
    }
  }

  // Recurse into children, including arrow functions (for Promise.all callbacks)
  // but skip function declarations (which would be separate functions)
  ts.forEachChild(node, (child) => {
    if (ts.isFunctionDeclaration(child)) {
      return
    }
    getWorkflowInvocations(child, checker, state, workflowName, steps)
  })
}

/**
 * Inspector for pikkuWorkflowFunc(), pikkuWorkflowComplexFunc() and
 * pikkuScenario() calls. Detects workflow registration and extracts metadata.
 */
export const addWorkflow: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  if (!ts.isIdentifier(expression)) {
    return
  }

  let wrapperType: 'dsl' | 'complex' | 'scenario' | null = null
  if (expression.text === 'pikkuWorkflowFunc') {
    wrapperType = 'dsl'
  } else if (expression.text === 'pikkuWorkflowComplexFunc') {
    wrapperType = 'complex'
  } else if (expression.text === 'pikkuScenario') {
    // A scenario is a complex workflow whose steps run as actors over the
    // real transport — same extraction rules as complex, distinct meta.
    wrapperType = 'scenario'
  } else {
    return
  }

  if (!firstArg) {
    return
  }

  // Extract workflow name and metadata using same logic as add-functions
  const { pikkuFuncId, name, exportedName } = extractFunctionName(
    node,
    checker,
    state.rootDir
  )

  const workflowName = exportedName || name

  if (!workflowName) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      `Could not determine workflow name from export.`
    )
    return
  }

  // Extract the function node (either direct function or from config.func)
  const { funcNode, resolvedFunc } = extractFunctionNode(firstArg, checker)

  // Extract metadata if using object form
  let tags: string[] | undefined
  let title: string | undefined
  let summary: string | undefined
  let description: string | undefined
  let errors: string[] | undefined
  let expose: boolean | undefined

  if (ts.isObjectLiteralExpression(firstArg)) {
    const metadata = getCommonWireMetaData(
      firstArg,
      'Workflow',
      workflowName,
      logger,
      checker
    )
    if (metadata.disabled) return
    tags = metadata.tags
    title = metadata.title
    summary = metadata.summary
    description = metadata.description
    errors = metadata.errors

    expose = getPropertyValue(firstArg, 'expose') as boolean | undefined
  }

  // Validate that we got a valid function
  if (
    ts.isObjectLiteralExpression(firstArg) &&
    (!funcNode || funcNode === firstArg)
  ) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      `No valid 'func' property for workflow '${workflowName}'.`
    )
    return
  }

  if (!resolvedFunc) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      `Could not resolve workflow function for '${workflowName}'.`
    )
    return
  }

  if (
    wrapperType !== 'scenario' &&
    containsExpectEventuallyCall(resolvedFunc)
  ) {
    logger.critical(
      ErrorCode.EXPECT_EVENTUALLY_SCENARIO_ONLY,
      `Workflow '${workflowName}' calls workflow.expectEventually(), which is only ` +
        `available in scenarios (pikkuScenario). Move it into a scenario, or drive ` +
        `the assertion outside the workflow.`
    )
    return
  }

  // Track workflow file for wiring generation
  if (exportedName) {
    state.workflows.files.set(pikkuFuncId, {
      path: node.getSourceFile().fileName,
      exportedName,
    })
  }

  let steps: WorkflowStepMeta[] = []
  let context: WorkflowContext | undefined = undefined
  let dsl: boolean | undefined = undefined

  // Try DSL workflow extraction first
  // Pass the whole CallExpression node so findWorkflowFunction can find the arrow function
  const result = extractDSLWorkflow(node, checker, {
    allowInline: wrapperType !== 'dsl',
  })

  if (result.status === 'ok' && result.steps) {
    // Extraction succeeded
    steps = result.steps
    context = result.context

    // Check if workflow contains inline steps (non-serializable)
    if (hasInlineSteps(steps)) {
      if (wrapperType === 'dsl') {
        // pikkuWorkflowFunc should not have inline steps
        logger.critical(
          ErrorCode.INVALID_DSL_WORKFLOW,
          `Workflow '${workflowName}' uses pikkuWorkflowFunc but contains inline steps which are not allowed in DSL workflows. Use pikkuWorkflowComplexFunc instead.`
        )
        return
      }
      // pikkuWorkflowComplexFunc with inline steps is marked as non-dsl
      dsl = false
    } else {
      // pikkuWorkflowComplexFunc is always non-dsl, pikkuWorkflowFunc is dsl
      dsl = wrapperType === 'dsl'
    }

    // Collect all invoked RPCs from workflow steps
    const rpcs = new Set<string>()
    collectInvokedRPCs(steps, rpcs)
    for (const rpc of rpcs) {
      state.rpc.invokedFunctions.add(rpc)
    }
  } else {
    // DSL extraction failed
    if (wrapperType === 'dsl') {
      // For pikkuWorkflowFunc, this is a critical error
      // But still track RPC invocations for function registration
      getWorkflowInvocations(resolvedFunc, checker, state, workflowName, steps)
      logger.critical(
        ErrorCode.INVALID_DSL_WORKFLOW,
        `Workflow '${workflowName}' does not conform to DSL workflow rules:\n${result.reason || 'Unknown error'}`
      )
      return
    } else {
      // For pikkuWorkflowComplexFunc, fall back to basic extraction
      logger.debug(
        `Workflow '${workflowName}' could not be extracted as DSL workflow: ${result.reason || 'Unknown error'}. Falling back to basic extraction.`
      )
      dsl = false
    }
  }

  // For pikkuWorkflowComplexFunc, also run basic extraction so RPCs in
  // patterns the DSL extractor doesn't handle (array+push, nested Promise.all
  // with identifier args, etc.) are still registered as invoked functions.
  // When DSL extraction already produced steps this pass is registration-only:
  // appending to `steps` would duplicate nodes and clobber the graph.
  if (wrapperType !== 'dsl') {
    const sink: WorkflowStepMeta[] = steps.length > 0 ? [] : steps
    getWorkflowInvocations(resolvedFunc, checker, state, workflowName, sink)
  }

  // Actor names the flow's steps run as (scenarios) — powers the console
  // personas view and the Scenario graph badges.
  const actorNames = [
    ...new Set(
      steps
        .map((s) => ('actor' in s ? s.actor : undefined))
        .filter((a): a is string => typeof a === 'string')
    ),
  ]

  state.workflows.meta[workflowName] = {
    pikkuFuncId,
    name: workflowName,
    steps,
    context,
    dsl,
    title,
    summary,
    description,
    errors,
    tags,
    expose,
    scenario: wrapperType === 'scenario' ? true : undefined,
    actors: actorNames.length > 0 ? actorNames : undefined,
  }

  // Scenarios are pure stories of remote RPCs (same rule as client-side CLI
  // renderers): the func may only destructure logger/config — everything else
  // must go through actor steps so the flow runs against the TARGET
  // environment, never local services.
  const funcMeta = state.functions.meta[pikkuFuncId]
  if (wrapperType === 'scenario' && funcMeta?.services) {
    const disallowed = funcMeta.services.services.filter(
      (svc) => svc !== 'logger' && svc !== 'config'
    )
    if (disallowed.length > 0) {
      logger.critical(
        ErrorCode.SCENARIO_HAS_SERVICES,
        `Scenario '${workflowName}' destructures services: ${disallowed.join(', ')}. ` +
          `Scenarios may only use 'logger'/'config' — drive everything else through ` +
          `actor steps (workflow.do(step, rpc, data, { actor: actors.x })) so the flow ` +
          `runs against the target environment.`
      )
      return
    }
  }

  // Workflow functions require platform services that aren't visible
  // through parameter destructuring (they're accessed via workflow.do/sleep)
  if (funcMeta?.services) {
    for (const svc of [
      'workflowService',
      'workflowRunService',
      'schedulerService',
      'queueService',
    ]) {
      if (!funcMeta.services.services.includes(svc)) {
        funcMeta.services.services.push(svc)
      }
    }
  }
}
