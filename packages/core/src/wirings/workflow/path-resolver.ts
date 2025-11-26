/**
 * Path resolver for workflow graph input references.
 * Resolves paths like 'createOrg_1.output.orgId' to actual values.
 */

import type { InputValue, NodeExecutionResult } from './workflow-graph.types.js'

/**
 * Parsed path segment
 */
type PathSegment =
  | { type: 'property'; name: string }
  | { type: 'index'; index: number }

/**
 * Parse a path string into segments.
 * Supports dot notation and array indexing: 'node_1.output.users[0].name'
 *
 * @param path - The path string to parse
 * @returns Array of path segments
 */
export function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = []
  let current = ''
  let i = 0

  while (i < path.length) {
    const char = path[i]

    if (char === '.') {
      if (current) {
        segments.push({ type: 'property', name: current })
        current = ''
      }
      i++
    } else if (char === '[') {
      if (current) {
        segments.push({ type: 'property', name: current })
        current = ''
      }
      // Find closing bracket
      const closeBracket = path.indexOf(']', i)
      if (closeBracket === -1) {
        throw new Error(`Invalid path: missing closing bracket in '${path}'`)
      }
      const indexStr = path.slice(i + 1, closeBracket)
      const index = parseInt(indexStr, 10)
      if (isNaN(index)) {
        throw new Error(
          `Invalid path: non-numeric array index '${indexStr}' in '${path}'`
        )
      }
      segments.push({ type: 'index', index })
      i = closeBracket + 1
    } else {
      current += char
      i++
    }
  }

  if (current) {
    segments.push({ type: 'property', name: current })
  }

  return segments
}

/**
 * Traverse an object using parsed path segments.
 *
 * @param obj - The object to traverse
 * @param segments - The path segments
 * @returns The value at the path, or undefined if not found
 */
export function traversePath(obj: unknown, segments: PathSegment[]): unknown {
  let current: unknown = obj

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (segment.type === 'property') {
      if (typeof current !== 'object') {
        return undefined
      }
      current = (current as Record<string, unknown>)[segment.name]
    } else {
      // index
      if (!Array.isArray(current)) {
        return undefined
      }
      current = current[segment.index]
    }
  }

  return current
}

/**
 * Resolve a path string to a value.
 *
 * @param path - The path string (e.g., 'node_1.output.field')
 * @param obj - The object to resolve against
 * @returns The resolved value
 */
export function resolvePath(path: string, obj: unknown): unknown {
  const segments = parsePath(path)
  return traversePath(obj, segments)
}

/**
 * Context for resolving input values in a workflow graph.
 */
export interface PathResolverContext {
  /** Results from completed node instances, keyed by instance ID */
  completed: Map<string, NodeExecutionResult>
  /** Trigger/workflow input data */
  triggerInput: unknown
}

/**
 * Resolve an InputValue to an actual value.
 *
 * For literal values, returns the value directly.
 * For ref values, resolves the path against the context.
 *
 * Path format: 'instanceId.output.field' or 'instanceId.error.message'
 *
 * @param input - The input value to resolve
 * @param context - The resolution context with completed nodes
 * @returns The resolved value
 */
export function resolveInputValue(
  input: InputValue,
  context: PathResolverContext
): unknown {
  if (input.type === 'literal') {
    return input.value
  }

  // Parse the path: first segment is the instance ID
  const segments = parsePath(input.path)
  if (segments.length === 0) {
    throw new Error(`Invalid path: empty path`)
  }

  const firstSegment = segments[0]
  if (firstSegment.type !== 'property') {
    throw new Error(`Invalid path: must start with instance ID`)
  }

  const instanceId = firstSegment.name
  const remaining = segments.slice(1)

  // Get the result for this instance
  const result = context.completed.get(instanceId)
  if (!result) {
    throw new Error(
      `Cannot resolve path '${input.path}': instance '${instanceId}' not found or not completed`
    )
  }

  // If no remaining segments, return the full result
  if (remaining.length === 0) {
    return result
  }

  // Check what we're accessing: output or error
  const accessType = remaining[0]
  if (accessType.type !== 'property') {
    throw new Error(
      `Invalid path '${input.path}': expected 'output' or 'error' after instance ID`
    )
  }

  if (accessType.name === 'output') {
    const outputPath = remaining.slice(1)
    if (outputPath.length === 0) {
      return result.output
    }
    return traversePath(result.output, outputPath)
  } else if (accessType.name === 'error') {
    const errorPath = remaining.slice(1)
    if (errorPath.length === 0) {
      return result.error
    }
    return traversePath(result.error, errorPath)
  } else {
    throw new Error(
      `Invalid path '${input.path}': expected 'output' or 'error', got '${accessType.name}'`
    )
  }
}

/**
 * Resolve all inputs for a node instance.
 *
 * @param inputs - Record of input name to InputValue
 * @param context - The resolution context
 * @returns Record of input name to resolved value
 */
export function resolveInputs(
  inputs: Record<string, InputValue>,
  context: PathResolverContext
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  for (const [name, input] of Object.entries(inputs)) {
    resolved[name] = resolveInputValue(input, context)
  }

  return resolved
}

/**
 * Validate that a path can be resolved (for graph validation).
 * Does not resolve the value, just checks the path format.
 *
 * @param path - The path string to validate
 * @returns Object with valid flag and optional error message
 */
export function validatePath(path: string): { valid: boolean; error?: string } {
  try {
    const segments = parsePath(path)
    if (segments.length === 0) {
      return { valid: false, error: 'Empty path' }
    }

    const firstSegment = segments[0]
    if (firstSegment.type !== 'property') {
      return { valid: false, error: 'Path must start with instance ID' }
    }

    if (segments.length > 1) {
      const accessType = segments[1]
      if (
        accessType.type !== 'property' ||
        (accessType.name !== 'output' && accessType.name !== 'error')
      ) {
        return {
          valid: false,
          error: "Expected 'output' or 'error' after instance ID",
        }
      }
    }

    return { valid: true }
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
