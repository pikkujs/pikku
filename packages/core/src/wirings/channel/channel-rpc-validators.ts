import type { CoreSingletonServices } from '../../types/core.types.js'
import { pikkuState } from '../../pikku-state.js'
import { validateSchema } from '../../schema.js'
import type { ChannelRPCValidator } from './channel-rpc.types.js'

/**
 * A name with no function metadata is left alone: it is a capability this app
 * never declared a contract for, and failing it would break callers that
 * deliberately treat the value as opaque.
 */
const createChannelRPCSchemaValidator =
  (
    key: 'inputSchemaName' | 'outputSchemaName',
    singletonServices: Pick<CoreSingletonServices, 'logger' | 'schema'>,
    packageName: string | null = null
  ): ChannelRPCValidator =>
  async (funcName: string, value: unknown): Promise<void> => {
    const pikkuFuncId = pikkuState(packageName, 'rpc', 'meta')[funcName]
    if (!pikkuFuncId) {
      return
    }
    const schemaName = pikkuState(packageName, 'function', 'meta')[
      pikkuFuncId
    ]?.[key]
    if (!schemaName) {
      return
    }
    await validateSchema(
      singletonServices.logger,
      singletonServices.schema,
      schemaName,
      value,
      packageName
    )
  }

/**
 * Checks a capability's answer against the schema codegen generated from its
 * declared return type — the same one an agent tool or an HTTP response is
 * checked against.
 */
export const createChannelRPCResultValidator = (
  singletonServices: Pick<CoreSingletonServices, 'logger' | 'schema'>,
  packageName: string | null = null
): ChannelRPCValidator =>
  createChannelRPCSchemaValidator(
    'outputSchemaName',
    singletonServices,
    packageName
  )

/**
 * Checks outbound arguments against the declared input type. Unlike the result
 * check this is not a boundary — it catches version drift, where a server built
 * against a newer capability signature calls a client that predates it.
 */
export const createChannelRPCInputValidator = (
  singletonServices: Pick<CoreSingletonServices, 'logger' | 'schema'>,
  packageName: string | null = null
): ChannelRPCValidator =>
  createChannelRPCSchemaValidator(
    'inputSchemaName',
    singletonServices,
    packageName
  )
