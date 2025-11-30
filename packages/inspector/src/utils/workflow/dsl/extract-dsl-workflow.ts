import * as ts from 'typescript'
import {
  WorkflowStepMeta,
  RpcStepMeta,
  BranchStepMeta,
  ParallelGroupStepMeta,
  FanoutStepMeta,
  ReturnStepMeta,
  CancelStepMeta,
  SetStepMeta,
  SwitchStepMeta,
  SwitchCaseMeta,
  FilterStepMeta,
  ArrayPredicateStepMeta,
  InputSource,
  OutputBinding,
  Condition,
  WorkflowContext,
  ContextVariable,
} from '@pikku/core/workflow'
import {
  isWorkflowDoCall,
  isWorkflowSleepCall,
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
} from './patterns.js'
import {
  validateNoDisallowedPatterns,
  validateAwaitedCalls,
  formatValidationErrors,
  ValidationError,
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
  inputParamName: string
  errors: ValidationError[]
  /** Loop variables in scope (for fanout item variables) */
  loopVars: Set<string>
  /** Context variables (top-level let/const with simple values) */
  contextVars: Map<string, { type: string; default: unknown }>
  /** Track nesting depth to detect block-scoped vars */
  depth: number
}

/**
 * Extract full source path from an expression (e.g., data.memberEmails)
 */
function extractSourcePath(expr: ts.Expression): string | null {
  if (ts.isIdentifier(expr)) {
    return expr.text
  }

  if (ts.isPropertyAccessExpression(expr)) {
    const base = extractSourcePath(expr.expression)
    if (base) {
      return `${base}.${expr.name.text}`
    }
  }

  return null
}

/**
 * Result of simple workflow extraction
 */
export interface ExtractionResult {
  status: 'ok' | 'error'
  steps?: WorkflowStepMeta[]
  /** Workflow context (top-level variables) */
  context?: WorkflowContext
  reason?: string
  simple?: boolean
}

/**
 * Extract simple workflow metadata from a function declaration
 */
export function extractDSLWorkflow(
  funcNode: ts.Node,
  checker: ts.TypeChecker
): ExtractionResult {
  try {
    // Find the async arrow function
    const arrowFunc = findWorkflowFunction(funcNode)
    if (!arrowFunc) {
      return {
        status: 'error',
        reason: 'Could not find async arrow function in workflow definition',
        simple: false,
      }
    }

    // Extract input parameter name (second parameter)
    const inputParamName = extractInputParamName(arrowFunc)
    if (!inputParamName) {
      return {
        status: 'error',
        reason: 'Could not determine input parameter name',
        simple: false,
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
    const patternErrors = validateNoDisallowedPatterns(arrowFunc.body)
    if (patternErrors.length > 0) {
      return {
        status: 'error',
        reason: formatValidationErrors(patternErrors),
        simple: false,
      }
    }

    // Validate all workflow calls are awaited
    const awaitErrors = validateAwaitedCalls(arrowFunc.body)
    if (awaitErrors.length > 0) {
      return {
        status: 'error',
        reason: formatValidationErrors(awaitErrors),
        simple: false,
      }
    }

    // Extract steps from function body
    const steps = extractSteps(arrowFunc.body, context)

    // Check for any accumulated errors
    if (context.errors.length > 0) {
      return {
        status: 'error',
        reason: formatValidationErrors(context.errors),
        simple: false,
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
      simple: true,
    }
  } catch (error) {
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : String(error),
      simple: false,
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
 * Extract the input parameter name from the arrow function
 */
function extractInputParamName(arrowFunc: ts.ArrowFunction): string | null {
  if (arrowFunc.parameters.length < 2) {
    return null
  }

  const secondParam = arrowFunc.parameters[1]
  if (ts.isIdentifier(secondParam.name)) {
    return secondParam.name.text
  }

  return null
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
    return extractSequentialFanout(statement, context)
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
    return null
  }

  const decl = declList.declarations[0]
  if (!ts.isIdentifier(decl.name)) {
    return null
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
    if (isWorkflowDoCall(call, context.checker)) {
      const step = extractRpcStep(call, context, varName)
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
      if (context.contextVars.has(outputVar)) {
        const literalValue = extractLiteralValue(expr.right)
        if (literalValue !== undefined) {
          return {
            type: 'set',
            variable: outputVar,
            value: literalValue,
          } as SetStepMeta
        }
        // Non-literal assignment to context var - use expression as string
        return {
          type: 'set',
          variable: outputVar,
          value: getSourceText(expr.right),
        } as SetStepMeta
      }
    }
    // Use right side as the expression to extract from
    expr = expr.right
  }

  // await workflow.do(...)
  if (ts.isAwaitExpression(expr) && ts.isCallExpression(expr.expression)) {
    const call = expr.expression

    if (isWorkflowDoCall(call, context.checker)) {
      const step = extractRpcStep(call, context, outputVar)

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

    // Extract options from fourth argument
    const options =
      args.length >= 4 && ts.isObjectLiteralExpression(args[3])
        ? extractStepOptions(args[3], context)
        : undefined

    return {
      type: 'rpc',
      stepName,
      rpcName,
      outputVar,
      inputs,
      options,
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
      duration = extractStringLiteral(args[1], context.checker)
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

  // Extract workflow.do call from map body
  let doCall: ts.CallExpression | null = null

  if (ts.isCallExpression(mapFn.body)) {
    doCall = mapFn.body
  } else if (ts.isAwaitExpression(mapFn.body)) {
    // Handle: async (email) => await workflow.do(...)
    if (ts.isCallExpression(mapFn.body.expression)) {
      doCall = mapFn.body.expression
    }
  } else if (ts.isBlock(mapFn.body)) {
    // Look for workflow.do in block
    for (const stmt of mapFn.body.statements) {
      if (ts.isReturnStatement(stmt) && stmt.expression) {
        if (ts.isCallExpression(stmt.expression)) {
          doCall = stmt.expression
          break
        } else if (ts.isAwaitExpression(stmt.expression)) {
          // Handle: return await workflow.do(...)
          if (ts.isCallExpression(stmt.expression.expression)) {
            doCall = stmt.expression.expression
            break
          }
        }
      }
    }
  }

  if (!doCall || !isWorkflowDoCall(doCall, context.checker)) {
    return null
  }

  // Create a temporary context for the child step with the loop variable
  const childContext: ExtractionContext = {
    ...context,
    outputVars: new Map(context.outputVars),
    loopVars: new Set([...context.loopVars, itemVar]),
  }

  const childStep = extractRpcStep(doCall, childContext)
  if (!childStep) {
    return null
  }

  return {
    type: 'fanout',
    stepName: childStep.stepName,
    sourceVar,
    itemVar,
    mode: 'parallel',
    child: childStep,
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

  const children: RpcStepMeta[] = []

  for (const elem of arrayArg.elements) {
    if (ts.isCallExpression(elem) && isWorkflowDoCall(elem, context.checker)) {
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
function extractSequentialFanout(
  statement: ts.ForOfStatement,
  context: ExtractionContext
): FanoutStepMeta | null {
  if (!isSequentialFanout(statement)) {
    return null
  }

  const vars = extractForOfVariable(statement)
  if (!vars) {
    return null
  }

  const { itemVar, sourceVar } = vars

  // Extract child step and optional sleep from loop body
  if (!ts.isBlock(statement.statement)) {
    return null
  }

  let childStep: RpcStepMeta | null = null
  let timeBetween: string | undefined = undefined

  // Create a child context with the loop variable added
  const childContext: ExtractionContext = {
    ...context,
    outputVars: new Map(context.outputVars),
    loopVars: new Set([...context.loopVars, itemVar]),
  }

  let workflowDoCount = 0

  for (const stmt of statement.statement.statements) {
    // Look for workflow.do in VariableStatement (const x = await workflow.do(...))
    if (ts.isVariableStatement(stmt)) {
      const declList = stmt.declarationList
      if (declList.declarations.length === 1) {
        const decl = declList.declarations[0]
        const init = decl.initializer
        if (
          init &&
          ts.isAwaitExpression(init) &&
          ts.isCallExpression(init.expression)
        ) {
          const call = init.expression
          if (isWorkflowDoCall(call, context.checker)) {
            workflowDoCount++
            const varName = ts.isIdentifier(decl.name)
              ? decl.name.text
              : undefined
            const step = extractRpcStep(call, childContext, varName)
            if (step) {
              childStep = step
            }
          }
        }
      }
    }

    // Look for workflow.do in ExpressionStatement (await workflow.do(...))
    if (ts.isExpressionStatement(stmt)) {
      const expr = stmt.expression

      if (ts.isAwaitExpression(expr) && ts.isCallExpression(expr.expression)) {
        const call = expr.expression

        if (isWorkflowDoCall(call, context.checker)) {
          workflowDoCount++
          const step = extractRpcStep(call, childContext)
          if (step) {
            childStep = step
          }
        }

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

  if (!childStep) {
    return null
  }

  // If there are multiple workflow.do calls, the loop is too complex for DSL
  if (workflowDoCount > 1) {
    context.errors.push({
      message: `For-of loop has ${workflowDoCount} workflow.do calls but DSL only supports 1. Use pikkuWorkflowComplexFunc for complex loops.`,
      node: statement,
    })
    return null
  }

  return {
    type: 'fanout',
    stepName: childStep.stepName,
    sourceVar,
    itemVar,
    mode: 'sequential',
    child: childStep,
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
): ReturnStepMeta | null {
  if (!statement.expression) {
    return null
  }

  if (!ts.isObjectLiteralExpression(statement.expression)) {
    return null
  }

  const outputs: Record<string, OutputBinding> = {}

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
    }
  }

  if (Object.keys(outputs).length === 0) {
    return null
  }

  return {
    type: 'return',
    outputs,
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
          source = { from: 'input', path: varName }
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
        if (propSource && propSource.from === 'literal') {
          obj[propName] = propSource.value
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
      if (elemSource && elemSource.from === 'literal') {
        arr.push(elemSource.value)
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
