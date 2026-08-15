export interface PikkuTypesHubPaths {
  functionTypesImportPath: string
  httpTypesImportPath: string | null
  channelTypesImportPath: string | null
  triggerTypesImportPath: string | null
  schedulerTypesImportPath: string | null
  queueTypesImportPath: string | null
  mcpTypesImportPath: string | null
  cliTypesImportPath: string | null
  secretTypesImportPath: string | null
  credentialTypesImportPath: string | null
  variableTypesImportPath: string | null
  scopeTypesImportPath: string | null
  addonTypesImportPath: string | null
  authTypesImportPath: string | null
}

/**
 * Generates the main pikku-types.gen.ts file as a re-export hub
 */
export const serializePikkuTypesHub = (paths: PikkuTypesHubPaths) => {
  const exports = [
    {
      comment: 'Core function, middleware, and permission types',
      path: paths.functionTypesImportPath,
    },
    { comment: 'HTTP wiring types', path: paths.httpTypesImportPath },
    { comment: 'Channel wiring types', path: paths.channelTypesImportPath },
    { comment: 'Trigger wiring types', path: paths.triggerTypesImportPath },
    { comment: 'Scheduler wiring types', path: paths.schedulerTypesImportPath },
    { comment: 'Queue wiring types', path: paths.queueTypesImportPath },
    { comment: 'MCP wiring types', path: paths.mcpTypesImportPath },
    { comment: 'CLI wiring types', path: paths.cliTypesImportPath },
    { comment: 'Secret definition types', path: paths.secretTypesImportPath },
    {
      comment: 'Credential definition types',
      path: paths.credentialTypesImportPath,
    },
    {
      comment: 'Variable definition types',
      path: paths.variableTypesImportPath,
    },
    { comment: 'Scope definition types', path: paths.scopeTypesImportPath },
    { comment: 'Addon types', path: paths.addonTypesImportPath },
    {
      comment: 'Auth types (typed pikkuBetterAuth re-export)',
      path: paths.authTypesImportPath,
    },
  ]

  const exportStatements = exports
    .filter((e) => e.path)
    .map((e) => `// ${e.comment}\nexport * from '${e.path}'`)
    .join('\n\n')

  return `/**
 * Main type export hub - re-exports all wiring-specific types
 */

${exportStatements}
`
}
