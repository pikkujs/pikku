/**
 * Utility functions to strip verbose/visualization-only fields from meta objects
 * for creating minimal runtime-only versions.
 *
 * Verbose fields are those used for UI/visualization but not needed at runtime:
 * - tags, description, summary, errors
 * - title, displayName
 * - middleware, permissions (metadata for display)
 * - usedWires, isDirectFunction, services
 * - stepName (in workflow nodes)
 *
 * IMPORTANT: We only strip verbose fields at the direct meta entry level.
 * For most meta types (HTTP, Queue, Scheduler, etc.), entries have pikkuFuncName.
 * For workflow graphs, we strip at the root level AND from nodes.
 * We do NOT strip from deeply nested structures like CLI options where 'description' is required.
 */

const VERBOSE_FIELDS = new Set([
  'tags',
  'description',
  'summary',
  'errors',
  'title',
  'displayName',
  'middleware',
  'permissions',
  'usedWires',
  'isDirectFunction',
  'services',
])

/**
 * Fields that are verbose only at the node level (workflow nodes)
 */
const NODE_VERBOSE_FIELDS = new Set(['stepName'])

/**
 * Strip verbose fields from an object (shallow - only direct properties)
 */
function stripVerboseShallow<T>(obj: T, additionalFields?: Set<string>): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj !== 'object' ||
    Array.isArray(obj)
  ) {
    return obj
  }

  const result: Record<string, unknown> = {}
  const fieldsToStrip = additionalFields
    ? new Set([...VERBOSE_FIELDS, ...additionalFields])
    : VERBOSE_FIELDS

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (fieldsToStrip.has(key)) {
      continue
    }
    result[key] = value
  }

  return result as T
}

/**
 * Check if an object has any verbose fields (shallow check)
 */
function hasVerboseShallow(
  obj: unknown,
  additionalFields?: Set<string>
): boolean {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj !== 'object' ||
    Array.isArray(obj)
  ) {
    return false
  }

  const fieldsToCheck = additionalFields
    ? new Set([...VERBOSE_FIELDS, ...additionalFields])
    : VERBOSE_FIELDS

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (fieldsToCheck.has(key) && value !== undefined) {
      return true
    }
  }

  return false
}

/**
 * Strip verbose fields from a meta object.
 *
 * Handles different meta structure patterns:
 * 1. Single workflow graph: { name, pikkuFuncName, nodes: {...}, description, tags }
 *    -> Strips description, tags at root; strips stepName from each node
 * 2. Record of meta entries: { "entryName": { pikkuFuncName, description, tags, ... } }
 *    -> Strips description, tags from each entry (one level deep only)
 * 3. CLI meta and others with complex nesting: preserved as-is except for pikkuFuncName entries
 */
export function stripVerboseFields<T>(obj: T): T {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj
  }

  if (Array.isArray(obj)) {
    // Array of entries - strip from each
    return obj.map((item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        'pikkuFuncName' in (item as Record<string, unknown>)
      ) {
        return stripVerboseShallow(item)
      }
      return item
    }) as T
  }

  const objRecord = obj as Record<string, unknown>

  // Case 1: Single workflow graph (has 'nodes' and 'pikkuFuncName' at root)
  if ('nodes' in objRecord && 'pikkuFuncName' in objRecord) {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(objRecord)) {
      if (VERBOSE_FIELDS.has(key)) {
        continue
      }

      if (key === 'nodes' && typeof value === 'object' && value !== null) {
        // Strip stepName from each node
        const nodes: Record<string, unknown> = {}
        for (const [nodeId, node] of Object.entries(
          value as Record<string, unknown>
        )) {
          nodes[nodeId] = stripVerboseShallow(node, NODE_VERBOSE_FIELDS)
        }
        result[key] = nodes
      } else {
        result[key] = value
      }
    }

    return result as T
  }

  // Case 2: Record of meta entries (each entry has pikkuFuncName)
  // Only strip at exactly one level deep - the immediate children
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(objRecord)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const valueObj = value as Record<string, unknown>
      // Only strip from entries that look like meta entries (have pikkuFuncName)
      if ('pikkuFuncName' in valueObj) {
        result[key] = stripVerboseShallow(value)
      } else {
        // Keep nested structures as-is (e.g., CLI programs, options)
        result[key] = value
      }
    } else {
      result[key] = value
    }
  }

  return result as T
}

/**
 * Check if an object has any verbose fields that would be stripped
 */
export function hasVerboseFields(obj: unknown): boolean {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return false
  }

  if (Array.isArray(obj)) {
    return obj.some((item) => {
      if (
        typeof item === 'object' &&
        item !== null &&
        'pikkuFuncName' in (item as Record<string, unknown>)
      ) {
        return hasVerboseShallow(item)
      }
      return false
    })
  }

  const objRecord = obj as Record<string, unknown>

  // Case 1: Single workflow graph
  if ('nodes' in objRecord && 'pikkuFuncName' in objRecord) {
    // Check root level
    if (hasVerboseShallow(objRecord)) {
      return true
    }
    // Check nodes for stepName
    const nodes = objRecord.nodes
    if (typeof nodes === 'object' && nodes !== null) {
      for (const node of Object.values(nodes as Record<string, unknown>)) {
        if (hasVerboseShallow(node, NODE_VERBOSE_FIELDS)) {
          return true
        }
      }
    }
    return false
  }

  // Case 2: Record of meta entries
  for (const value of Object.values(objRecord)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const valueObj = value as Record<string, unknown>
      if ('pikkuFuncName' in valueObj && hasVerboseShallow(value)) {
        return true
      }
    }
  }

  return false
}

/**
 * Write both minimal and verbose meta files
 * Only writes verbose file if it differs from minimal
 *
 * @returns Object with paths that were written
 */
export async function writeMetaFiles(
  writeFile: (path: string, content: string) => Promise<void>,
  basePath: string,
  meta: unknown
): Promise<{ minimal: string; verbose?: string }> {
  const minimalMeta = stripVerboseFields(meta)
  const minimalPath = basePath.replace(/\.gen\.json$/, '.gen.json')
  const verbosePath = basePath.replace(/\.gen\.json$/, '-verbose.gen.json')

  // Always write minimal
  await writeFile(minimalPath, JSON.stringify(minimalMeta, null, 2))

  // Only write verbose if it has additional fields
  if (hasVerboseFields(meta)) {
    await writeFile(verbosePath, JSON.stringify(meta, null, 2))
    return { minimal: minimalPath, verbose: verbosePath }
  }

  return { minimal: minimalPath }
}
