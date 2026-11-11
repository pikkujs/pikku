import {
  AgentOutputValidationError,
  UnprocessableContentError,
} from '../../errors/errors.js'
import { getSingletonServices, pikkuState } from '../../pikku-state.js'
import { validateSchema } from '../../schema.js'

type JSONSchemaNode = {
  type?: string | string[]
  properties?: Record<string, JSONSchemaNode>
  required?: string[]
  items?: JSONSchemaNode
  anyOf?: JSONSchemaNode[]
  oneOf?: JSONSchemaNode[]
}

const allowsNull = (schema: JSONSchemaNode | undefined): boolean => {
  if (!schema) return true
  if (schema.type === 'null') return true
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true
  return [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some(allowsNull)
}

/**
 * Removes the `null`s a provider sends for optional fields.
 *
 * Strict structured-output modes (OpenAI's among them) require every property,
 * so a runner widens each optional one to nullable and the model answers
 * `null` for "absent". Validating that against the schema the agent declared —
 * where the field is optional, not nullable — would reject a valid answer, so
 * a `null` is dropped wherever the original schema neither requires the field
 * nor allows `null` for it. Anything else is left for validation to judge.
 */
export const dropNullOptionals = (schema: unknown, value: unknown): unknown => {
  const node = schema as JSONSchemaNode | undefined
  if (!node || typeof node !== 'object' || value === null) return value
  if (Array.isArray(value)) {
    return node.items
      ? value.map((item) => dropNullOptionals(node.items, item))
      : value
  }
  if (typeof value !== 'object' || !node.properties) return value

  const required = new Set(node.required ?? [])
  const result: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value)) {
    const fieldSchema = node.properties[key]
    if (field === null && !required.has(key) && !allowsNull(fieldSchema)) {
      continue
    }
    result[key] = dropNullOptionals(fieldSchema, field)
  }
  return result
}

// knowledge: decisions/internals/agent-structured-output-is-validated-against-the-declared-schema.md
/**
 * Checks a `pikkuAgent`'s structured output against the output schema it was
 * declared with, which codegen compiled to JSON Schema under `schemaName`.
 *
 * Returns the object with provider `null`s for optional fields removed; throws
 * `AgentOutputValidationError` when it does not match. No object — the run
 * ended on text — is returned as is.
 */
export const validateAgentOutput = async (
  agentName: string,
  schemaName: string | null | undefined,
  object: unknown,
  packageName: string | null = null
): Promise<unknown> => {
  if (!schemaName || object === undefined) return object
  const normalized = dropNullOptionals(
    pikkuState(packageName, 'misc', 'schemas').get(schemaName),
    object
  )
  const { logger, schema } = getSingletonServices()
  try {
    await validateSchema(logger, schema, schemaName, normalized, packageName)
  } catch (error) {
    if (error instanceof UnprocessableContentError) {
      throw new AgentOutputValidationError(agentName, [error.message])
    }
    throw error
  }
  return normalized
}
