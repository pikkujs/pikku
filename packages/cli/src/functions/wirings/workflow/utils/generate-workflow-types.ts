import { InspectorState } from '@pikku/inspector'
import { checkRequiredTypes } from '../../../../utils/check-required-types.js'
import { getFileImportRelativePath } from '../../../../utils/file-import-path.js'
import { serializeWorkflowTypes } from '../serialize-workflow-types.js'

/**
 * Generates workflow types by extracting required types from inspector state
 * and computing import paths for user session, singleton services, and RPC map.
 *
 * @param inspectorState - The inspector state containing type information
 * @param config - Configuration object with file paths and package mappings
 * @returns Serialized workflow types as a string
 */
export const generateWorkflowTypes = (
  inspectorState: InspectorState,
  config: {
    workflowTypesFile: string
    functionTypesFile: string
    rpcInternalMapDeclarationFile: string
    packageMappings: Record<string, string>
  }
): string => {
  // Check for required types
  checkRequiredTypes(inspectorState.filesAndMethodsErrors, {
    userSessionType: true,
    sessionServiceType: true,
    singletonServicesType: true,
    singletonServicesFactory: false,
    sessionServicesFactory: false,
  })

  const { userSessionType, singletonServicesType } =
    inspectorState.filesAndMethods

  if (!userSessionType || !singletonServicesType) {
    throw new Error('Required types not found')
  }

  const functionTypesImportPath = getFileImportRelativePath(
    config.workflowTypesFile,
    config.functionTypesFile,
    config.packageMappings
  )

  const userSessionImportPath = getFileImportRelativePath(
    config.workflowTypesFile,
    userSessionType.typePath,
    config.packageMappings
  )

  const singletonServicesImportPath = getFileImportRelativePath(
    config.workflowTypesFile,
    singletonServicesType.typePath,
    config.packageMappings
  )

  const rpcMapImportPath = getFileImportRelativePath(
    config.workflowTypesFile,
    config.rpcInternalMapDeclarationFile,
    config.packageMappings
  )

  return serializeWorkflowTypes(
    functionTypesImportPath,
    userSessionImportPath,
    userSessionType.type,
    singletonServicesImportPath,
    singletonServicesType.type,
    rpcMapImportPath
  )
}
