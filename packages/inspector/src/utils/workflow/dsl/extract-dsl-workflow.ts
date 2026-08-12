import * as ts from 'typescript'
import type {
  WorkflowStepMeta,
  RpcStepMeta,
  InlineStepMeta,
  BranchStepMeta,
  ParallelGroupStepMeta,
  FanoutStepMeta,
  CancelStepMeta,
  SuspendStepMeta,
  SleepStepMeta,
  ApprovalStepMeta,
  SetStepMeta,
  SwitchStepMeta,
  SwitchCaseMeta,
  FilterStepMeta,
  ArrayPredicateStepMeta,
  ScenarioStepMeta,
  InputSource,
  OutputBinding,
  Condition,
  WorkflowContext,
  ContextVariable,
} from '@pikku/core/workflow'
import {
  isWorkflowDoCall,
  isWorkflowExpectEventuallyCall,
  isScenarioStepCall,
  isScenarioExpectationCall,
  getScenarioStepPhase,
  DYNAMIC_SCENARIO_STEP_TARGET,
  extractActorFromOptions,
  isWorkflowSleepCall,
  isWorkflowSuspendCall,
  isWorkflowApprovalCall,
  isThrowCancelException,
  extractCancelReason,
  isParallelFanout,
  isParallelGroup,
  isSequentialFanout,
  isArrayFilter,
  isArraySome,
  isArrayEvery,
  extractForOfVariable,
  isArrayType,
  getSourceText,
  extractSourcePath,
} from './patterns.js'
import type { ValidationError } from './validation.js'
import {
  validateNoDisallowedPatterns,
  validateAwaitedCalls,
  formatValidationErrors,
} from './validation.js'
import {
  extractStringLiteral,
  extractNumberLiteral,
} from '../../extract-node-value.js'

/**
 * Extraction context to track state during AST traversal
 */
interface ExtractionContext {
  checker: ts.TypeChecker
  outputVars: Map<string, { type: ts.Type; node: ts.Node }>
  arrayVars: Set<string>
  conditionalVars: Set<string>
  inputParamName: string | null
  errors: ValidationError[]
  /** Loop variables in scope (for fanout item variables) */
  loopVars: Set<string>
  /** Context variables (top-level let/const with simple values) */
  contextVars: Map<string, { type: string; default: unknown }>
  /** Track nesting depth to detect block-scoped vars */
  depth: number
}

/**
 * Result of DSL workflow extraction
 */
export interface ExtractionResult {
  status: 'ok' | 'error'
  steps?: WorkflowStepMeta[]
  /** Workflow context (top-level variables) */
  context?: WorkflowContext
  /**
   * The flow asserts something through an expectation helper rather than a
   * `then` step. Recorded separately because those helpers are inline steps and
   * leave no phase behind, so PKU680 has no other way to see them.
   */
  asserts?: boolean
  reason?: string
}

/**
 * A function the walk must not step into, because nothing here says it runs.
 *
 * A callback handed straight to a call — a fanout's `map`, an inline
 * `workflow.do` step — executes as part of the body and counts. A function that
 * is merely *declared* or assigned to a name does not: an assertion parked in an
 * unused helper asserts nothing, and counting it would let a scenario silence
 * PKU680 with dead code.
 */
function isUncalledFunction(node: ts.Node): boolean {
  if (
    !ts.isFunctionDeclaration(node) &&
    !ts.isFunctionExpression(node) &&
    !ts.isArrowFunction(node)
  ) {
    return false
  }
  if (ts.isFunctionDeclaration(node)) return true
  const parent = node.parent
  return !(
    parent &&
    ts.isCallExpression(parent) &&
    parent.arguments.some((argument) => argument === node)
  )
}

/**
 * Whether the body calls one of the expectation helpers anywhere it runs.
 *
 * A whole-body walk rather than a check inside step extraction: the helpers
 * produce no step of their own, so there is no extraction result to hang the
 * answer off, and one nested inside a branch asserts just as much as one at the
 * top level.
 */
function hasScenarioExpectation(body: ts.Node): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && isScenarioExpectationCall(node)) {
      found = true
      return
    }
    if (node !== body && isUncalledFunction(node)) return
    ts.forEachChild(node, visit)
  }
  visit(body)
  return found
}

/**
 * Extract DSL workflow metadata from a function declaration
 */
export function extractDSLWorkflow(
  funcNode: ts.Node,
  checker: ts.TypeChecker,
  options?: { allowInline?: boolean }
): ExtractionResult {
  try {
    // Find the async arrow function
    const arrowFunc = findWorkflowFunction(funcNode)
    if (!arrowFunc) {
      return {
        status: 'error',
        reason: 'Could not find async arrow function in workflow definition',
      }
    }

    // Extract input parameter name (second parameter)
    const inputParamName = extractInputParamName(arrowFunc)
    if (inputParamName === undefined) {
      return {
        status: 'error',
        reason: 'Could not determine input parameter name',
      }
    }

    // Initialize extraction context
    const context: ExtractionContext = {
      checker,
      outputVars: new Map(),
      arrayVars: new Set(),
      conditionalVars: new Set(),
      inputParamName,
      errors: [],
      loopVars: new Set(),
      contextVars: new Map(),
      depth: 0,
    }

    // Validate no disallowed patterns
    const patternErrors = validateNoDisallowedPatterns(arrowFunc.body, {
      allowInline: options?.allowInline,
    })
    if (patternErrors.length > 0) {
      return {
        status: 'error',
        reason: formatValidationErrors(patternErrors),
      }
    }

    // Validate all workflow calls are awaited
    const awaitErrors = validateAwaitedCalls(arrowFunc.body)
    if (awaitErrors.length > 0) {
      return {
        status: 'error',
        reason: formatValidationErrors(awaitErrors),
      }
    }

    // Extract steps from function body
    const steps = extractSteps(arrowFunc.body, context)

    // Check for any accumulated errors
    if (context.errors.length > 0) {
      return {
        status: 'error',
        reason: formatValidationErrors(context.errors),
      }
    }

    // Build workflow context from extracted context variables
    const workflowContext: WorkflowContext = {}
    for (const [name, info] of context.contextVars) {
      workflowContext[name] = {
        type: info.type as ContextVariable['type'],
        default: info.default,
      }
    }

    return {
      status: 'ok',
      steps,
      context:
        Object.keys(workflowContext).length > 0 ? workflowContext : undefined,
      asserts: hasScenarioExpectation(arrowFunc.body) || undefined,
    }
  } catch (error) {
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Find the workflow function (async arrow function)
 */
function findWorkflowFunction(node: ts.Node): ts.ArrowFunction | null {
  // Handle pikkuWorkflowFunc(async () => {}) or pikkuWorkflowComplexFunc(async () => {})
  if (ts.isCallExpression(node)) {
    const arg = node.arguments[0]
    if (arg && ts.isArrowFunction(arg)) {
      return arg
    }
    // Also check if first argument is an object with func property
    if (arg && ts.isObjectLiteralExpression(arg)) {
      for (const prop of arg.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === 'func'
        ) {
          if (ts.isArrowFunction(prop.initializer)) {
            return prop.initializer
          }
        }
      }
    }
  }

  // Handle pikkuWorkflowFunc({ func: async () => {} })
  if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (
        ts.isPropertyAssignment(prop) &&
        ts.isIdentifier(prop.name) &&
        prop.name.text === 'func'
      ) {
        if (ts.isArrowFunction(prop.initializer)) {
          return prop.initializer
        }
      }
    }
  }

  return null
}

/**
 * Extract the input parameter name from the arrow function.
 *
 * Returns `null` when no input parameter is declared at all. That is
 * legitimate — a workflow may ignore its input — and nothing in the body can
 * reference it, so every name comparison against `null` correctly fails.
 * Returns `undefined` when an input parameter is declared but is not a plain
 * identifier (destructured), which the extractor cannot track by name.
 */
function extractInputParamName(
  arrowFunc: ts.ArrowFunction
): string | null | undefined {
  if (arrowFunc.parameters.length < 2) {
    return null
  }

  const secondParam = arrowFunc.parameters[1]
  if (ts.isIdentifier(secondParam.name)) {
    return secondParam.name.text
  }

  return undefined
}

/**
 * Extract steps from the function body
 */
function extractSteps(
  body: ts.Node,
  context: ExtractionContext,
  incrementDepth = false
): WorkflowStepMeta[] {
  const steps: WorkflowStepMeta[] = []

  if (!ts.isBlock(body)) {
    return steps
  }

  // Increment depth when entering a nested block
  if (incrementDepth) {
    context.depth++
  }

  for (const statement of body.statements) {
    const extracted = extractStep(statement, context)
    if (extracted) {
      steps.push(extracted)
    }
  }

  // Restore depth
  if (incrementDepth) {
    context.depth--
  }

  return steps
}

/**
 * Extract a single step from a statement
 */
function extractStep(
  statement: ts.Statement,
  context: ExtractionContext
): WorkflowStepMeta | null {
  // Variable declaration with workflow.do assignment
  if (ts.isVariableStatement(statement)) {
    return extractVariableDeclaration(statement, context)
  }

  // Expression statement (await workflow.do without assignment)
  if (ts.isExpressionStatement(statement)) {
    return extractExpressionStatement(statement, context)
  }

  // If statement (branch)
  if (ts.isIfStatement(statement)) {
    return extractBranch(statement, context)
  }

  // Switch statement
  if (ts.isSwitchStatement(statement)) {
    return extractSwitch(statement, context)
  }

  // For-of statement (sequential fanout)
  if (ts.isForOfStatement(statement)) {
    const reason: { message?: string } = {}
    const fanout = extractSequentialFanout(statement, context, reason)
    if (!fanout && containsWorkflowCall(statement.statement, context.checker)) {
      // A for-of the DSL can't model as a sequential fanout (its iterable is not
      // a data-array identifier/field — e.g. a counting loop
      // `for (const i of [...Array(N).keys()])`). Silently returning null here
      // used to drop the loop AND every `workflow.do` inside it, so the workflow
      // serialized with zero steps and its step functions were never registered
      // (→ runtime "Function not found"). Fail loudly instead: pikkuWorkflowFunc
      // reports INVALID_DSL_WORKFLOW; pikkuWorkflowComplexFunc falls back to the
      // basic AST walk (which DOES register loop-invoked functions), so a genuine
      // control-flow loop belongs in a complex workflow.
      //
      // Guarded on the body actually containing a workflow call: a loop that only
      // massages locals (building a lookup, summing a total) has no step to lose,
      // and erroring on it would be a false positive — the whole hazard is a
      // dropped `workflow.do`, not a dropped `for`.
      context.errors.push({
        message:
          `The for-of loop '${statement.getText().slice(0, 60)}' can't be expressed in a DSL workflow — ` +
          (reason.message ??
            `its iterable must be a data array (an identifier or field like 'data.items'), not a computed/inline ` +
              `iterable such as '[...Array(n).keys()]'. Use pikkuWorkflowComplexFunc for a control-flow/counting loop, ` +
              `or iterate over a real input array.`),
        node: statement,
      })
    }
    return fanout
  }

  // Return statement
  if (ts.isReturnStatement(statement)) {
    return extractReturn(statement, context)
  }

  // Throw statement (for WorkflowCancelledException)
  if (ts.isThrowStatement(statement)) {
    return extractThrowCancel(statement, context)
  }

  return null
}

/**
 * Extract variable declaration (const x = await workflow.do(...))
 */
function extractVariableDeclaration(
  statement: ts.VariableStatement,
  context: ExtractionContext
): WorkflowStepMeta | null {
  const declList = statement.declarationList
  if (declList.declarations.length !== 1) {
    context.errors.push({
      message: `A single declaration statement may only declare one variable in DSL workflows. Split '${statement.getText().slice(0, 60)}' into separate statements.`,
      node: statement,
    })
    return null
  }

  const decl = declList.declarations[0]
  if (!ts.isIdentifier(decl.name)) {
    return extractDestructuredDeclaration(statement, decl, context)
  }

  const varName = decl.name.text
  const init = decl.initializer

  // Check for block-scoped variable declarations (not allowed)
  if (context.depth > 0) {
    context.errors.push({
      message: `Variable declaration '${varName}' inside block is not supported in DSL workflows. Move all let/const declarations to the top level.`,
      node: statement,
    })
    return null
  }

  if (!init) {
    return null
  }

  // Check for simple literal/expression context variable (let x = 'value')
  const literalValue = extractLiteralValue(init)
  if (literalValue !== undefined) {
    const tsType = context.checker.getTypeAtLocation(decl)
    const typeStr = inferSimpleType(tsType, context.checker)
    context.contextVars.set(varName, { type: typeStr, default: literalValue })
    return null // No step emitted, just register the context var
  }

  // Check for await workflow.do(...)
  if (ts.isAwaitExpression(init) && ts.isCallExpression(init.expression)) {
    const call = init.expression
    if (isWorkflowDoCall(call, context.checker) || isScenarioStepCall(call)) {
      const step = isScenarioStepCall(call)
        ? extractScenarioStep(call, context, varName)
        : isInlineDoCall(call)
          ? extractInlineStep(call, context)
          : extractRpcStep(call, context, varName)
      if (step) {
        // Track output variable
        const type = context.checker.getTypeAtLocation(decl)
        context.outputVars.set(varName, { type, node: decl })

        // Check if it's an array type
        if (isArrayType(type, context.checker)) {
          context.arrayVars.add(varName)
        }

        // Check if it's a conditional variable (let x: T | undefined)
        if (declList.flags & ts.NodeFlags.Let) {
          const typeNode = decl.type
          if (typeNode && ts.isUnionTypeNode(typeNode)) {
            // Check if union includes undefined
            const hasUndefined = typeNode.types.some(
              (t) =>
                (ts.isLiteralTypeNode(t) &&
                  t.literal.kind === ts.SyntaxKind.UndefinedKeyword) ||
                t.kind === ts.SyntaxKind.UndefinedKeyword
            )
            if (hasUndefined) {
              context.conditionalVars.add(varName)
            }
          }
        }

        return step
      }
    }

    // Promise.all fanout/group captured into a variable
    // (const results = await Promise.all(array.map(...)))
    if (isParallelFanout(call) || isParallelGroup(call)) {
      const step = isParallelFanout(call)
        ? extractParallelFanout(call, context)
        : extractParallelGroup(call, context)
      if (step) {
        const type = context.checker.getTypeAtLocation(decl)
        context.outputVars.set(varName, { type, node: decl })
        if (isArrayType(type, context.checker)) {
          context.arrayVars.add(varName)
        }
        return step
      }
    }
  }

  // Check for array.filter(...)
  if (ts.isCallExpression(init)) {
    if (isArrayFilter(init)) {
      const filterStep = extractArrayFilter(init, context, varName)
      if (filterStep) {
        const type = context.checker.getTypeAtLocation(decl)
        context.outputVars.set(varName, { type, node: decl })
        if (isArrayType(type, context.checker)) {
          context.arrayVars.add(varName)
        }
        return filterStep
      }
    }

    if (isArraySome(init) || isArrayEvery(init)) {
      const predicateStep = extractArrayPredicate(init, context, varName)
      if (predicateStep) {
        const type = context.checker.getTypeAtLocation(decl)
        context.outputVars.set(varName, { type, node: decl })
        return predicateStep
      }
    }
  }

  return null
}

/**
 * Extract a declaration whose binding is a destructuring pattern.
 *
 * `const [a, b] = await Promise.all([...])` is the idiomatic way to run steps
 * in parallel and keep both results, so each element of the pattern is bound to
 * the matching child step's output. Every other destructuring OF A STEP reports a
 * diagnostic rather than silently dropping the step.
 *
 * A destructure whose initializer is NOT a step is just an ordinary local binding
 * — `const { runId } = input`, `const { a } = someObject` — and has nothing to do
 * with step results. Those pass through as non-steps, exactly as the identifier
 * path already does for `const x = someLocal`. Reporting them was rejecting the
 * single most idiomatic line in a DSL workflow (destructuring the workflow's own
 * input), under a message about step results that named nothing the author wrote.
 */
function extractDestructuredDeclaration(
  statement: ts.VariableStatement,
  decl: ts.VariableDeclaration,
  context: ExtractionContext
): WorkflowStepMeta | null {
  const init = decl.initializer

  if (
    init &&
    ts.isAwaitExpression(init) &&
    ts.isCallExpression(init.expression) &&
    isParallelGroup(init.expression) &&
    ts.isArrayBindingPattern(decl.name)
  ) {
    const elements = decl.name.elements
    const allSimple = elements.every(
      (el) =>
        ts.isBindingElement(el) &&
        ts.isIdentifier(el.name) &&
        !el.dotDotDotToken
    )

    if (allSimple) {
      const step = extractParallelGroup(init.expression, context)
      if (step) {
        if (elements.length !== step.children.length) {
          context.errors.push({
            message: `Destructuring binds ${elements.length} name(s) but Promise.all has ${step.children.length} step(s). They must match so each result can be bound to its step.`,
            node: statement,
          })
          return null
        }

        elements.forEach((el, i) => {
          const name = (el as ts.BindingElement).name as ts.Identifier
          const varName = name.text
          step.children[i].outputVar = varName
          const type = context.checker.getTypeAtLocation(name)
          context.outputVars.set(varName, { type, node: name })
          if (isArrayType(type, context.checker)) {
            context.arrayVars.add(varName)
          }
        })

        return step
      }
    }
  }

  // Only a destructure OF A STEP is an error. Anything else is a plain local
  // binding the DSL simply doesn't model as a step.
  const stepCall =
    init && ts.isAwaitExpression(init) && ts.isCallExpression(init.expression)
      ? init.expression
      : null
  const destructuresAStep =
    stepCall !== null &&
    (isWorkflowDoCall(stepCall, context.checker) ||
      isScenarioStepCall(stepCall) ||
      isParallelGroup(stepCall) ||
      isParallelFanout(stepCall))
  if (!destructuresAStep) return null

  context.errors.push({
    message: `Destructuring a step result is not supported in DSL workflows. Assign it to a variable first (e.g. \`const result = await workflow.do(...)\`) and read its properties.`,
    node: statement,
  })
  return null
}

/**
 * Extract expression statement (await workflow.do(...) without assignment)
 */
function extractExpressionStatement(
  statement: ts.ExpressionStatement,
  context: ExtractionContext
): WorkflowStepMeta | null {
  let expr = statement.expression

  // Handle assignment: x = value or x = await workflow.do(...)
  let outputVar: string | undefined
  if (
    ts.isBinaryExpression(expr) &&
    expr.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    // Extract variable name from left side
    if (ts.isIdentifier(expr.left)) {
      outputVar = expr.left.text

      // Check if this is an assignment to a context variable (set step)
      // But if the RHS is a workflow.do() call, fall through to RPC extraction —
      // reassigning a pre-declared variable with a workflow step is valid and common.
      if (context.contextVars.has(outputVar)) {
        const rhs = expr.right
        const rhsCall =
          ts.isAwaitExpression(rhs) && ts.isCallExpression(rhs.expression)
            ? rhs.expression
            : null
        const isWorkflowCall = rhsCall
          ? isWorkflowDoCall(rhsCall, context.checker)
          : false

        if (!isWorkflowCall) {
          const literalValue = extractLiteralValue(expr.right)
          if (literalValue !== undefined) {
            return {
              type: 'set',
              variable: outputVar,
              value: literalValue,
            } as SetStepMeta
          }
          // Non-literal assignment to context var - keep the source expression
          return {
            type: 'set',
            variable: outputVar,
            expression: getSourceText(expr.right),
          } as SetStepMeta
        }
      }
    }
    // Use right side as the expression to extract from
    expr = expr.right
  }

  // await workflow.do(...)
  if (ts.isAwaitExpression(expr) && ts.isCallExpression(expr.expression)) {
    const call = expr.expression

    if (isWorkflowDoCall(call, context.checker) || isScenarioStepCall(call)) {
      const step = isScenarioStepCall(call)
        ? extractScenarioStep(call, context, outputVar)
        : isInlineDoCall(call)
          ? extractInlineStep(call, context)
          : extractRpcStep(call, context, outputVar)

      // Track output variable if this is an assignment
      if (outputVar && step) {
        const type = context.checker.getTypeAtLocation(expr)
        context.outputVars.set(outputVar, { type, node: expr })

        // Check if it's an array type
        if (isArrayType(type, context.checker)) {
          context.arrayVars.add(outputVar)
        }
      }

      return step
    }

    if (isWorkflowSleepCall(call, context.checker)) {
      return extractSleepStep(call, context)
    }

    if (isWorkflowSuspendCall(call, context.checker)) {
      return extractSuspendStep(call, context)
    }

    if (isWorkflowApprovalCall(call, context.checker)) {
      const step = extractApprovalStep(call, context, outputVar)

      // Unlike suspend, an approval yields a value, so a downstream step can
      // reference it — track the binding the same way workflow.do() does.
      if (outputVar && step) {
        const type = context.checker.getTypeAtLocation(expr)
        context.outputVars.set(outputVar, { type, node: expr })
        if (isArrayType(type, context.checker)) {
          context.arrayVars.add(outputVar)
        }
      }

      return step
    }

    // Check for parallel group or fanout
    if (isParallelFanout(call)) {
      return extractParallelFanout(call, context)
    }

    if (isParallelGroup(call)) {
      return extractParallelGroup(call, context)
    }
  }

  return null
}

/**
 * Extract RPC step from workflow.do() call
 */
function extractRpcStep(
  call: ts.CallExpression,
  context: ExtractionContext,
  outputVar?: string
): RpcStepMeta | null {
  const args = call.arguments

  if (args.length < 2) {
    return null
  }

  try {
    const stepName = extractStringLiteral(args[0], context.checker)
    const rpcName = extractStringLiteral(args[1], context.checker)

    // Extract inputs from third argument
    const inputs =
      args.length >= 3 ? extractInputSources(args[2], context) : undefined

    // do(step, rpc, data, options?) vs expectEventually(step, rpc, data, predicate, options?)
    const expectEventually = isWorkflowExpectEventuallyCall(call)
    const optionsIndex = expectEventually ? 4 : 3
    const optionsArg =
      args.length > optionsIndex ? args[optionsIndex] : undefined

    const options =
      optionsArg && ts.isObjectLiteralExpression(optionsArg)
        ? extractStepOptions(optionsArg, context)
        : undefined

    return {
      type: 'rpc',
      stepName,
      rpcName,
      outputVar,
      inputs,
      options,
      actor: extractActorFromOptions(optionsArg),
      expectEventually: expectEventually || undefined,
    }
  } catch (error) {
    context.errors.push({
      message: `Failed to extract RPC step: ${error instanceof Error ? error.message : String(error)}`,
      node: call,
    })
    return null
  }
}

/**
 * Extract a scenario step from scenario.step/given/when/then(stepName,
 * stepFunc, data?, options?).
 *
 * The step target must be a static string literal so it can be bundled, typed
 * and drawn. When it isn't, the step is still recorded — with a `<dynamic>`
 * target — so post-processing can raise PKU678 rather than the call silently
 * vanishing from the graph.
 */
function extractScenarioStep(
  call: ts.CallExpression,
  context: ExtractionContext,
  outputVar?: string
): ScenarioStepMeta | null {
  const phase = getScenarioStepPhase(call)
  if (!phase) {
    return null
  }

  const args = call.arguments
  if (args.length < 2) {
    return null
  }

  try {
    const stepName = extractStringLiteral(args[0], context.checker)

    let stepFunc = DYNAMIC_SCENARIO_STEP_TARGET
    try {
      stepFunc = extractStringLiteral(args[1], context.checker)
    } catch {
      // Left as '<dynamic>' — validated in post-processing (PKU678).
    }

    const inputs =
      args.length >= 3 ? extractInputSources(args[2], context) : undefined

    const optionsArg = args.length >= 4 ? args[3] : undefined
    const options =
      optionsArg && ts.isObjectLiteralExpression(optionsArg)
        ? extractStepOptions(optionsArg, context)
        : undefined

    return {
      type: 'scenarioStep',
      stepName,
      stepFunc,
      phase,
      outputVar,
      inputs,
      options,
      actor: extractActorFromOptions(optionsArg),
    }
  } catch (error) {
    context.errors.push({
      message: `Failed to extract scenario step: ${error instanceof Error ? error.message : String(error)}`,
      node: call,
    })
    return null
  }
}

/**
 * Extract inline step from workflow.do() call with a function argument
 */
function extractInlineStep(
  call: ts.CallExpression,
  context: ExtractionContext
): InlineStepMeta | null {
  const args = call.arguments
  if (args.length < 2) return null

  try {
    const stepName = extractStringLiteral(args[0], context.checker)
    const optionsArg = args.length >= 3 ? args[args.length - 1] : undefined
    const options =
      optionsArg && ts.isObjectLiteralExpression(optionsArg)
        ? extractStepOptions(optionsArg, context)
        : undefined

    return {
      type: 'inline',
      stepName,
      options,
    }
  } catch (error) {
    context.errors.push({
      message: `Failed to extract inline step: ${error instanceof Error ? error.message : String(error)}`,
      node: call,
    })
    return null
  }
}

/**
 * Check if the second argument of a workflow.do() call is a function
 */
function isInlineDoCall(call: ts.CallExpression): boolean {
  const secondArg = call.arguments[1]
  return (
    !!secondArg &&
    (ts.isArrowFunction(secondArg) || ts.isFunctionExpression(secondArg))
  )
}

/**
 * Extract step options from options object
 */
function extractStepOptions(
  optionsNode: ts.ObjectLiteralExpression,
  context: ExtractionContext
): RpcStepMeta['options'] {
  const options: RpcStepMeta['options'] = {}

  for (const prop of optionsNode.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
      const propName = prop.name.text

      if (propName === 'retries') {
        const retries = extractNumberLiteral(prop.initializer)
        if (retries !== null) {
          options.retries = retries
        }
      } else if (propName === 'retryDelay') {
        try {
          if (ts.isStringLiteral(prop.initializer)) {
            options.retryDelay = prop.initializer.text
          } else {
            const delay = extractNumberLiteral(prop.initializer)
            if (delay !== null) {
              options.retryDelay = delay
            }
          }
        } catch {
          // Ignore extraction errors for retryDelay
        }
      } else if (propName === 'onError') {
        if (ts.isStringLiteral(prop.initializer)) {
          options.onError = prop.initializer.text
        } else {
          context.errors.push({
            message:
              'onError must be a literal RPC name so it can be wired and drawn in the graph.',
            node: prop.initializer,
          })
        }
      } else if (propName === 'description') {
        try {
          options.description = extractStringLiteral(
            prop.initializer,
            context.checker
          )
        } catch {
          // Ignore extraction errors for description
        }
      }
    }
  }

  return Object.keys(options).length > 0 ? options : undefined
}

/**
 * Extract sleep step from workflow.sleep() call
 */
function extractSleepStep(
  call: ts.CallExpression,
  context: ExtractionContext
): WorkflowStepMeta | null {
  const args = call.arguments

  if (args.length < 2) {
    return null
  }

  try {
    const stepName = extractStringLiteral(args[0], context.checker)
    let duration: string | number

    const numValue = extractNumberLiteral(args[1])
    if (numValue !== null) {
      duration = numValue
    } else {
      try {
        duration = extractStringLiteral(args[1], context.checker)
      } catch {
        // A duration computed at runtime (a loop variable, a field off the
        // input) is legal: the closure evaluates it. Record the source text so
        // the graph can show what it waits on, rather than failing the workflow.
        return {
          type: 'sleep',
          stepName,
          duration: '',
          expression: args[1].getText(),
        }
      }
    }

    return {
      type: 'sleep',
      stepName,
      duration,
    }
  } catch (error) {
    context.errors.push({
      message: `Failed to extract sleep step: ${error instanceof Error ? error.message : String(error)}`,
      node: call,
    })
    return null
  }
}

/**
 * Extract suspend step from workflow.suspend() call
 */
function extractSuspendStep(
  call: ts.CallExpression,
  context: ExtractionContext
): SuspendStepMeta | null {
  const args = call.arguments
  if (args.length < 1) return null

  try {
    const reason = extractStringLiteral(args[0], context.checker)
    return {
      type: 'suspend',
      reason,
    }
  } catch (error) {
    context.errors.push({
      message: `Failed to extract suspend step: ${error instanceof Error ? error.message : String(error)}`,
      node: call,
    })
    return null
  }
}

/**
 * Extract approval step from workflow.approval() call
 */
function extractApprovalStep(
  call: ts.CallExpression,
  context: ExtractionContext,
  outputVar?: string
): ApprovalStepMeta | null {
  const args = call.arguments
  if (args.length < 1) return null

  try {
    const reason = extractStringLiteral(args[0], context.checker)
    const step: ApprovalStepMeta = {
      type: 'approval',
      reason,
    }
    if (outputVar) {
      step.outputVar = outputVar
    }
    // The `schema` option is a runtime value validated inside the workflow body,
    // so it is deliberately not serialized here — only the literal options the
    // graph and planned-step ladder need in order to describe the gate.
    const options = args[1]
    if (options && ts.isObjectLiteralExpression(options)) {
      for (const prop of options.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const name = prop.name.getText()
        if (
          name === 'expiry' &&
          (ts.isStringLiteral(prop.initializer) ||
            ts.isNumericLiteral(prop.initializer))
        ) {
          step.expiry = ts.isNumericLiteral(prop.initializer)
            ? Number(prop.initializer.text)
            : prop.initializer.text
        }
        if (name === 'approvers' && ts.isStringLiteral(prop.initializer)) {
          step.approvers = prop.initializer
            .text as ApprovalStepMeta['approvers']
        }
        if (name === 'approverScope' && ts.isStringLiteral(prop.initializer)) {
          step.approverScope = prop.initializer.text
        }
      }
    }
    return step
  } catch (error) {
    context.errors.push({
      message: `Failed to extract approval step: ${error instanceof Error ? error.message : String(error)}`,
      node: call,
    })
    return null
  }
}

/**
 * Extract cancel step from throw WorkflowCancelledException statement
 */
function extractThrowCancel(
  statement: ts.ThrowStatement,
  context: ExtractionContext
): CancelStepMeta | null {
  if (!isThrowCancelException(statement)) {
    return null
  }

  const reason = extractCancelReason(statement, context.checker)
  return {
    type: 'cancel',
    reason,
  }
}

/**
 * Parse a condition expression into a Condition structure
 */
function parseCondition(expr: ts.Expression): Condition {
  // Handle binary expressions (&&, ||)
  if (ts.isBinaryExpression(expr)) {
    const operator = expr.operatorToken.kind

    // AND operator (&&)
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
      return {
        type: 'and',
        conditions: [parseCondition(expr.left), parseCondition(expr.right)],
      }
    }

    // OR operator (||)
    if (operator === ts.SyntaxKind.BarBarToken) {
      return {
        type: 'or',
        conditions: [parseCondition(expr.left), parseCondition(expr.right)],
      }
    }
  }

  // Handle parenthesized expressions - unwrap and parse inner
  if (ts.isParenthesizedExpression(expr)) {
    return parseCondition(expr.expression)
  }

  // Simple condition (comparison, function call, variable, etc.)
  return {
    type: 'simple',
    expression: getSourceText(expr),
  }
}

/**
 * Extract branch step from if statement (supports if/else-if/else chains)
 */
function extractBranch(
  statement: ts.IfStatement,
  context: ExtractionContext
): BranchStepMeta | null {
  const branches: BranchStepMeta['branches'] = []
  let elseSteps: BranchStepMeta['elseSteps']

  // Walk the if/else-if chain
  let current: ts.IfStatement | undefined = statement
  while (current) {
    const condition = parseCondition(current.expression)
    const steps = ts.isBlock(current.thenStatement)
      ? extractSteps(current.thenStatement, context, true)
      : extractStepsFromStatement(current.thenStatement, context)

    branches.push({ condition, steps })

    // Check for else-if or else
    if (current.elseStatement) {
      if (ts.isIfStatement(current.elseStatement)) {
        // else-if: continue the chain
        current = current.elseStatement
      } else {
        // else: extract the final else block and stop
        elseSteps = ts.isBlock(current.elseStatement)
          ? extractSteps(current.elseStatement, context, true)
          : extractStepsFromStatement(current.elseStatement, context)
        current = undefined
      }
    } else {
      // No else clause
      current = undefined
    }
  }

  return {
    type: 'branch',
    branches,
    elseSteps,
  }
}

/**
 * Extract steps from a single statement (non-block)
 */
function extractStepsFromStatement(
  statement: ts.Statement,
  context: ExtractionContext
): WorkflowStepMeta[] {
  // Increment depth for single-statement blocks (if without braces)
  context.depth++
  const step = extractStep(statement, context)
  context.depth--
  return step ? [step] : []
}

/**
 * Extract switch statement
 */
function extractSwitch(
  statement: ts.SwitchStatement,
  context: ExtractionContext
): SwitchStepMeta | null {
  const expression = getSourceText(statement.expression)
  const cases: SwitchCaseMeta[] = []
  let defaultSteps: WorkflowStepMeta[] | undefined

  for (const clause of statement.caseBlock.clauses) {
    if (ts.isCaseClause(clause)) {
      const caseValue = extractCaseValue(clause.expression)
      const steps = extractCaseSteps(clause.statements, context)

      cases.push({
        value: caseValue.value,
        expression: caseValue.expression,
        steps,
      })
    } else if (ts.isDefaultClause(clause)) {
      defaultSteps = extractCaseSteps(clause.statements, context)
    }
  }

  return {
    type: 'switch',
    expression,
    cases,
    defaultSteps,
  }
}

/**
 * Extract case value from expression
 */
function extractCaseValue(expr: ts.Expression): {
  value?: string | number | boolean | null
  expression?: string
} {
  if (ts.isStringLiteral(expr)) {
    return { value: expr.text }
  }
  if (ts.isNumericLiteral(expr)) {
    return { value: Number(expr.text) }
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    return { value: true }
  }
  if (expr.kind === ts.SyntaxKind.FalseKeyword) {
    return { value: false }
  }
  if (expr.kind === ts.SyntaxKind.NullKeyword) {
    return { value: null }
  }

  return { expression: getSourceText(expr) }
}

/**
 * Extract steps from case statements, stopping at break
 */
function extractCaseSteps(
  statements: ts.NodeArray<ts.Statement>,
  context: ExtractionContext
): WorkflowStepMeta[] {
  const steps: WorkflowStepMeta[] = []

  // Increment depth for case blocks
  context.depth++

  for (const statement of statements) {
    if (ts.isBreakStatement(statement)) {
      break
    }

    const step = extractStep(statement, context)
    if (step) {
      steps.push(step)
    }
  }

  // Restore depth
  context.depth--

  return steps
}

/**
 * Extract array filter operation
 */
function extractArrayFilter(
  call: ts.CallExpression,
  context: ExtractionContext,
  outputVar?: string
): FilterStepMeta | null {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return null
  }

  const sourceExpr = call.expression.expression
  const sourceVar = extractSourcePath(sourceExpr)

  if (!sourceVar) {
    return null
  }

  const filterFn = call.arguments[0]
  if (!filterFn || !ts.isArrowFunction(filterFn)) {
    return null
  }

  const itemParam = filterFn.parameters[0]
  if (!itemParam || !ts.isIdentifier(itemParam.name)) {
    return null
  }

  const itemVar = itemParam.name.text

  let condition: Condition
  if (ts.isBlock(filterFn.body)) {
    return null
  } else {
    condition = parseCondition(filterFn.body)
  }

  return {
    type: 'filter',
    sourceVar,
    itemVar,
    condition,
    outputVar,
  }
}

/**
 * Extract array predicate operation (some/every)
 */
function extractArrayPredicate(
  call: ts.CallExpression,
  context: ExtractionContext,
  outputVar?: string
): ArrayPredicateStepMeta | null {
  if (!ts.isPropertyAccessExpression(call.expression)) {
    return null
  }

  const mode = call.expression.name.text as 'some' | 'every'
  const sourceExpr = call.expression.expression
  const sourceVar = extractSourcePath(sourceExpr)

  if (!sourceVar) {
    return null
  }

  const predicateFn = call.arguments[0]
  if (!predicateFn || !ts.isArrowFunction(predicateFn)) {
    return null
  }

  const itemParam = predicateFn.parameters[0]
  if (!itemParam || !ts.isIdentifier(itemParam.name)) {
    return null
  }

  const itemVar = itemParam.name.text

  let condition: Condition
  if (ts.isBlock(predicateFn.body)) {
    return null
  } else {
    condition = parseCondition(predicateFn.body)
  }

  return {
    type: 'arrayPredicate',
    mode,
    sourceVar,
    itemVar,
    condition,
    outputVar,
  }
}

/**
 * Extract an ordered list of workflow.do steps from a per-iteration body.
 *
 * Unlike if/switch blocks, a fanout body is a real per-iteration scope, so
 * `const x = await workflow.do(...)` is meaningful here: the binding is
 * registered on the child context so later steps in the same iteration can
 * reference it.
 */
function extractFanoutBodyStep(
  stmt: ts.Statement,
  childContext: ExtractionContext,
  body: Array<RpcStepMeta | SleepStepMeta | SuspendStepMeta | ScenarioStepMeta>
): void {
  if (ts.isVariableStatement(stmt)) {
    const declList = stmt.declarationList
    if (declList.declarations.length !== 1) {
      return
    }
    const decl = declList.declarations[0]
    const init = decl.initializer
    if (
      !init ||
      !ts.isAwaitExpression(init) ||
      !ts.isCallExpression(init.expression)
    ) {
      return
    }
    const call = init.expression
    if (
      !isWorkflowDoCall(call, childContext.checker) &&
      !isScenarioStepCall(call)
    ) {
      return
    }
    const varName = ts.isIdentifier(decl.name) ? decl.name.text : undefined
    const step = isScenarioStepCall(call)
      ? extractScenarioStep(call, childContext, varName)
      : extractRpcStep(call, childContext, varName)
    if (!step) {
      return
    }
    if (varName) {
      const type = childContext.checker.getTypeAtLocation(decl)
      childContext.outputVars.set(varName, { type, node: decl })
      if (isArrayType(type, childContext.checker)) {
        childContext.arrayVars.add(varName)
      }
    }
    body.push(step)
    return
  }

  if (ts.isExpressionStatement(stmt) || ts.isReturnStatement(stmt)) {
    const expr = ts.isReturnStatement(stmt) ? stmt.expression : stmt.expression
    if (!expr) {
      return
    }
    const call = ts.isAwaitExpression(expr)
      ? ts.isCallExpression(expr.expression)
        ? expr.expression
        : null
      : ts.isCallExpression(expr)
        ? expr
        : null
    if (!call) {
      return
    }
    if (isWorkflowSleepCall(call, childContext.checker)) {
      const sleepStep = extractSleepStep(call, childContext)
      if (sleepStep && sleepStep.type === 'sleep') {
        body.push(sleepStep)
      }
      return
    }
    if (isWorkflowSuspendCall(call, childContext.checker)) {
      const suspendStep = extractSuspendStep(call, childContext)
      if (suspendStep && suspendStep.type === 'suspend') {
        body.push(suspendStep)
      }
      return
    }
    if (isScenarioStepCall(call)) {
      const scenarioStep = extractScenarioStep(call, childContext)
      if (scenarioStep) {
        body.push(scenarioStep)
      }
      return
    }
    if (!isWorkflowDoCall(call, childContext.checker)) {
      return
    }
    const step = extractRpcStep(call, childContext)
    if (step) {
      body.push(step)
    }
  }
}

/**
 * Extract parallel fanout from Promise.all(array.map(...))
 */
function extractParallelFanout(
  call: ts.CallExpression,
  context: ExtractionContext
): FanoutStepMeta | null {
  const mapCall = call.arguments[0]
  if (!ts.isCallExpression(mapCall)) {
    return null
  }

  if (!ts.isPropertyAccessExpression(mapCall.expression)) {
    return null
  }

  // Extract source array
  const sourceExpr = mapCall.expression.expression
  const sourceVar = extractSourcePath(sourceExpr)

  if (!sourceVar) {
    return null
  }

  // Extract map function
  const mapFn = mapCall.arguments[0]
  if (!ts.isArrowFunction(mapFn)) {
    return null
  }

  // Extract item variable
  const itemParam = mapFn.parameters[0]
  if (!itemParam || !ts.isIdentifier(itemParam.name)) {
    return null
  }

  const itemVar = itemParam.name.text

  // Create a temporary context for the child steps with the loop variable
  const childContext: ExtractionContext = {
    ...context,
    outputVars: new Map(context.outputVars),
    arrayVars: new Set(context.arrayVars),
    loopVars: new Set([...context.loopVars, itemVar]),
  }

  const body: FanoutStepMeta['body'] = []

  if (ts.isBlock(mapFn.body)) {
    for (const stmt of mapFn.body.statements) {
      extractFanoutBodyStep(stmt, childContext, body)
    }
  } else {
    // Concise body: (item) => workflow.do(...) / async (item) => await workflow.do(...)
    const expr = mapFn.body
    const doCall = ts.isAwaitExpression(expr)
      ? ts.isCallExpression(expr.expression)
        ? expr.expression
        : null
      : ts.isCallExpression(expr)
        ? expr
        : null

    if (doCall && isScenarioStepCall(doCall)) {
      const step = extractScenarioStep(doCall, childContext)
      if (step) {
        body.push(step)
      }
    } else if (doCall && isWorkflowDoCall(doCall, context.checker)) {
      const step = extractRpcStep(doCall, childContext)
      if (step) {
        body.push(step)
      }
    }
  }

  if (body.length === 0) {
    return null
  }

  return {
    type: 'fanout',
    sourceVar,
    itemVar,
    mode: 'parallel',
    body,
  }
}

/**
 * Extract parallel group from Promise.all([...])
 */
function extractParallelGroup(
  call: ts.CallExpression,
  context: ExtractionContext
): ParallelGroupStepMeta | null {
  const arrayArg = call.arguments[0]
  if (!ts.isArrayLiteralExpression(arrayArg)) {
    return null
  }

  const children: Array<RpcStepMeta | ScenarioStepMeta> = []

  for (const elem of arrayArg.elements) {
    if (!ts.isCallExpression(elem)) {
      continue
    }
    if (isScenarioStepCall(elem)) {
      const step = extractScenarioStep(elem, context)
      if (step) {
        children.push(step)
      }
    } else if (isWorkflowDoCall(elem, context.checker)) {
      const step = extractRpcStep(elem, context)
      if (step) {
        children.push(step)
      }
    }
  }

  if (children.length === 0) {
    return null
  }

  return {
    type: 'parallel',
    children,
  }
}

/**
 * Extract sequential fanout from for-of loop
 */
/**
 * Does this subtree call the workflow wire at all?
 *
 * Used to tell "the DSL can't model this loop, and a step would be silently
 * lost" from "the DSL can't model this loop, and there is nothing in it to
 * lose". Only the first is worth failing a build over.
 */
function containsWorkflowCall(node: ts.Node, checker: ts.TypeChecker): boolean {
  let found = false
  const visit = (child: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(child)) {
      if (
        isWorkflowDoCall(child, checker) ||
        isScenarioStepCall(child) ||
        isWorkflowSleepCall(child, checker) ||
        isWorkflowSuspendCall(child, checker) ||
        isWorkflowApprovalCall(child, checker) ||
        isWorkflowExpectEventuallyCall(child)
      ) {
        found = true
        return
      }
    }
    ts.forEachChild(child, visit)
  }
  visit(node)
  return found
}

function extractSequentialFanout(
  statement: ts.ForOfStatement,
  context: ExtractionContext,
  reason?: { message?: string }
): FanoutStepMeta | null {
  if (!isSequentialFanout(statement)) {
    return null
  }

  const vars = extractForOfVariable(statement)
  if (!vars) {
    return null
  }

  const { itemVar, sourceVar } = vars

  // Extract child steps and optional sleep from the loop body. A brace-less
  // body (`for (const x of xs) await workflow.do(...)`) is a single statement
  // rather than a block, and must still be extracted.
  const bodyStatements = ts.isBlock(statement.statement)
    ? statement.statement.statements
    : [statement.statement]

  const body: FanoutStepMeta['body'] = []
  let timeBetween: string | undefined = undefined

  // Create a child context with the loop variable added
  const childContext: ExtractionContext = {
    ...context,
    outputVars: new Map(context.outputVars),
    arrayVars: new Set(context.arrayVars),
    loopVars: new Set([...context.loopVars, itemVar]),
  }

  for (const stmt of bodyStatements) {
    extractFanoutBodyStep(stmt, childContext, body)

    // Look for workflow.sleep in ExpressionStatement
    if (ts.isExpressionStatement(stmt)) {
      const expr = stmt.expression

      if (ts.isAwaitExpression(expr) && ts.isCallExpression(expr.expression)) {
        const call = expr.expression

        if (isWorkflowSleepCall(call, context.checker)) {
          // Extract duration for timeBetween
          const args = call.arguments
          if (args.length >= 2) {
            try {
              const numValue = extractNumberLiteral(args[1])
              if (numValue !== null) {
                timeBetween = `${numValue}ms`
              } else {
                timeBetween = extractStringLiteral(args[1], context.checker)
              }
            } catch {
              // Ignore extraction errors
            }
          }
        }
      }
    }

    // Look for if statement with sleep
    if (ts.isIfStatement(stmt)) {
      if (ts.isBlock(stmt.thenStatement)) {
        for (const thenStmt of stmt.thenStatement.statements) {
          if (ts.isExpressionStatement(thenStmt)) {
            const expr = thenStmt.expression

            if (
              ts.isAwaitExpression(expr) &&
              ts.isCallExpression(expr.expression)
            ) {
              const call = expr.expression

              if (isWorkflowSleepCall(call, context.checker)) {
                const args = call.arguments
                if (args.length >= 2) {
                  try {
                    const numValue = extractNumberLiteral(args[1])
                    if (numValue !== null) {
                      timeBetween = `${numValue}ms`
                    } else {
                      timeBetween = extractStringLiteral(
                        args[1],
                        context.checker
                      )
                    }
                  } catch {
                    // Ignore extraction errors
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (body.length === 0) {
    // The iterable was fine — the body yielded nothing the DSL can model. The
    // usual cause is a `workflow.do` nested inside an `if`/`switch`, because
    // `FanoutStepMeta['body']` is a flat list of steps with no branch member:
    // the DSL has no way to say "conditionally run this step per item".
    const branching = bodyStatements.some(
      (stmt) => ts.isIfStatement(stmt) || ts.isSwitchStatement(stmt)
    )
    if (reason) {
      reason.message = branching
        ? `its body only calls 'workflow.do' inside an if/switch, and a DSL fanout body is a flat list of steps with no branch member — the DSL cannot express a per-item condition. Use pikkuWorkflowComplexFunc, or lift the condition out of the loop.`
        : `its body contains no 'workflow.do' call the DSL can model. Use pikkuWorkflowComplexFunc for a loop that does other work.`
    }
    return null
  }

  return {
    type: 'fanout',
    sourceVar,
    itemVar,
    mode: 'sequential',
    body,
    timeBetween,
  }
}

/**
 * Extract a single output binding from an expression
 */
function extractOutputBinding(
  expr: ts.Expression,
  context: ExtractionContext
): OutputBinding | null {
  // Check for property access (e.g., org.id, payment.status)
  if (ts.isPropertyAccessExpression(expr)) {
    const objName = ts.isIdentifier(expr.expression)
      ? expr.expression.text
      : null
    const propPath = expr.name.text

    if (objName && context.outputVars.has(objName)) {
      return { from: 'outputVar', name: objName, path: propPath }
    }
    if (objName && context.contextVars.has(objName)) {
      return { from: 'stateVar', name: objName, path: propPath }
    }
    if (objName === context.inputParamName) {
      return { from: 'input', path: propPath }
    }
  }

  // Check for identifier (simple variable reference)
  if (ts.isIdentifier(expr)) {
    const varName = expr.text
    if (context.outputVars.has(varName)) {
      return { from: 'outputVar', name: varName }
    }
    if (context.contextVars.has(varName)) {
      return { from: 'stateVar', name: varName }
    }
    if (varName === context.inputParamName) {
      return { from: 'input', path: varName }
    }
  }

  // Check for literals
  if (ts.isStringLiteral(expr)) {
    return { from: 'literal', value: expr.text }
  }
  if (ts.isNumericLiteral(expr)) {
    return { from: 'literal', value: Number(expr.text) }
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    return { from: 'literal', value: true }
  }
  if (expr.kind === ts.SyntaxKind.FalseKeyword) {
    return { from: 'literal', value: false }
  }
  if (expr.kind === ts.SyntaxKind.NullKeyword) {
    return { from: 'literal', value: null }
  }

  // For any other expression (comparisons, method calls, etc.), capture as expression
  return { from: 'expression', expression: getSourceText(expr) }
}

/**
 * Extract return step
 */
function extractReturn(
  statement: ts.ReturnStatement,
  context: ExtractionContext
): WorkflowStepMeta | null {
  if (!statement.expression) {
    return null
  }

  if (
    ts.isAwaitExpression(statement.expression) &&
    ts.isCallExpression(statement.expression.expression)
  ) {
    const call = statement.expression.expression
    if (isWorkflowDoCall(call, context.checker)) {
      return isInlineDoCall(call)
        ? extractInlineStep(call, context)
        : extractRpcStep(call, context)
    }
    if (isWorkflowSleepCall(call, context.checker)) {
      return extractSleepStep(call, context)
    }
  }

  if (ts.isCallExpression(statement.expression)) {
    const call = statement.expression
    if (isWorkflowDoCall(call, context.checker)) {
      return isInlineDoCall(call)
        ? extractInlineStep(call, context)
        : extractRpcStep(call, context)
    }
    if (isWorkflowSleepCall(call, context.checker)) {
      return extractSleepStep(call, context)
    }
  }

  // `return r` returns every field of r — record it as a spread of one.
  if (ts.isIdentifier(statement.expression)) {
    const varName = statement.expression.text
    if (context.outputVars.has(varName) || context.contextVars.has(varName)) {
      return { type: 'return', outputs: {}, spread: [varName] }
    }
    return null
  }

  if (!ts.isObjectLiteralExpression(statement.expression)) {
    return null
  }

  const outputs: Record<string, OutputBinding> = {}
  const spread: string[] = []

  for (const prop of statement.expression.properties) {
    if (
      ts.isPropertyAssignment(prop) ||
      ts.isShorthandPropertyAssignment(prop)
    ) {
      const propName = ts.isIdentifier(prop.name) ? prop.name.text : null
      if (!propName) {
        continue
      }

      let binding: OutputBinding | null = null

      if (ts.isShorthandPropertyAssignment(prop)) {
        // { orgId } - must be an output variable, context variable, or input
        const varName = prop.name.text
        if (context.outputVars.has(varName)) {
          binding = { from: 'outputVar', name: varName }
        } else if (context.contextVars.has(varName)) {
          binding = { from: 'stateVar', name: varName }
        } else {
          binding = { from: 'input', path: varName }
        }
      } else if (ts.isPropertyAssignment(prop)) {
        binding = extractOutputBinding(prop.initializer, context)
      }

      if (binding) {
        outputs[propName] = binding
      }
    } else if (
      ts.isSpreadAssignment(prop) &&
      ts.isIdentifier(prop.expression)
    ) {
      spread.push(prop.expression.text)
    }
  }

  if (Object.keys(outputs).length === 0 && spread.length === 0) {
    return null
  }

  return {
    type: 'return',
    outputs,
    ...(spread.length > 0 ? { spread } : {}),
  }
}

/**
 * Extract input sources from an argument node
 */
function extractInputSources(
  node: ts.Node,
  context: ExtractionContext
): Record<string, InputSource> | 'passthrough' | undefined {
  // Handle when data is passed directly (e.g., workflow.do('step', 'rpc', data))
  if (ts.isIdentifier(node)) {
    if (node.text === context.inputParamName) {
      // The entire input data is being passed through
      return 'passthrough'
    }
    // Check if it's an output variable being passed directly
    if (context.outputVars.has(node.text)) {
      return 'passthrough'
    }
  }

  if (!ts.isObjectLiteralExpression(node)) {
    return undefined
  }

  const inputs: Record<string, InputSource> = {}

  for (const prop of node.properties) {
    if (
      ts.isPropertyAssignment(prop) ||
      ts.isShorthandPropertyAssignment(prop)
    ) {
      const propName = ts.isIdentifier(prop.name) ? prop.name.text : null
      if (!propName) {
        continue
      }

      let source: InputSource | null = null

      if (ts.isShorthandPropertyAssignment(prop)) {
        // { email } - could be from loop var, output var, or input
        const varName = prop.name.text
        if (context.loopVars.has(varName)) {
          source = { from: 'item', path: varName }
        } else if (context.outputVars.has(varName)) {
          source = { from: 'outputVar', name: varName }
        } else {
          const constant = resolveConstantValue(prop.name, context.checker)
          source =
            constant !== undefined
              ? { from: 'literal', value: constant }
              : { from: 'input', path: varName }
        }
      } else if (ts.isPropertyAssignment(prop)) {
        source = extractInputSource(prop.initializer, context)
      }

      if (source) {
        inputs[propName] = source
      }
    }

    if (ts.isSpreadAssignment(prop)) {
      // Handle spread: { ...data }
      if (ts.isIdentifier(prop.expression)) {
        const varName = prop.expression.text
        if (varName === context.inputParamName) {
          // This is spreading the input data
          // We can't fully model this in v1, so we'll skip it
          continue
        }
      }
    }
  }

  return Object.keys(inputs).length > 0 ? inputs : undefined
}

function inputSourceToInlineValue(source: InputSource): unknown {
  switch (source.from) {
    case 'literal':
      return source.value
    case 'input':
      return { $ref: 'trigger', path: source.path }
    case 'outputVar':
      return { $ref: source.name, path: source.path }
    case 'item':
      return { $ref: '$item', path: source.path }
    case 'template':
      return {
        $template: {
          parts: source.parts,
          expressions: source.expressions.map(inputSourceToInlineValue),
        },
      }
  }
}

/**
 * Extract a single input source
 */
function extractInputSource(
  node: ts.Node,
  context: ExtractionContext
): InputSource | null {
  // Property access: data.email, org.id
  if (ts.isPropertyAccessExpression(node)) {
    const objExpr = node.expression
    const propName = node.name.text

    if (ts.isIdentifier(objExpr)) {
      const objName = objExpr.text

      if (objName === context.inputParamName) {
        return { from: 'input', path: propName }
      }

      // A field of the fanout item: users.map((u) => do(..., { id: u.id }))
      if (context.loopVars.has(objName)) {
        return { from: 'item', path: propName }
      }

      if (context.outputVars.has(objName)) {
        return { from: 'outputVar', name: objName, path: propName }
      }
    }
  }

  // Identifier: email, orgId
  if (ts.isIdentifier(node)) {
    const varName = node.text

    // Check if it's a loop variable (from fanout)
    if (context.loopVars.has(varName)) {
      return { from: 'item', path: varName }
    }

    if (context.outputVars.has(varName)) {
      return { from: 'outputVar', name: varName }
    }

    const constant = resolveConstantValue(node, context.checker)
    if (constant !== undefined) {
      return { from: 'literal', value: constant }
    }

    // Assume it's from input
    return { from: 'input', path: varName }
  }

  // Literal: "string", 123, true, false, null
  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    let value: unknown
    if (ts.isStringLiteral(node)) {
      value = node.text
    } else if (ts.isNumericLiteral(node)) {
      value = Number(node.text)
    } else if (node.kind === ts.SyntaxKind.TrueKeyword) {
      value = true
    } else if (node.kind === ts.SyntaxKind.FalseKeyword) {
      value = false
    } else if (node.kind === ts.SyntaxKind.NullKeyword) {
      value = null
    }
    return { from: 'literal', value }
  }

  // Object literal
  if (ts.isObjectLiteralExpression(node)) {
    const obj: Record<string, unknown> = {}
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const propName = prop.name.text
        const propSource = extractInputSource(prop.initializer, context)
        if (propSource) {
          obj[propName] = inputSourceToInlineValue(propSource)
        }
      }
    }
    return { from: 'literal', value: obj }
  }

  // Array literal
  if (ts.isArrayLiteralExpression(node)) {
    const arr: unknown[] = []
    for (const elem of node.elements) {
      const elemSource = extractInputSource(elem, context)
      if (elemSource) {
        arr.push(inputSourceToInlineValue(elemSource))
      }
    }
    return { from: 'literal', value: arr }
  }

  // No substitution template literal: `hello`
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    return { from: 'literal', value: node.text }
  }

  // Template expression with substitutions: `hello ${name}`
  if (ts.isTemplateExpression(node)) {
    const parts: string[] = [node.head.text]
    const expressions: InputSource[] = []

    for (const span of node.templateSpans) {
      // Extract each expression
      const exprSource = extractInputSource(span.expression, context)
      if (exprSource) {
        expressions.push(exprSource)
      } else {
        // Fallback: use source text as literal
        expressions.push({
          from: 'literal',
          value: getSourceText(span.expression),
        })
      }
      parts.push(span.literal.text)
    }

    return { from: 'template', parts, expressions }
  }

  return null
}

/**
 * Resolve an identifier that names a constant to the value it was declared with.
 *
 * Without this, a name the extractor does not recognise falls through to
 * `{ from: 'input' }` and is serialized as `{ $ref: 'trigger', path: <name> }` —
 * so a module-level `const RESOURCE_ID = 'x'` used as step input silently
 * becomes a read of a trigger field that does not exist. Only `const`
 * declarations with a fully literal initializer resolve; anything else (a name
 * bound out of the trigger, a computed value) falls through unchanged.
 */
function resolveConstantValue(
  node: ts.Identifier,
  checker: ts.TypeChecker
): unknown | undefined {
  const symbol = checker.getSymbolAtLocation(node)
  const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0]
  if (!declaration || !ts.isVariableDeclaration(declaration)) {
    return undefined
  }
  const declarationList = declaration.parent
  if (
    !ts.isVariableDeclarationList(declarationList) ||
    !(declarationList.flags & ts.NodeFlags.Const)
  ) {
    return undefined
  }
  return declaration.initializer
    ? extractLiteralValue(declaration.initializer)
    : undefined
}

/**
 * Extract a literal value from an expression
 */
function extractLiteralValue(expr: ts.Expression): unknown | undefined {
  if (ts.isStringLiteral(expr)) {
    return expr.text
  }
  if (ts.isNumericLiteral(expr)) {
    return Number(expr.text)
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }
  if (expr.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }
  if (expr.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }
  // Array literal
  if (ts.isArrayLiteralExpression(expr)) {
    const values: unknown[] = []
    for (const el of expr.elements) {
      const v = extractLiteralValue(el)
      if (v === undefined) return undefined
      values.push(v)
    }
    return values
  }
  // Object literal (simple keys with literal values)
  if (ts.isObjectLiteralExpression(expr)) {
    const obj: Record<string, unknown> = {}
    for (const prop of expr.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const v = extractLiteralValue(prop.initializer)
        if (v === undefined) return undefined
        obj[prop.name.text] = v
      } else {
        return undefined
      }
    }
    return obj
  }
  return undefined
}

/**
 * Infer a simple type string from a TypeScript type
 */
function inferSimpleType(type: ts.Type, checker: ts.TypeChecker): string {
  const typeStr = checker.typeToString(type)
  if (typeStr === 'string') return 'string'
  if (typeStr === 'number') return 'number'
  if (typeStr === 'boolean') return 'boolean'
  if (typeStr.endsWith('[]') || typeStr.startsWith('Array<')) return 'array'
  return 'object'
}
