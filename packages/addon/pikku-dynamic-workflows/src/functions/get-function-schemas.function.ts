import { pikkuSessionlessFunc } from '#pikku'
import {
  resolveToolMeta,
  formatSchemaType,
  collectOutputPaths,
} from '../utils/resolve-tool-meta.js'

export const getFunctionSchemas = pikkuSessionlessFunc<
  { names: string[] },
  { details: string }
>({
  expose: true,
  description:
    'Resolves input/output JSON schemas for the given function names',
  func: async ({}, { names }) => {
    const lines: string[] = []

    for (const name of names) {
      const meta = resolveToolMeta(name)
      if (!meta) {
        lines.push(`**${name}** — not found`)
        continue
      }

      const { fnMeta, schemas } = meta
      const inputSchema = fnMeta.inputSchemaName
        ? schemas.get(fnMeta.inputSchemaName)
        : null
      const outputSchema = fnMeta.outputSchemaName
        ? schemas.get(fnMeta.outputSchemaName)
        : null

      const inputProps = inputSchema?.properties
        ? Object.entries(inputSchema.properties)
            .map(
              ([k, v]: [string, any]) =>
                `${k}${inputSchema.required?.includes(k) ? '' : '?'}: ${formatSchemaType(v)}`
            )
            .join(', ')
        : ''
      const outputPaths = outputSchema ? collectOutputPaths(outputSchema) : []

      lines.push(
        `**${name}**\n` +
          `  input: {${inputProps}}\n` +
          (outputPaths.length > 0
            ? `  output paths: ${outputPaths.join(', ')}`
            : `  output: void`)
      )
    }

    return { details: lines.join('\n') }
  },
})
