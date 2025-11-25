/**
 * Generates the main pikku-types.gen.ts file as a re-export hub
 */
export const serializePikkuTypesHub = (
  functionTypesImportPath: string,
  httpTypesImportPath: string | null,
  channelTypesImportPath: string | null,
  schedulerTypesImportPath: string | null,
  queueTypesImportPath: string | null,
  mcpTypesImportPath: string | null,
  cliTypesImportPath: string | null
) => {
  const exports = [
    {
      comment: 'Core function, middleware, and permission types',
      path: functionTypesImportPath,
    },
    { comment: 'HTTP wiring types', path: httpTypesImportPath },
    { comment: 'Channel wiring types', path: channelTypesImportPath },
    { comment: 'Scheduler wiring types', path: schedulerTypesImportPath },
    { comment: 'Queue wiring types', path: queueTypesImportPath },
    { comment: 'MCP wiring types', path: mcpTypesImportPath },
    { comment: 'CLI wiring types', path: cliTypesImportPath },
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
