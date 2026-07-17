/**
 * Generates the main pikku-types.gen.ts file as a re-export hub
 */
export const serializePikkuTypesHub = (
  functionTypesImportPath: string,
  httpTypesImportPath: string | null,
  channelTypesImportPath: string | null,
  triggerTypesImportPath: string | null,
  schedulerTypesImportPath: string | null,
  queueTypesImportPath: string | null,
  mcpTypesImportPath: string | null,
  cliTypesImportPath: string | null,
  nodeTypesImportPath: string | null,
  secretTypesImportPath: string | null,
  addonTypesImportPath: string | null,
  authTypesImportPath: string | null = null,
  scopeTypesImportPath: string | null = null
) => {
  const exports = [
    {
      comment: 'Core function, middleware, and permission types',
      path: functionTypesImportPath,
    },
    { comment: 'HTTP wiring types', path: httpTypesImportPath },
    { comment: 'Channel wiring types', path: channelTypesImportPath },
    { comment: 'Trigger wiring types', path: triggerTypesImportPath },
    { comment: 'Scheduler wiring types', path: schedulerTypesImportPath },
    { comment: 'Queue wiring types', path: queueTypesImportPath },
    { comment: 'MCP wiring types', path: mcpTypesImportPath },
    { comment: 'CLI wiring types', path: cliTypesImportPath },
    { comment: 'Node wiring types', path: nodeTypesImportPath },
    { comment: 'Secret definition types', path: secretTypesImportPath },
    { comment: 'Scope definition types', path: scopeTypesImportPath },
    { comment: 'Addon types', path: addonTypesImportPath },
    {
      comment: 'Auth types (typed pikkuBetterAuth re-export)',
      path: authTypesImportPath,
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
